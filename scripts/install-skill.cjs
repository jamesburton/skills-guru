'use strict';

/**
 * install-skill.cjs — Skill Installer
 *
 * Auto-detects input type (file, URL, repo, archive, gist) and validates
 * skill frontmatter for the skills-guru installation pipeline.
 *
 * Exports:
 *   detectInputType(input) → { type: string, url?: string, branch?: string }
 *   validateSkill(content) → { valid: boolean, warnings: string[], errors: string[], name?: string, description?: string }
 *
 * CLI usage:
 *   node install-skill.cjs <input> [--target <dir>] [--branch <b>] [--scope user|project]
 *
 * Types returned by detectInputType:
 *   'local-file'   — local .md file path
 *   'local-dir'    — local directory path (trailing slash or existing dir)
 *   'archive'      — .zip, .tar.gz, .tgz file
 *   'github-repo'  — https://github.com/<owner>/<repo>[/tree/...]
 *   'github-raw'   — https://raw.githubusercontent.com/...
 *   'gist'         — https://gist.github.com/...
 *   'git-url'      — git@...:... or https://.../.git URL
 *   'generic-url'  — any other https?:// URL
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── detectInputType ──────────────────────────────────────────────────────────

/**
 * Detects the type of skill input: URL, local file, archive, etc.
 *
 * Detection order (first match wins):
 * 1. gist.github.com     → gist
 * 2. raw.githubusercontent.com → github-raw
 * 3. github.com          → github-repo
 * 4. git@ SSH URL        → git-url
 * 5. https://.../.git    → git-url
 * 6. .zip / .tar.gz / .tgz extension → archive
 * 7. https?://           → generic-url
 * 8. trailing slash      → local-dir
 * 9. .md extension       → local-file
 * 10. default            → local-dir (treat as directory path)
 *
 * @param {string} input - User-provided path or URL
 * @returns {{ type: string, url?: string, branch?: string }}
 */
function detectInputType(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return { type: 'local-file' };
  }

  const trimmed = input.trim();

  // ── URL-based detection ──────────────────────────────────────────────────

  // gist.github.com (must check before generic github.com)
  if (/^https?:\/\/gist\.github\.com\//i.test(trimmed)) {
    return { type: 'gist', url: trimmed };
  }

  // raw.githubusercontent.com (must check before generic github.com)
  if (/^https?:\/\/raw\.githubusercontent\.com\//i.test(trimmed)) {
    return { type: 'github-raw', url: trimmed };
  }

  // github.com repo (not raw, not gist)
  const githubRepoMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/tree\/([^/]+).*|\/.*)?$/i
  );
  if (githubRepoMatch && !trimmed.endsWith('.git')) {
    const branch = githubRepoMatch[3] || null;
    return { type: 'github-repo', url: trimmed, branch: branch || undefined };
  }

  // git@ SSH URLs  e.g. git@github.com:user/repo.git
  if (/^git@[^:]+:[^/]/.test(trimmed)) {
    return { type: 'git-url', url: trimmed };
  }

  // https://.../.git URLs
  if (/^https?:\/\/.*\.git(?:\?.*)?$/i.test(trimmed)) {
    return { type: 'git-url', url: trimmed };
  }

  // Archive extensions (.zip, .tar.gz, .tgz) — check before generic-url so
  // https://example.com/pkg.tar.gz is still detected as archive
  if (/\.(zip|tar\.gz|tgz)$/i.test(trimmed)) {
    return { type: 'archive', url: /^https?:\/\//i.test(trimmed) ? trimmed : undefined };
  }

  // Any other https?:// URL
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'generic-url', url: trimmed };
  }

  // ── Local path detection ─────────────────────────────────────────────────

  // Trailing slash → explicit directory
  if (trimmed.endsWith('/') || trimmed.endsWith(path.sep)) {
    return { type: 'local-dir' };
  }

  // .md extension → local file
  if (/\.md$/i.test(trimmed)) {
    return { type: 'local-file' };
  }

  // Archive extensions for bare local paths (no http)
  if (/\.(zip|tar\.gz|tgz)$/i.test(trimmed)) {
    return { type: 'archive' };
  }

  // Check filesystem: if it exists and is a directory, return local-dir
  try {
    const stat = fs.statSync(trimmed);
    if (stat.isDirectory()) {
      return { type: 'local-dir' };
    }
    return { type: 'local-file' };
  } catch (_) {
    // Path doesn't exist — treat as local-dir if no extension, local-file otherwise
    return { type: 'local-dir' };
  }
}

// ─── validateSkill ────────────────────────────────────────────────────────────

/**
 * Kebab-case name regex: lowercase letters, digits, and hyphens only,
 * must start and end with a letter or digit.
 */
const KEBAB_CASE_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Parses YAML frontmatter between the first pair of `---` delimiters.
 * Returns null if no valid frontmatter block is found.
 *
 * @param {string} content
 * @returns {{ frontmatter: string, body: string } | null}
 */
function parseFrontmatterBlock(content) {
  // Must start with ---
  if (!content.startsWith('---')) {
    return null;
  }

  const afterOpen = content.slice(3);
  // Find closing ---
  const closeIdx = afterOpen.indexOf('\n---');
  if (closeIdx === -1) {
    return null;
  }

  const frontmatter = afterOpen.slice(0, closeIdx).trim();
  const body = afterOpen.slice(closeIdx + 4).trim(); // skip \n---

  return { frontmatter, body };
}

/**
 * Minimal YAML-like parser for simple key: value pairs.
 * Only handles top-level string scalars; does not handle nested objects or arrays.
 *
 * @param {string} yaml
 * @returns {Object.<string, string>}
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Validates a SKILL.md file's frontmatter and structure.
 *
 * Checks performed:
 * - Frontmatter block exists (errors if missing)
 * - `name` field exists and is kebab-case
 * - `description` field exists and starts with "Use when"
 * - Total frontmatter size is <1024 chars
 * - Content body (SKILL.md text) exists after frontmatter
 *
 * @param {string} content - Full content of the SKILL.md file
 * @returns {{ valid: boolean, warnings: string[], errors: string[], name?: string, description?: string }}
 */
function validateSkill(content) {
  const warnings = [];
  const errors = [];

  if (typeof content !== 'string') {
    errors.push('Content must be a string');
    return { valid: false, warnings, errors };
  }

  // Parse frontmatter block
  const parsed = parseFrontmatterBlock(content);
  if (!parsed) {
    errors.push('Missing or malformed frontmatter block (expected content starting with ---)');
    return { valid: false, warnings, errors };
  }

  const { frontmatter, body } = parsed;

  // Check frontmatter size
  const frontmatterWithDelimiters = '---\n' + frontmatter + '\n---';
  if (frontmatterWithDelimiters.length > 1024) {
    warnings.push(`Frontmatter exceeds 1024 characters (${frontmatterWithDelimiters.length} chars) — consider trimming metadata`);
  }

  // Parse the YAML fields
  const fields = parseSimpleYaml(frontmatter);

  // Validate name
  let nameValue;
  if (!fields.name) {
    warnings.push('Missing required frontmatter field: name');
  } else {
    nameValue = fields.name;
    if (!KEBAB_CASE_RE.test(nameValue)) {
      warnings.push(`Invalid name "${nameValue}" — name must be kebab-case (lowercase letters, numbers, hyphens only)`);
    }
  }

  // Validate description
  let descValue;
  if (!fields.description) {
    warnings.push('Missing required frontmatter field: description');
  } else {
    descValue = fields.description;
    if (!descValue.startsWith('Use when')) {
      warnings.push(`description should start with "Use when" to help Claude understand when to invoke this skill (got: "${descValue}")`);
    }
  }

  // Check body exists
  if (!body || body.trim().length === 0) {
    warnings.push('No skill content found after frontmatter — SKILL.md body appears empty');
  }

  const valid = errors.length === 0 && warnings.length === 0;

  const result = { valid, warnings, errors };
  if (nameValue !== undefined) result.name = nameValue;
  if (descValue !== undefined) result.description = descValue;

  return result;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * Parse CLI arguments.
 * @param {string[]} argv
 * @returns {{ input: string|null, target: string, branch: string|null, scope: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let input = null;
  let target = path.join(os.homedir(), '.claude', 'skills');
  let branch = null;
  let scope = 'user';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target') {
      target = args[++i];
    } else if (arg === '--branch') {
      branch = args[++i];
    } else if (arg === '--scope') {
      scope = args[++i];
    } else if (!arg.startsWith('--')) {
      input = arg;
    }
  }

  return { input, target, branch, scope };
}

if (require.main === module) {
  const { input, target, branch, scope } = parseArgs(process.argv);

  if (!input) {
    console.error('Usage: node install-skill.cjs <input> [--target <dir>] [--branch <b>] [--scope user|project]');
    console.error('');
    console.error('Input can be:');
    console.error('  /path/to/SKILL.md           — local file');
    console.error('  /path/to/skill-dir/         — local directory');
    console.error('  /path/to/archive.zip        — zip or tar.gz archive');
    console.error('  https://github.com/u/repo   — GitHub repository');
    console.error('  https://gist.github.com/... — GitHub Gist');
    console.error('  git@github.com:user/repo    — SSH git URL');
    process.exit(1);
  }

  const detected = detectInputType(input);
  console.log(`Detected input type: ${detected.type}`);
  if (detected.url) console.log(`URL: ${detected.url}`);
  if (detected.branch) console.log(`Branch: ${detected.branch}`);
  console.log(`Target: ${target}`);
  console.log(`Scope: ${scope}`);
  console.log('');
  console.log('Note: Full installation flow (fetch, extract, scan, copy) is orchestrated');
  console.log('by SKILL.md routing via install-guide.md. This script provides detection');
  console.log('and validation only.');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  detectInputType,
  validateSkill,
  parseFrontmatterBlock,
  parseSimpleYaml,
  parseArgs,
};
