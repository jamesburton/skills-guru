'use strict';

/**
 * config-reader.cjs — Secret-Masking Config Reader
 *
 * Reads config files (JSON, .env, YAML), masks secrets with stable identifiers,
 * writes session map to .local/session-secrets.json.
 *
 * Usage:
 *   node config-reader.cjs <file> [--verify] [--clear] [--local-dir <path>]
 *
 * Output (stdout):
 *   - Default: masked config content
 *   - --verify: human-readable WOULD MASK / PRESERVED report
 *   - --clear: confirmation message
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const { detectSecrets, loadCustomRules } = require('./secret-patterns.cjs');

// ─── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Parse process.argv into a structured options object.
 * @returns {{ filePath: string|null, verify: boolean, clear: boolean, localDir: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(2); // drop 'node' and script path
  let filePath = null;
  let verify = false;
  let clear = false;
  let localDir = path.join(os.homedir(), '.claude', '.local');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verify') {
      verify = true;
    } else if (arg === '--clear') {
      clear = true;
    } else if (arg === '--local-dir') {
      localDir = args[++i];
    } else if (!arg.startsWith('--')) {
      filePath = arg;
    }
  }

  return { filePath, verify, clear, localDir };
}

// ─── File hash ────────────────────────────────────────────────────────────────

/**
 * Returns first 4 chars of the SHA-256 hash of the resolved file path.
 * Provides a stable, short identifier component for a given file.
 * @param {string} filePath
 * @returns {string}
 */
function fileHash4(filePath) {
  const resolved = path.resolve(filePath);
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 4);
}

// ─── Format detection ─────────────────────────────────────────────────────────

/**
 * Detect config file format from extension, falling back to content sniffing.
 * @param {string} filePath
 * @returns {'json'|'env'|'yaml'|'unknown'}
 */
function detectFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.env' || path.basename(filePath).startsWith('.env')) return 'env';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';

  // Content sniffing: try to detect by first non-empty line
  try {
    const first = fs.readFileSync(filePath, 'utf8').trimStart().slice(0, 100);
    if (first.startsWith('{') || first.startsWith('[')) return 'json';
    if (first.startsWith('---') || /^[a-z_]+:\s/i.test(first)) return 'yaml';
    if (/^[A-Z_]+=/.test(first)) return 'env';
  } catch (_) {
    // ignore read errors during sniffing
  }

  return 'unknown';
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

/**
 * Recursively flatten a nested object into dotted key paths.
 * e.g. { a: { b: 1 } } → { 'a.b': 1 }
 * @param {object} obj
 * @param {string} prefix
 * @returns {Object.<string, any>}
 */
function flattenJSON(obj, prefix) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenJSON(v, fullKey));
    } else {
      result[fullKey] = v;
    }
  }
  return result;
}

/**
 * Walk a JSON value (object, array, or scalar), masking string secrets in place.
 * Returns the masked value and populates `secretMap` with discovered secrets.
 *
 * @param {any}    value       - JSON value to walk
 * @param {string} keyPath     - Dotted key path (for identifier generation)
 * @param {object} customRules - Custom detection rules
 * @param {string} fHash       - 4-char file hash
 * @param {boolean} verifyOnly - If true, don't replace; collect report entries instead
 * @param {Object} secretMap   - Accumulates { placeholder → original } entries
 * @param {Array}  report      - Accumulates verify-mode report entries
 * @param {object} seqCounters - Mutable { count } for sequential numbering per fHash+keyPath
 * @returns {any} masked value (same as input when verifyOnly)
 */
function walkJSON(value, keyPath, customRules, fHash, verifyOnly, secretMap, report, seqCounters) {
  if (Array.isArray(value)) {
    return value.map((item, idx) =>
      walkJSON(item, `${keyPath}[${idx}]`, customRules, fHash, verifyOnly, secretMap, report, seqCounters)
    );
  }

  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = walkJSON(v, keyPath ? `${keyPath}.${k}` : k, customRules, fHash, verifyOnly, secretMap, report, seqCounters);
    }
    return result;
  }

  if (typeof value === 'string') {
    // Determine the leaf key name (last segment of dotted path)
    const leafKey = keyPath.split('.').pop().replace(/\[\d+\]$/, '');
    const decision = detectSecrets(leafKey, value, customRules);

    if (decision.shouldMask) {
      const seq = seqCounters.count++;
      const placeholder = `{{SECRET:${fHash}:${keyPath}:${seq}}}`;

      if (verifyOnly) {
        report.push({ action: 'WOULD MASK', key: keyPath, reason: decision.reason });
      } else {
        secretMap[placeholder] = value;
        return placeholder;
      }
    } else {
      if (verifyOnly) {
        report.push({ action: 'PRESERVED', key: keyPath, reason: 'non-sensitive' });
      }
    }
  } else if (verifyOnly && (typeof value === 'number' || typeof value === 'boolean' || value === null)) {
    const leafKey = keyPath.split('.').pop().replace(/\[\d+\]$/, '');
    // Only report non-string scalars as preserved if key is not sensitive
    const decision = detectSecrets(leafKey, String(value), customRules);
    if (!decision.shouldMask) {
      report.push({ action: 'PRESERVED', key: keyPath, reason: 'non-sensitive (non-string)' });
    }
  }

  return value;
}

/**
 * Mask secrets in a JSON config string.
 *
 * @param {string}  content     - Raw JSON content
 * @param {object}  customRules - Custom detection rules
 * @param {string}  fHash       - 4-char file hash
 * @param {boolean} verifyOnly  - Dry-run mode
 * @returns {{ maskedContent: string, secretMap: object, report: Array }}
 */
function maskJSON(content, customRules, fHash, verifyOnly) {
  const parsed = JSON.parse(content);
  const secretMap = {};
  const report = [];
  const seqCounters = { count: 0 };

  const masked = walkJSON(parsed, '', customRules, fHash, verifyOnly, secretMap, report, seqCounters);

  return {
    maskedContent: JSON.stringify(masked, null, 2),
    secretMap,
    report,
  };
}

// ─── .env helpers ─────────────────────────────────────────────────────────────

/**
 * Mask secrets in a .env file string.
 * Preserves comments, blank lines, and non-secret assignments verbatim.
 *
 * @param {string}  content     - Raw .env content
 * @param {object}  customRules - Custom detection rules
 * @param {string}  fHash       - 4-char file hash
 * @param {boolean} verifyOnly  - Dry-run mode
 * @returns {{ maskedContent: string, secretMap: object, report: Array }}
 */
function maskEnv(content, customRules, fHash, verifyOnly) {
  const secretMap = {};
  const report = [];
  const lines = content.split('\n');
  let seq = 0;

  const maskedLines = lines.map(line => {
    // Skip comments and blank lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1);

    // Strip optional surrounding quotes from value for detection
    let value = rawValue;
    const quoteMatch = rawValue.match(/^(['"])(.*)\1$/s);
    if (quoteMatch) value = quoteMatch[2];

    const decision = detectSecrets(key, value, customRules);

    if (decision.shouldMask) {
      const keyPath = key;
      const placeholder = `{{SECRET:${fHash}:${keyPath}:${seq++}}}`;

      if (verifyOnly) {
        report.push({ action: 'WOULD MASK', key, reason: decision.reason });
        return line;
      } else {
        secretMap[placeholder] = value;
        return `${key}=${placeholder}`;
      }
    } else {
      if (verifyOnly) {
        report.push({ action: 'PRESERVED', key, reason: 'non-sensitive' });
      }
      return line;
    }
  });

  return {
    maskedContent: maskedLines.join('\n'),
    secretMap,
    report,
  };
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
 * Write session-secrets.json (overwrites any existing file).
 * Sets file permissions to 0o600 on Unix.
 *
 * @param {string} localDir
 * @param {object} secretMap  - { placeholder: originalValue, ... }
 */
function writeSession(localDir, secretMap) {
  fs.mkdirSync(localDir, { recursive: true });

  const now = new Date().toISOString();

  // Check if there's an existing session to preserve createdAt
  let createdAt = now;
  const existing = readSession(localDir);
  if (existing && existing.createdAt) {
    createdAt = existing.createdAt;
  }

  const session = {
    createdAt,
    lastAccessed: now,
    secrets: secretMap,
  };

  const p = sessionPath(localDir);
  fs.writeFileSync(p, JSON.stringify(session, null, 2), 'utf8');

  // Set permissions to owner-only on Unix/macOS
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(p, 0o600);
    }
  } catch (_) {
    // best-effort
  }
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

/**
 * Delete session-secrets.json.
 * @param {string} localDir
 */
function clearSession(localDir) {
  const p = sessionPath(localDir);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

// ─── TTL check ────────────────────────────────────────────────────────────────

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

/**
 * Check if session is still within TTL.
 * Throws an error with a descriptive message if expired.
 * @param {string} localDir
 */
function checkTTL(localDir) {
  const session = readSession(localDir);
  if (!session) return; // no session → nothing to check

  const { sessionTTLHours, idleTTLHours } = readTTLConfig(localDir);
  const now = Date.now();

  if (session.createdAt) {
    const ageMins = (now - new Date(session.createdAt).getTime()) / 1000 / 60;
    const ageHours = ageMins / 60;
    if (ageHours > sessionTTLHours) {
      throw new Error(
        `Session expired: created ${Math.round(ageHours)}h ago (max ${sessionTTLHours}h). ` +
        `Run with --clear to reset.`
      );
    }
  }

  if (session.lastAccessed) {
    const idleMins = (now - new Date(session.lastAccessed).getTime()) / 1000 / 60;
    const idleHours = idleMins / 60;
    if (idleHours > idleTTLHours) {
      throw new Error(
        `Session idle too long: last accessed ${Math.round(idleHours)}h ago (max ${idleTTLHours}h). ` +
        `Run with --clear to reset.`
      );
    }
  }
}

// ─── Verify report ────────────────────────────────────────────────────────────

/**
 * Run in verify/dry-run mode: produce a human-readable report without
 * modifying the session file.
 *
 * @param {string} filePath
 * @param {string} localDir
 */
function runVerify(filePath, localDir) {
  const content = fs.readFileSync(filePath, 'utf8');
  const format = detectFormat(filePath);
  const customRulesPath = path.join(localDir, 'custom-rules.json');
  const customRules = loadCustomRules(customRulesPath);
  const fHash = fileHash4(filePath);

  let report = [];

  if (format === 'json') {
    ({ report } = maskJSON(content, customRules, fHash, true));
  } else if (format === 'env') {
    ({ report } = maskEnv(content, customRules, fHash, true));
  } else {
    // For YAML/unknown, do a best-effort line-based scan similar to env
    ({ report } = maskEnv(content, customRules, fHash, true));
  }

  // Group by action for a clean report
  const wouldMask = report.filter(r => r.action === 'WOULD MASK');
  const preserved = report.filter(r => r.action === 'PRESERVED');
  const notMasked = report.filter(r => r.action === 'WOULD NOT MASK');

  const lines = [`Verify report for: ${path.resolve(filePath)}`, ''];

  if (wouldMask.length > 0) {
    lines.push('WOULD MASK:');
    wouldMask.forEach(r => lines.push(`  [${r.key}] — ${r.reason}`));
    lines.push('');
  } else {
    lines.push('WOULD MASK: (none)');
    lines.push('');
  }

  if (preserved.length > 0) {
    lines.push('PRESERVED:');
    preserved.forEach(r => lines.push(`  [${r.key}]`));
    lines.push('');
  } else {
    lines.push('PRESERVED: (none)');
    lines.push('');
  }

  if (notMasked.length > 0) {
    lines.push('WOULD NOT MASK:');
    notMasked.forEach(r => lines.push(`  [${r.key}]`));
    lines.push('');
  }

  process.stdout.write(lines.join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { filePath, verify, clear, localDir } = parseArgs(process.argv);

  // --clear: delete session and exit
  if (clear) {
    clearSession(localDir);
    process.stdout.write('Session cleared.\n');
    process.exit(0);
  }

  // Require a file path for all other operations
  if (!filePath) {
    process.stderr.write(
      'Usage: node config-reader.cjs <file> [--verify] [--clear] [--local-dir <path>]\n'
    );
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`Error: file not found: ${filePath}\n`);
    process.exit(1);
  }

  // --verify: dry-run mode
  if (verify) {
    runVerify(filePath, localDir);
    process.exit(0);
  }

  // Normal mode: mask and manage session
  checkTTL(localDir);

  const content = fs.readFileSync(filePath, 'utf8');
  const format = detectFormat(filePath);
  const customRulesPath = path.join(localDir, 'custom-rules.json');
  const customRules = loadCustomRules(customRulesPath);
  const fHash = fileHash4(filePath);

  let maskedContent, secretMap;

  if (format === 'json') {
    ({ maskedContent, secretMap } = maskJSON(content, customRules, fHash, false));
  } else if (format === 'env') {
    ({ maskedContent, secretMap } = maskEnv(content, customRules, fHash, false));
  } else {
    // YAML / unknown: treat line-by-line like env (best-effort)
    ({ maskedContent, secretMap } = maskEnv(content, customRules, fHash, false));
  }

  // Write session (overwrite, fresh each invocation)
  // Build a new session from scratch each time, keyed by placeholder
  writeSession(localDir, secretMap);

  process.stdout.write(maskedContent);
  if (!maskedContent.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

main();
