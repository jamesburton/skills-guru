'use strict';

/**
 * Test suite for git-sync.cjs
 * Run with: node test-git-sync.cjs
 */

const assert = require('assert');

// Will fail until implementation exists
const {
  parseSourcesMarkdown,
  formatSourcesMarkdown,
  detectDivergence,
} = require('./git-sync.cjs');

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

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const SAMPLE_SOURCES_MD = `## Registered Sources

### default
- URL: https://github.com/user/skills-repo
- Branch: main
- Last sync: 2024-01-15T10:30:00.000Z
- Skills: [skill-a, skill-b]

### team
- URL: https://github.com/team-org/skills-repo
- Branch: develop
- Last sync: 2024-01-16T08:00:00.000Z
- Skills: [team-skill-x]
- Fork of: https://github.com/user/skills-repo
`;

// ─── parseSourcesMarkdown ─────────────────────────────────────────────────────

console.log('\nparseSourcesMarkdown — basic parsing:');

test('parses 2 sources from sample markdown', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed.length, 2, `Expected 2 sources, got ${parsed.length}`);
});

test('first source name is "default"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[0].name, 'default');
});

test('first source url is correct', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[0].url, 'https://github.com/user/skills-repo');
});

test('first source branch is "main"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[0].branch, 'main');
});

test('first source has 2 skills', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[0].skills.length, 2, `Expected 2 skills, got ${parsed[0].skills.length}`);
});

test('first source skills contains "skill-a"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertTrue(parsed[0].skills.includes('skill-a'), `Expected skill-a in ${JSON.stringify(parsed[0].skills)}`);
});

test('first source skills contains "skill-b"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertTrue(parsed[0].skills.includes('skill-b'), `Expected skill-b in ${JSON.stringify(parsed[0].skills)}`);
});

console.log('\nparseSourcesMarkdown — second source (team):');

test('second source name is "team"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].name, 'team');
});

test('second source url is correct', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].url, 'https://github.com/team-org/skills-repo');
});

test('second source branch is "develop"', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].branch, 'develop');
});

test('second source has 1 skill', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].skills.length, 1, `Expected 1 skill, got ${parsed[1].skills.length}`);
});

test('second source forkOf is parsed correctly', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].forkOf, 'https://github.com/user/skills-repo');
});

test('first source has no forkOf', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertTrue(parsed[0].forkOf === undefined || parsed[0].forkOf === null || parsed[0].forkOf === '',
    `Expected no forkOf, got ${JSON.stringify(parsed[0].forkOf)}`);
});

console.log('\nparseSourcesMarkdown — lastSync field:');

test('first source lastSync is parsed', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[0].lastSync, '2024-01-15T10:30:00.000Z');
});

test('second source lastSync is parsed', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  assertEqual(parsed[1].lastSync, '2024-01-16T08:00:00.000Z');
});

console.log('\nparseSourcesMarkdown — edge cases:');

test('empty string returns empty array', () => {
  const parsed = parseSourcesMarkdown('');
  assertEqual(parsed.length, 0);
});

test('no sources section returns empty array', () => {
  const parsed = parseSourcesMarkdown('# Some other markdown\n\nNo sources here.');
  assertEqual(parsed.length, 0);
});

// ─── formatSourcesMarkdown ────────────────────────────────────────────────────

console.log('\nformatSourcesMarkdown — round-trip:');

test('round-trip preserves source count', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed.length, 2);
});

test('round-trip preserves first source name', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[0].name, 'default');
});

test('round-trip preserves first source URL', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[0].url, 'https://github.com/user/skills-repo');
});

test('round-trip preserves second source name', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[1].name, 'team');
});

test('round-trip preserves second source URL', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[1].url, 'https://github.com/team-org/skills-repo');
});

test('round-trip preserves forkOf', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[1].forkOf, 'https://github.com/user/skills-repo');
});

test('round-trip preserves skills arrays', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  const reparsed = parseSourcesMarkdown(formatted);
  assertEqual(reparsed[0].skills.length, 2);
  assertEqual(reparsed[1].skills.length, 1);
});

test('formatted output contains "## Registered Sources" header', () => {
  const parsed = parseSourcesMarkdown(SAMPLE_SOURCES_MD);
  const formatted = formatSourcesMarkdown(parsed);
  assertTrue(formatted.includes('## Registered Sources'), `Missing header in: ${formatted.slice(0, 100)}`);
});

// ─── detectDivergence ─────────────────────────────────────────────────────────

console.log('\ndetectDivergence — all same:');

test("('abc', 'abc', 'abc') → 'identical'", () => {
  assertEqual(detectDivergence('abc', 'abc', 'abc'), 'identical');
});

console.log('\ndetectDivergence — local changed:');

test("('xyz', 'abc', 'abc') → 'local-changed' (local differs from installed)", () => {
  assertEqual(detectDivergence('xyz', 'abc', 'abc'), 'local-changed');
});

console.log('\ndetectDivergence — remote changed:');

test("('abc', 'xyz', 'abc') → 'remote-changed' (remote differs from installed)", () => {
  assertEqual(detectDivergence('abc', 'xyz', 'abc'), 'remote-changed');
});

console.log('\ndetectDivergence — both changed:');

test("('xyz', 'def', 'abc') → 'both-changed' (both differ from installed)", () => {
  assertEqual(detectDivergence('xyz', 'def', 'abc'), 'both-changed');
});

console.log('\ndetectDivergence — additional cases:');

test("local==installed, remote differs → 'remote-changed'", () => {
  assertEqual(detectDivergence('same', 'different', 'same'), 'remote-changed');
});

test("local differs, remote==installed → 'local-changed'", () => {
  assertEqual(detectDivergence('different', 'same', 'same'), 'local-changed');
});

test("all different hashes → 'both-changed'", () => {
  assertEqual(detectDivergence('aaa', 'bbb', 'ccc'), 'both-changed');
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
