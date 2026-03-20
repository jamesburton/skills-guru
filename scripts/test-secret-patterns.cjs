'use strict';

/**
 * Test suite for secret-patterns.cjs
 * Run with: node test-secret-patterns.cjs
 */

const assert = require('assert');
const path = require('path');

// Will fail until implementation exists
const {
  detectSecrets,
  scanScript,
  loadCustomRules,
  isSensitiveKey,
  isSensitiveValue,
} = require('./secret-patterns.cjs');

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
  assert.strictEqual(actual, expected, msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(val, msg) {
  assert.ok(val, msg || `Expected truthy, got ${JSON.stringify(val)}`);
}

function assertFalse(val, msg) {
  assert.ok(!val, msg || `Expected falsy, got ${JSON.stringify(val)}`);
}

// ─── Layer 1: Key-name heuristics ─────────────────────────────────────────────

console.log('\nLayer 1 — Key-name heuristics (should detect):');

test('detects "password"', () => assertTrue(isSensitiveKey('password')));
test('detects "db_password"', () => assertTrue(isSensitiveKey('db_password')));
test('detects "PASSWORD" (case-insensitive)', () => assertTrue(isSensitiveKey('PASSWORD')));
test('detects "secret"', () => assertTrue(isSensitiveKey('secret')));
test('detects "clientSecret"', () => assertTrue(isSensitiveKey('clientSecret')));
test('detects "token"', () => assertTrue(isSensitiveKey('token')));
test('detects "access_token"', () => assertTrue(isSensitiveKey('access_token')));
test('detects "refreshToken"', () => assertTrue(isSensitiveKey('refreshToken')));
test('detects "apiKey"', () => assertTrue(isSensitiveKey('apiKey')));
test('detects "api_key"', () => assertTrue(isSensitiveKey('api_key')));
test('detects "API_KEY"', () => assertTrue(isSensitiveKey('API_KEY')));
test('detects "connectionString"', () => assertTrue(isSensitiveKey('connectionString')));
test('detects "connection_string"', () => assertTrue(isSensitiveKey('connection_string')));
test('detects "credential"', () => assertTrue(isSensitiveKey('credential')));
test('detects "auth"', () => assertTrue(isSensitiveKey('auth')));
test('detects "private_key"', () => assertTrue(isSensitiveKey('private_key')));
test('detects "signing_key"', () => assertTrue(isSensitiveKey('signing_key')));

console.log('\nLayer 1 — Key-name heuristics (should NOT detect):');

test('ignores "name"', () => assertFalse(isSensitiveKey('name')));
test('ignores "description"', () => assertFalse(isSensitiveKey('description')));
test('ignores "host"', () => assertFalse(isSensitiveKey('host')));
test('ignores "port"', () => assertFalse(isSensitiveKey('port')));
test('ignores "enabled"', () => assertFalse(isSensitiveKey('enabled')));
test('ignores "publicKey" (not a bare "key")', () => assertFalse(isSensitiveKey('publicKey')));
test('ignores "timeout"', () => assertFalse(isSensitiveKey('timeout')));
test('ignores "maxRetries"', () => assertFalse(isSensitiveKey('maxRetries')));

// ─── Layer 2: Value-pattern detection ─────────────────────────────────────────

console.log('\nLayer 2 — Value-pattern detection (should detect):');

test('detects OpenAI key prefix sk-', () => assertTrue(isSensitiveValue('sk-abc123def456')));
test('detects GitHub PAT ghp_ (40 chars)', () => assertTrue(isSensitiveValue('ghp_' + 'A'.repeat(36))));
test('detects GitHub PAT ghu_', () => assertTrue(isSensitiveValue('ghu_' + 'A'.repeat(36))));
test('detects GitHub PAT github_pat_', () => assertTrue(isSensitiveValue('github_pat_' + 'A'.repeat(30))));
test('detects Slack token xoxb-', () => assertTrue(isSensitiveValue('xoxb-123-456-abc')));
test('detects AWS access key AKIA', () => assertTrue(isSensitiveValue('AKIAIOSFODNN7EXAMPLE')));
test('detects Bearer token header', () => assertTrue(isSensitiveValue('Bearer eyJhbGciOiJIUzI1NiJ9')));
test('detects Basic auth header', () => assertTrue(isSensitiveValue('Basic dXNlcjpwYXNzd29yZA==')));
test('detects SQL connection string', () => assertTrue(isSensitiveValue('Server=myserver;Database=mydb;Password=hunter2;')));
test('detects MongoDB URI', () => assertTrue(isSensitiveValue('mongodb+srv://user:pass@cluster.mongodb.net/db')));
test('detects PEM private key', () => assertTrue(isSensitiveValue('-----BEGIN RSA PRIVATE KEY-----')));

console.log('\nLayer 2 — Value-pattern detection (should NOT detect):');

test('ignores "hello world"', () => assertFalse(isSensitiveValue('hello world')));
test('ignores plain URL', () => assertFalse(isSensitiveValue('https://example.com/api')));
test('ignores "12345"', () => assertFalse(isSensitiveValue('12345')));
test('ignores "true"', () => assertFalse(isSensitiveValue('true')));

console.log('\nLayer 2 — High-entropy detection:');

// High-entropy base64 >40 chars should be detected
const highEntropyB64 = 'aB3dEfGhIjKlMnOpQrStUvWxYz0123456789+/aB3dEfGhIj';
test('detects high-entropy base64 string (>40 chars, Shannon >4.5)', () =>
  assertTrue(isSensitiveValue(highEntropyB64)));

// Low-entropy repeated chars should NOT be detected
const lowEntropyStr = 'A'.repeat(50);
test('ignores low-entropy repeated chars (AAAA...)', () =>
  assertFalse(isSensitiveValue(lowEntropyStr)));

// ─── Layer 3: Custom rules ────────────────────────────────────────────────────

console.log('\nLayer 3 — Custom rules:');

const customRules = {
  sensitive_key_patterns: ['corp_.*_token'],
  sensitive_value_patterns: ['CORP-[A-Z0-9]{32}'],
  never_mask_keys: ['publicKey'],
  never_mask_values: ['data:image/.*'],
};

test('custom key pattern corp_.*_token matches corp_api_token', () => {
  const result = detectSecrets('corp_api_token', 'somevalue', customRules);
  assertTrue(result.shouldMask, 'should mask corp_api_token');
});

test('custom value pattern CORP-[A-Z0-9]{32} matches', () => {
  const result = detectSecrets('anything', 'CORP-' + 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'.replace(/[^A-Z0-9]/gi, 'X').slice(0,32), customRules);
  // Build a valid 32-char uppercase alphanumeric value
  const corpToken = 'CORP-' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
  const r2 = detectSecrets('anything', corpToken, customRules);
  assertTrue(r2.shouldMask, 'should mask CORP-... value');
});

test('allowlisted key (publicKey in never_mask_keys) skips masking', () => {
  const result = detectSecrets('publicKey', 'someval', customRules);
  assertTrue(result.isAllowlisted, 'publicKey should be allowlisted');
  assertFalse(result.shouldMask, 'publicKey should not be masked');
});

test('allowlisted value pattern (data:image/.*) skips masking', () => {
  const result = detectSecrets('anything', 'data:image/png;base64,abc123', customRules);
  assertTrue(result.isAllowlisted, 'data:image value should be allowlisted');
  assertFalse(result.shouldMask, 'data:image value should not be masked');
});

// ─── detectSecrets return shape ───────────────────────────────────────────────

console.log('\ndetectSecrets — return shape:');

test('returns isSensitiveKey for password key', () => {
  const r = detectSecrets('password', 'hunter2', {});
  assertTrue(r.isSensitiveKey);
  assertTrue(r.shouldMask);
  assertTrue(typeof r.reason === 'string');
});

test('returns isSensitiveValue for sk- value', () => {
  const r = detectSecrets('somekey', 'sk-abc123def456', {});
  assertTrue(r.isSensitiveValue);
  assertTrue(r.shouldMask);
});

test('non-sensitive key+value returns shouldMask=false', () => {
  const r = detectSecrets('name', 'Alice', {});
  assertFalse(r.isSensitiveKey);
  assertFalse(r.isSensitiveValue);
  assertFalse(r.shouldMask);
});

// ─── Script scanning ──────────────────────────────────────────────────────────

console.log('\nScript scanning:');

const dangerousScript = `
'use strict';
const cp = require('child_process');
cp.exec('rm -rf /tmp/test', (err, stdout) => {
  console.log(stdout);
});
`;

test('child_process require + exec → BLOCK severity finding', () => {
  const findings = scanScript(dangerousScript, 'test.cjs');
  const blockFindings = findings.filter(f => f.severity === 'BLOCK');
  assertTrue(blockFindings.length > 0, `Expected BLOCK findings, got: ${JSON.stringify(findings)}`);
});

const safeScript = `
'use strict';
const fs = require('fs');
const data = fs.readFileSync('./config.json', 'utf8');
module.exports = JSON.parse(data);
`;

test('safe fs script → no BLOCK findings', () => {
  const findings = scanScript(safeScript, 'safe.cjs');
  const blockFindings = findings.filter(f => f.severity === 'BLOCK');
  assertEqual(blockFindings.length, 0, `Expected no BLOCK findings, got: ${JSON.stringify(blockFindings)}`);
});

const networkScript = `
'use strict';
const https = require('https');
https.get('https://example.com', (res) => {});
`;

test('https require → WARN severity finding', () => {
  const findings = scanScript(networkScript, 'network.cjs');
  const warnFindings = findings.filter(f => f.severity === 'WARN');
  assertTrue(warnFindings.length > 0, `Expected WARN findings, got: ${JSON.stringify(findings)}`);
});

const envScript = `
'use strict';
const key = process.env.SECRET_KEY;
module.exports = { key };
`;

test('process.env access → INFO severity finding', () => {
  const findings = scanScript(envScript, 'env.cjs');
  const infoFindings = findings.filter(f => f.severity === 'INFO');
  assertTrue(infoFindings.length > 0, `Expected INFO findings, got: ${JSON.stringify(findings)}`);
});

test('scanScript findings have required fields', () => {
  const findings = scanScript(dangerousScript, 'test.cjs');
  assertTrue(findings.length > 0);
  const f = findings[0];
  assertTrue('severity' in f, 'missing severity');
  assertTrue('reason' in f, 'missing reason');
  assertTrue('line' in f, 'missing line');
  assertTrue('file' in f, 'missing file');
  assertTrue('match' in f, 'missing match');
});

// ─── loadCustomRules ──────────────────────────────────────────────────────────

console.log('\nloadCustomRules:');

test('returns defaults when path does not exist', () => {
  const rules = loadCustomRules('/tmp/nonexistent-rules-xyz.json');
  assertTrue(typeof rules === 'object', 'should return object');
  assertTrue(Array.isArray(rules.sensitive_key_patterns), 'should have sensitive_key_patterns array');
  assertTrue(Array.isArray(rules.sensitive_value_patterns), 'should have sensitive_value_patterns array');
  assertTrue(Array.isArray(rules.never_mask_keys), 'should have never_mask_keys array');
  assertTrue(Array.isArray(rules.never_mask_values), 'should have never_mask_values array');
});

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
