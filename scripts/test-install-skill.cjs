'use strict';

/**
 * Test suite for install-skill.cjs
 * Run with: node test-install-skill.cjs
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Will fail until implementation exists
const {
  detectInputType,
  validateSkill,
} = require('./install-skill.cjs');

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

function assertContains(arr, substring, msg) {
  const found = arr.some(s => typeof s === 'string' && s.includes(substring));
  assert.ok(found, msg || `Expected array to contain item with "${substring}", got: ${JSON.stringify(arr)}`);
}

// ─── detectInputType ──────────────────────────────────────────────────────────

console.log('\ndetectInputType — local paths:');

test("'/home/user/SKILL.md' → type 'local-file'", () => {
  const result = detectInputType('/home/user/SKILL.md');
  assertEqual(result.type, 'local-file');
});

test("'/home/user/my-skill/' → type 'local-dir'", () => {
  const result = detectInputType('/home/user/my-skill/');
  assertEqual(result.type, 'local-dir');
});

test("'/tmp/skill.zip' → type 'archive'", () => {
  const result = detectInputType('/tmp/skill.zip');
  assertEqual(result.type, 'archive');
});

test("'/tmp/skill.tar.gz' → type 'archive'", () => {
  const result = detectInputType('/tmp/skill.tar.gz');
  assertEqual(result.type, 'archive');
});

test("'/tmp/skill.tgz' → type 'archive'", () => {
  const result = detectInputType('/tmp/skill.tgz');
  assertEqual(result.type, 'archive');
});

console.log('\ndetectInputType — GitHub URLs:');

test("'https://github.com/user/repo' → type 'github-repo'", () => {
  const result = detectInputType('https://github.com/user/repo');
  assertEqual(result.type, 'github-repo');
});

test("'https://github.com/user/repo/tree/main' → type 'github-repo'", () => {
  const result = detectInputType('https://github.com/user/repo/tree/main');
  assertEqual(result.type, 'github-repo');
});

test("'https://raw.githubusercontent.com/user/repo/main/SKILL.md' → type 'github-raw'", () => {
  const result = detectInputType('https://raw.githubusercontent.com/user/repo/main/SKILL.md');
  assertEqual(result.type, 'github-raw');
});

test("'https://gist.github.com/user/abc123' → type 'gist'", () => {
  const result = detectInputType('https://gist.github.com/user/abc123');
  assertEqual(result.type, 'gist');
});

console.log('\ndetectInputType — other URLs:');

test("'https://example.com/skill.md' → type 'generic-url'", () => {
  const result = detectInputType('https://example.com/skill.md');
  assertEqual(result.type, 'generic-url');
});

test("'git@github.com:user/repo.git' → type 'git-url'", () => {
  const result = detectInputType('git@github.com:user/repo.git');
  assertEqual(result.type, 'git-url');
});

test("'git@gitlab.com:user/repo.git' → type 'git-url'", () => {
  const result = detectInputType('git@gitlab.com:user/repo.git');
  assertEqual(result.type, 'git-url');
});

test('https:// .git URL → type git-url', () => {
  const result = detectInputType('https://github.com/user/repo.git');
  assertEqual(result.type, 'git-url');
});

console.log('\ndetectInputType — return shape:');

test('github-repo result has url field', () => {
  const result = detectInputType('https://github.com/user/repo');
  assertTrue('url' in result, 'should have url field');
});

test('github-repo result has branch field', () => {
  const result = detectInputType('https://github.com/user/repo');
  assertTrue('branch' in result, 'should have branch field');
});

test('local-file result has type only (no required url)', () => {
  const result = detectInputType('/home/user/SKILL.md');
  assertEqual(result.type, 'local-file');
  assertTrue(typeof result === 'object');
});

// ─── validateSkill ────────────────────────────────────────────────────────────

console.log('\nvalidateSkill — valid frontmatter:');

const goodContent = '---\nname: my-skill\ndescription: Use when testing things\n---\n# My Skill\n\nThis is the skill content.';

test('good frontmatter → valid: true', () => {
  const result = validateSkill(goodContent);
  assertTrue(result.valid, `Expected valid, got: ${JSON.stringify(result)}`);
});

test('good frontmatter → warnings is empty array', () => {
  const result = validateSkill(goodContent);
  assertTrue(Array.isArray(result.warnings), 'warnings should be array');
  assertEqual(result.warnings.length, 0, `Expected no warnings, got: ${JSON.stringify(result.warnings)}`);
});

test('good frontmatter → errors is empty array', () => {
  const result = validateSkill(goodContent);
  assertTrue(Array.isArray(result.errors), 'errors should be array');
  assertEqual(result.errors.length, 0, `Expected no errors, got: ${JSON.stringify(result.errors)}`);
});

test('good frontmatter → name returned', () => {
  const result = validateSkill(goodContent);
  assertEqual(result.name, 'my-skill');
});

test('good frontmatter → description returned', () => {
  const result = validateSkill(goodContent);
  assertEqual(result.description, 'Use when testing things');
});

console.log('\nvalidateSkill — missing description:');

const missingDescContent = '---\nname: my-skill\n---\n# My Skill\n\nContent here.';

test('missing description → valid: false', () => {
  const result = validateSkill(missingDescContent);
  assertFalse(result.valid, `Expected invalid, got: ${JSON.stringify(result)}`);
});

test('missing description → warnings contain "description"', () => {
  const result = validateSkill(missingDescContent);
  assertContains(result.warnings, 'description', `Expected warning about description, got: ${JSON.stringify(result.warnings)}`);
});

console.log('\nvalidateSkill — bad name:');

const badNameContent = '---\nname: My Skill!\ndescription: Use when testing things\n---\n# My Skill\n\nContent here.';

test('bad name (has spaces/punctuation) → warnings contain "name"', () => {
  const result = validateSkill(badNameContent);
  assertContains(result.warnings, 'name', `Expected warning about name, got: ${JSON.stringify(result.warnings)}`);
});

console.log('\nvalidateSkill — description not starting with "Use when":');

const badDescContent = '---\nname: my-skill\ndescription: Testing things\n---\n# My Skill\n\nContent here.';

test('description not starting with "Use when" → warnings contain "Use when"', () => {
  const result = validateSkill(badDescContent);
  assertContains(result.warnings, 'Use when', `Expected warning about "Use when", got: ${JSON.stringify(result.warnings)}`);
});

console.log('\nvalidateSkill — frontmatter >1024 chars:');

const longFrontmatter = '---\nname: my-skill\ndescription: Use when testing things\nextra: ' + 'x'.repeat(1100) + '\n---\n# Content';

test('frontmatter >1024 chars → warnings contain "1024"', () => {
  const result = validateSkill(longFrontmatter);
  assertContains(result.warnings, '1024', `Expected warning about 1024 chars, got: ${JSON.stringify(result.warnings)}`);
});

console.log('\nvalidateSkill — missing frontmatter:');

const noFrontmatterContent = '# My Skill\n\nThis has no frontmatter.';

test('no frontmatter → valid: false', () => {
  const result = validateSkill(noFrontmatterContent);
  assertFalse(result.valid, `Expected invalid for content without frontmatter`);
});

test('no frontmatter → errors array is non-empty', () => {
  const result = validateSkill(noFrontmatterContent);
  assertTrue(result.errors.length > 0, `Expected errors, got: ${JSON.stringify(result.errors)}`);
});

console.log('\nvalidateSkill — return shape:');

test('validateSkill returns valid, warnings, errors fields', () => {
  const result = validateSkill(goodContent);
  assertTrue('valid' in result, 'missing valid');
  assertTrue('warnings' in result, 'missing warnings');
  assertTrue('errors' in result, 'missing errors');
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
