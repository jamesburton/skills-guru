'use strict';

/**
 * config-writer.cjs — Secret-Restoring Config Writer
 *
 * Reads edited content with {{SECRET:...}} placeholders, restores originals
 * from session-secrets.json, then writes the result to the target file.
 *
 * Usage:
 *   node config-writer.cjs <masked-file> <target-file> [--local-dir <path>]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Parse process.argv into a structured options object.
 * @returns {{ maskedFile: string|null, targetFile: string|null, localDir: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(2); // drop 'node' and script path
  let maskedFile = null;
  let targetFile = null;
  let localDir = path.join(os.homedir(), '.claude', '.local');

  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--local-dir') {
      localDir = args[++i];
    } else if (!arg.startsWith('--')) {
      positionals.push(arg);
    }
  }

  if (positionals.length >= 1) maskedFile = positionals[0];
  if (positionals.length >= 2) targetFile = positionals[1];

  return { maskedFile, targetFile, localDir };
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Path to session-secrets.json given a localDir.
 * @param {string} localDir
 * @returns {string}
 */
function sessionPath(localDir) {
  return path.join(localDir, 'session-secrets.json');
}

/**
 * Read and parse session-secrets.json.
 * Returns null if the file doesn't exist or can't be parsed.
 * @param {string} localDir
 * @returns {object|null}
 */
function readSession(localDir) {
  const p = sessionPath(localDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

// ─── TTL config ───────────────────────────────────────────────────────────────

/**
 * Read TTL config from .local/config.json.
 * Returns defaults if file absent or malformed.
 * @param {string} localDir
 * @returns {{ sessionTTLHours: number, idleTTLHours: number }}
 */
function readTTLConfig(localDir) {
  const configPath = path.join(localDir, 'config.json');
  const defaults = { sessionTTLHours: 24, idleTTLHours: 8 };
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      sessionTTLHours: cfg.sessionTTLHours || defaults.sessionTTLHours,
      idleTTLHours: cfg.idleTTLHours || defaults.idleTTLHours,
    };
  } catch (_) {
    return defaults;
  }
}

// ─── Session validation ───────────────────────────────────────────────────────

/**
 * Validate a loaded session object against TTL rules.
 * Throws a descriptive Error if the session is stale or missing.
 *
 * @param {object|null} sessionData   - Parsed session-secrets.json, or null if absent
 * @param {string}      localDir      - Path to .local/ directory (for config.json)
 */
function validateSession(sessionData, localDir) {
  if (!sessionData) {
    throw new Error(
      'Session not found: no session-secrets.json exists. ' +
      'Run config-reader.cjs on your config file first to start a session.'
    );
  }

  const { sessionTTLHours, idleTTLHours } = readTTLConfig(localDir);
  const now = Date.now();

  if (sessionData.createdAt) {
    const ageHours = (now - new Date(sessionData.createdAt).getTime()) / 1000 / 3600;
    if (ageHours > sessionTTLHours) {
      throw new Error(
        `Session expired: created ${Math.round(ageHours)}h ago (max ${sessionTTLHours}h absolute TTL). ` +
        `Run config-reader.cjs with --clear to reset, then re-read your config.`
      );
    }
  }

  if (sessionData.lastAccessed) {
    const idleHours = (now - new Date(sessionData.lastAccessed).getTime()) / 1000 / 3600;
    if (idleHours > idleTTLHours) {
      throw new Error(
        `Session idle too long: last accessed ${Math.round(idleHours)}h ago (max ${idleTTLHours}h idle TTL). ` +
        `Run config-reader.cjs with --clear to reset, then re-read your config.`
      );
    }
  }
}

// ─── Secret restoration ───────────────────────────────────────────────────────

/**
 * The placeholder pattern used throughout the masking system.
 * Matches: {{SECRET:xxxx:some.key.path:N}}
 */
const PLACEHOLDER_RE = /\{\{SECRET:[^}]+\}\}/g;

/**
 * Restore all {{SECRET:...}} placeholders in `content` using the session secrets map.
 *
 * Rules:
 *  - Placeholder in content AND in session map → replace with original value
 *  - Placeholder in session map but NOT in content → skip (user removed it)
 *  - Placeholder in content but NOT in session map → abort (corrupted / unknown session)
 *
 * @param {string} content  - The masked file content (may contain placeholders)
 * @param {object} secrets  - Map of { placeholder: originalValue }
 * @returns {string}        - Content with all placeholders replaced
 * @throws {Error}          - If content contains unknown placeholders
 */
function restoreSecrets(content, secrets) {
  // Find every placeholder present in the content
  const found = content.match(PLACEHOLDER_RE) || [];

  for (const placeholder of found) {
    if (!(placeholder in secrets)) {
      throw new Error(
        `Corrupted placeholder found in content: ${placeholder}\n` +
        `This placeholder is not in the current session. ` +
        `The file may have been edited with an outdated session, or the placeholder is malformed.`
      );
    }
  }

  // Replace each known placeholder that appears in the content
  let restored = content;
  for (const [placeholder, original] of Object.entries(secrets)) {
    if (content.includes(placeholder)) {
      // Use a function replacer to avoid special-character issues in replacement strings
      restored = restored.split(placeholder).join(original);
    }
    // If placeholder not in content, user removed it — skip silently
  }

  return restored;
}

// ─── Safety check ─────────────────────────────────────────────────────────────

/**
 * Verify that no {{SECRET:...}} placeholders remain in the restored content.
 * This is a final safety gate before writing to disk.
 *
 * @param {string} content
 * @throws {Error} if any placeholder remains
 */
function assertNoPlaceholders(content) {
  const remaining = content.match(PLACEHOLDER_RE);
  if (remaining && remaining.length > 0) {
    throw new Error(
      `Internal error: ${remaining.length} {{SECRET:}} placeholder(s) remain after restoration. ` +
      `Refusing to write file. Affected placeholders: ${remaining.slice(0, 3).join(', ')}`
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { maskedFile, targetFile, localDir } = parseArgs(process.argv);

  if (!maskedFile || !targetFile) {
    process.stderr.write(
      'Usage: node config-writer.cjs <masked-file> <target-file> [--local-dir <path>]\n'
    );
    process.exit(1);
  }

  if (!fs.existsSync(maskedFile)) {
    process.stderr.write(`Error: masked file not found: ${maskedFile}\n`);
    process.exit(1);
  }

  // Load and validate session — must happen BEFORE reading content to avoid
  // partial processing when the session is stale.
  const sessionData = readSession(localDir);
  try {
    validateSession(sessionData, localDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const secrets = sessionData.secrets || {};

  // Read the masked (edited) content
  const maskedContent = fs.readFileSync(maskedFile, 'utf8');

  // Restore secrets
  let restored;
  try {
    restored = restoreSecrets(maskedContent, secrets);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  // Final safety gate: ensure no placeholders remain
  try {
    assertNoPlaceholders(restored);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  // Write the restored content to the target file
  try {
    const targetDir = path.dirname(path.resolve(targetFile));
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, restored, 'utf8');
  } catch (err) {
    process.stderr.write(`Error writing target file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Secrets restored and written to: ${path.resolve(targetFile)}\n`);
}

main();
