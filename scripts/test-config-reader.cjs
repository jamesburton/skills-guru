'use strict';

/**
 * Test suite for config-reader.cjs
 * Run with: node test-config-reader.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function assertEqual(actual, expected, msg) {
  assert.strictEqual(actual, expected,
    msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(val, msg) {
  assert.ok(val, msg || `Expected truthy, got ${JSON.stringify(val)}`);
}

function assertFalse(val, msg) {
  assert.ok(!val, msg || `Expected falsy, got ${JSON.stringify(val)}`);
}

// ─── Setup temp directory ─────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'config-reader-test-'));
const localDir = path.join(tmpDir, '.local');
fs.mkdirSync(localDir, { recursive: true });

const SCRIPT = path.resolve(__dirname, 'config-reader.cjs');

/**
 * Run config-reader.cjs with the given arguments.
 * Returns { stdout, stderr, exitCode }.
 */
function runReader(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: process.env,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}

/**
 * Read session-secrets.json from localDir.
 * Returns null if it doesn't exist.
 */
function readSession() {
  const p = path.join(localDir, 'session-secrets.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

function cleanup() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    // best-effort
  }
}

// ─── Test 1: JSON masking ──────────────────────────────────────────────────────

console.log('\nTest 1 — JSON masking:');

test('masks secrets and preserves non-secrets in JSON', () => {
  const inputFile = path.join(tmpDir, 'config.json');
  const config = {
    database: {
      connectionString: 'Server=myserver;Database=mydb;User Id=sa;Password=hunter2;',
      host: 'myserver',
      port: 5432,
    },
    auth: {
      apiKey: 'sk-abc123def456ghi789jkl012mno345pq',
    },
    app: {
      name: 'my-service',
      port: 3000,
    },
  };
  fs.writeFileSync(inputFile, JSON.stringify(config, null, 2), 'utf8');

  const { stdout, exitCode } = runReader([inputFile, '--local-dir', localDir]);
  assertEqual(exitCode, 0, `Expected exit 0, got ${exitCode}`);

  const masked = JSON.parse(stdout);

  // Secrets should be replaced with {{SECRET:... identifiers
  assertTrue(
    typeof masked.database.connectionString === 'string' &&
    masked.database.connectionString.startsWith('{{SECRET:'),
    `connectionString should be masked, got: ${masked.database.connectionString}`
  );
  assertTrue(
    typeof masked.auth.apiKey === 'string' &&
    masked.auth.apiKey.startsWith('{{SECRET:'),
    `apiKey should be masked, got: ${masked.auth.apiKey}`
  );

  // Non-secrets should be preserved
  assertEqual(masked.app.name, 'my-service', 'app.name should be preserved');
  assertEqual(masked.app.port, 3000, 'app.port should be preserved');
  assertEqual(masked.database.host, 'myserver', 'database.host should be preserved');
  assertEqual(masked.database.port, 5432, 'database.port should be preserved');

  // session-secrets.json should be created
  const session = readSession();
  assertTrue(session !== null, 'session-secrets.json should be created');
  assertTrue(typeof session.createdAt === 'string', 'session should have createdAt');
  assertTrue(typeof session.lastAccessed === 'string', 'session should have lastAccessed');

  const secrets = session.secrets || {};
  const secretCount = Object.keys(secrets).length;
  assertEqual(secretCount, 2, `session should have 2 secrets, got ${secretCount}`);
});

// ─── Test 2: .env masking ─────────────────────────────────────────────────────

console.log('\nTest 2 — .env masking:');

test('masks secrets and preserves non-secrets in .env', () => {
  // Clear session before this test
  const sessionPath = path.join(localDir, 'session-secrets.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  const envFile = path.join(tmpDir, '.env');
  const envContent = [
    'DATABASE_URL=mongodb+srv://user:s3cr3t@cluster.mongodb.net/mydb',
    'API_TOKEN=ghp_' + 'A'.repeat(36),
    'APP_NAME=myapp',
    'PORT=8080',
  ].join('\n');
  fs.writeFileSync(envFile, envContent, 'utf8');

  const { stdout, exitCode } = runReader([envFile, '--local-dir', localDir]);
  assertEqual(exitCode, 0, `Expected exit 0, got ${exitCode}`);

  const lines = stdout.trim().split('\n');
  const parsed = {};
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    parsed[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
  }

  // Secrets masked
  assertTrue(
    parsed.DATABASE_URL && parsed.DATABASE_URL.startsWith('{{SECRET:'),
    `DATABASE_URL should be masked, got: ${parsed.DATABASE_URL}`
  );
  assertTrue(
    parsed.API_TOKEN && parsed.API_TOKEN.startsWith('{{SECRET:'),
    `API_TOKEN should be masked, got: ${parsed.API_TOKEN}`
  );

  // Non-secrets preserved
  assertEqual(parsed.APP_NAME, 'myapp', 'APP_NAME should be preserved');
  assertEqual(parsed.PORT, '8080', 'PORT should be preserved');
});

// ─── Test 3: --verify mode ────────────────────────────────────────────────────

console.log('\nTest 3 — --verify mode:');

test('--verify outputs WOULD MASK and PRESERVED without modifying session', () => {
  const inputFile = path.join(tmpDir, 'verify-config.json');
  const config = {
    database: {
      connectionString: 'Server=srv;Database=db;Password=secret123;',
    },
    app: {
      name: 'test-service',
    },
  };
  fs.writeFileSync(inputFile, JSON.stringify(config, null, 2), 'utf8');

  // Note current secret count (or 0 if no session)
  const sessionBefore = readSession();
  const countBefore = sessionBefore ? Object.keys(sessionBefore.secrets || {}).length : 0;

  const { stdout, exitCode } = runReader([inputFile, '--verify', '--local-dir', localDir]);
  assertEqual(exitCode, 0, `Expected exit 0 in verify mode, got ${exitCode}`);

  assertTrue(stdout.includes('WOULD MASK'), `Output should contain "WOULD MASK", got:\n${stdout}`);
  assertTrue(stdout.includes('PRESERVED'), `Output should contain "PRESERVED", got:\n${stdout}`);

  // Session should NOT be modified
  const sessionAfter = readSession();
  const countAfter = sessionAfter ? Object.keys(sessionAfter.secrets || {}).length : 0;
  assertEqual(countAfter, countBefore, 'session-secrets.json should not be modified in --verify mode');
});

// ─── Test 4: --clear mode ─────────────────────────────────────────────────────

console.log('\nTest 4 — --clear mode:');

test('--clear deletes session-secrets.json', () => {
  // Ensure session exists first
  const sessionPath = path.join(localDir, 'session-secrets.json');
  fs.writeFileSync(sessionPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    secrets: { 'abc123': { placeholder: '{{SECRET:abc123:test:0}}', original: 'hunter2' } },
  }), 'utf8');

  assertTrue(fs.existsSync(sessionPath), 'session-secrets.json should exist before --clear');

  const { exitCode } = runReader(['--clear', '--local-dir', localDir]);
  assertEqual(exitCode, 0, `Expected exit 0 for --clear, got ${exitCode}`);

  assertFalse(fs.existsSync(sessionPath), 'session-secrets.json should be deleted after --clear');
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup();

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}
console.log('─'.repeat(50));

if (failed > 0) {
  process.exit(1);
}
