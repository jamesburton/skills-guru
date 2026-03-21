'use strict';

/**
 * Test suite for config-writer.cjs
 * Run with: node test-config-writer.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-writer-test-'));
const localDir = path.join(tmpDir, '.local');
fs.mkdirSync(localDir, { recursive: true });

const READER_SCRIPT = path.resolve(__dirname, 'config-reader.cjs');
const WRITER_SCRIPT = path.resolve(__dirname, 'config-writer.cjs');

/**
 * Original config used across tests.
 */
const ORIGINAL_CONFIG = {
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

/**
 * Run a script with the given arguments.
 * Returns { stdout, stderr, exitCode }.
 */
function runScript(scriptPath, args) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
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

function runReader(args) {
  return runScript(READER_SCRIPT, args);
}

function runWriter(args) {
  return runScript(WRITER_SCRIPT, args);
}

/**
 * Read session-secrets.json from localDir.
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

// ─── Test setup helpers ───────────────────────────────────────────────────────

/**
 * Create the original config file and run config-reader to mask it.
 * Returns { originalFile, maskedContent, maskedFile }.
 */
function setupMaskedConfig(suffix) {
  const originalFile = path.join(tmpDir, `config-${suffix}.json`);
  fs.writeFileSync(originalFile, JSON.stringify(ORIGINAL_CONFIG, null, 2), 'utf8');

  // Clear session before each test to get a fresh mask
  const sessionPath = path.join(localDir, 'session-secrets.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  const { stdout, exitCode } = runReader([originalFile, '--local-dir', localDir]);
  if (exitCode !== 0) {
    throw new Error(`config-reader failed with exit code ${exitCode}`);
  }

  const maskedFile = path.join(tmpDir, `masked-${suffix}.json`);
  fs.writeFileSync(maskedFile, stdout, 'utf8');

  return { originalFile, maskedContent: stdout, maskedFile };
}

// ─── Test 1: Round-trip restore ───────────────────────────────────────────────

console.log('\nTest 1 — Round-trip restore:');

test('restores secrets to original values after masking', () => {
  const { originalFile, maskedFile } = setupMaskedConfig('roundtrip');

  // Run writer: write masked file back to original file
  const { exitCode, stderr } = runWriter([maskedFile, originalFile, '--local-dir', localDir]);
  assertEqual(exitCode, 0, `config-writer failed (exit ${exitCode}): ${stderr}`);

  // Read and parse the restored file
  const restored = JSON.parse(fs.readFileSync(originalFile, 'utf8'));

  // Secrets must be restored
  assertEqual(
    restored.database.connectionString,
    ORIGINAL_CONFIG.database.connectionString,
    'connectionString should be restored to original'
  );
  assertEqual(
    restored.auth.apiKey,
    ORIGINAL_CONFIG.auth.apiKey,
    'apiKey should be restored to original'
  );

  // Non-secrets must be preserved
  assertEqual(restored.app.name, 'my-service', 'app.name should be preserved');
  assertEqual(restored.app.port, 3000, 'app.port should be preserved');
  assertEqual(restored.database.host, 'myserver', 'database.host should be preserved');
  assertEqual(restored.database.port, 5432, 'database.port should be preserved');

  // No {{SECRET:}} placeholders should remain in the file
  const content = fs.readFileSync(originalFile, 'utf8');
  assertFalse(
    content.includes('{{SECRET:'),
    'restored file should not contain any {{SECRET:}} placeholders'
  );
});

// ─── Test 2: Non-secret edit ──────────────────────────────────────────────────

console.log('\nTest 2 — Non-secret edit:');

test('applies non-secret edits while restoring secrets', () => {
  const { maskedFile } = setupMaskedConfig('nonedit');

  // Modify non-secret fields in the masked output
  const masked = JSON.parse(fs.readFileSync(maskedFile, 'utf8'));
  masked.app.name = 'RenamedApp';
  masked.app.port = 4000;
  fs.writeFileSync(maskedFile, JSON.stringify(masked, null, 2), 'utf8');

  // Target file for writing
  const targetFile = path.join(tmpDir, 'output-nonedit.json');

  const { exitCode, stderr } = runWriter([maskedFile, targetFile, '--local-dir', localDir]);
  assertEqual(exitCode, 0, `config-writer failed (exit ${exitCode}): ${stderr}`);

  const result = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

  // Non-secret edits should be applied
  assertEqual(result.app.name, 'RenamedApp', 'app.name should reflect the edit');
  assertEqual(result.app.port, 4000, 'app.port should reflect the edit');

  // Secrets must still be restored
  assertEqual(
    result.database.connectionString,
    ORIGINAL_CONFIG.database.connectionString,
    'connectionString should be restored'
  );
  assertEqual(
    result.auth.apiKey,
    ORIGINAL_CONFIG.auth.apiKey,
    'apiKey should be restored'
  );

  // No placeholders should remain
  const content = fs.readFileSync(targetFile, 'utf8');
  assertFalse(
    content.includes('{{SECRET:'),
    'output file should not contain any {{SECRET:}} placeholders'
  );
});

// ─── Test 3: Secret replacement ───────────────────────────────────────────────

console.log('\nTest 3 — Secret replacement:');

test('writes literal secret value when user replaces placeholder directly', () => {
  const { maskedFile } = setupMaskedConfig('secretreplace');

  // Replace the apiKey placeholder with a literal new value
  const masked = JSON.parse(fs.readFileSync(maskedFile, 'utf8'));
  masked.auth.apiKey = 'sk-newkey-replaced-by-user-directly';
  fs.writeFileSync(maskedFile, JSON.stringify(masked, null, 2), 'utf8');

  const targetFile = path.join(tmpDir, 'output-secretreplace.json');

  const { exitCode, stderr } = runWriter([maskedFile, targetFile, '--local-dir', localDir]);
  assertEqual(exitCode, 0, `config-writer failed (exit ${exitCode}): ${stderr}`);

  const result = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

  // The new literal value should be written (not the original)
  assertEqual(
    result.auth.apiKey,
    'sk-newkey-replaced-by-user-directly',
    'apiKey should be the user-provided literal value'
  );

  // The other secret (connectionString) should still be restored from session
  assertEqual(
    result.database.connectionString,
    ORIGINAL_CONFIG.database.connectionString,
    'connectionString should still be restored from session'
  );

  // No placeholders should remain
  const content = fs.readFileSync(targetFile, 'utf8');
  assertFalse(
    content.includes('{{SECRET:'),
    'output file should not contain any {{SECRET:}} placeholders'
  );
});

// ─── Test 4: Stale session rejection ──────────────────────────────────────────

console.log('\nTest 4 — Stale session rejection:');

test('aborts with non-zero exit when session is stale (9h idle)', () => {
  const { maskedFile } = setupMaskedConfig('stale');

  // Manually set lastAccessed to 9 hours ago
  const sessionPath = path.join(localDir, 'session-secrets.json');
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  session.lastAccessed = nineHoursAgo;
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8');

  const targetFile = path.join(tmpDir, 'output-stale.json');

  const { exitCode, stderr } = runWriter([maskedFile, targetFile, '--local-dir', localDir]);

  // Must fail
  assertTrue(exitCode !== 0, `Expected non-zero exit for stale session, got ${exitCode}`);

  // Target file must NOT have been written with {{SECRET:}} placeholders
  if (fs.existsSync(targetFile)) {
    const content = fs.readFileSync(targetFile, 'utf8');
    assertFalse(
      content.includes('{{SECRET:'),
      'target file must not contain {{SECRET:}} placeholders'
    );
  }

  // Error message should be human-readable
  assertTrue(
    stderr.includes('stale') || stderr.includes('idle') || stderr.includes('expired') ||
    stderr.includes('session') || stderr.includes('Session'),
    `stderr should contain a human-readable session error, got: ${stderr}`
  );
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
