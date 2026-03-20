'use strict';

/**
 * secret-patterns.cjs — 3-layer secret detection engine + script sandboxing scanner
 *
 * Exports:
 *   detectSecrets(key, value, customRules) → { isSensitiveKey, isSensitiveValue, isAllowlisted, shouldMask, reason }
 *   scanScript(source, filename)           → [{ severity, reason, line, file, match }]
 *   loadCustomRules(rulesPath)             → parsed rules object with defaults
 *   isSensitiveKey(key)                   → boolean
 *   isSensitiveValue(value)               → boolean
 */

const fs = require('fs');
const path = require('path');

// ─── Layer 1: Sensitive key-name patterns ─────────────────────────────────────

/**
 * Patterns that identify config keys that likely hold secrets.
 *
 * Design rules to avoid false positives like "publicKey":
 *   - "key" only matches as a whole word (^key$ or _key$ or ^key_) — not as a substring
 *   - "auth" only matches as a whole word
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /(?:^|[_A-Z])token(?:[_A-Z]|$)|^token$/i,  // token, access_token, refreshToken, TOKEN
  /api[_.]?key/i,         // apiKey, api_key, api.key
  /connection.?string/i,  // connectionString, connection_string
  /credential/i,
  /\bauth\b/i,            // whole-word auth (not "author", "authorize" etc.)
  /private.?key/i,        // private_key, privateKey
  /signing.?key/i,        // signing_key, signingKey
  // bare "key" as a complete name or as a component separated by _ or camelCase boundary
  // Matches: key, MY_KEY, key_id, KEY_NAME
  // Does NOT match: apiKey, publicKey, privateKey (those are handled separately or excluded)
  /(?:^|[_])key(?:[_]|$)/i,
];

/**
 * Returns true if the given config key name appears to hold a secret.
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

// ─── Layer 2: Sensitive value patterns ───────────────────────────────────────

/**
 * Patterns that directly recognise secret-shaped values.
 */
const SENSITIVE_VALUE_PATTERNS = [
  // OpenAI / generic sk- API keys
  /^sk-[A-Za-z0-9]{10,}/,

  // GitHub tokens
  /^ghp_[A-Za-z0-9]{36,}/,
  /^ghu_[A-Za-z0-9]{36,}/,
  /^github_pat_[A-Za-z0-9_]{20,}/,

  // Slack tokens
  /^xox[bpras]-[0-9A-Za-z-]{10,}/,

  // AWS access key IDs
  /^AKIA[0-9A-Z]{16}/,

  // Authorization header values
  /^Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /^Basic\s+[A-Za-z0-9+/]+=*/i,

  // SQL Server / ADO.NET connection strings with a Password= component
  /Password\s*=\s*[^;'"]{1,}/i,

  // MongoDB connection URIs with credentials
  /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@/i,

  // PEM-encoded keys
  /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|PUBLIC|CERTIFICATE|EC)\s+/i,
];

/**
 * Shannon entropy of a string (bits per character).
 * @param {string} str
 * @returns {number}
 */
function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Base64 character set pattern (standard + URL-safe)
const BASE64_RE = /^[A-Za-z0-9+/=_-]+$/;
const HIGH_ENTROPY_MIN_LENGTH = 40;
const HIGH_ENTROPY_THRESHOLD = 4.5;

/**
 * Returns true if the value looks like a high-entropy base64 string (likely a secret).
 * @param {string} value
 * @returns {boolean}
 */
function isHighEntropyBase64(value) {
  if (typeof value !== 'string') return false;
  if (value.length < HIGH_ENTROPY_MIN_LENGTH) return false;
  if (!BASE64_RE.test(value)) return false;
  return shannonEntropy(value) > HIGH_ENTROPY_THRESHOLD;
}

/**
 * Returns true if the given value looks like a secret.
 * @param {string} value
 * @returns {boolean}
 */
function isSensitiveValue(value) {
  if (typeof value !== 'string') return false;
  if (SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(value))) return true;
  if (isHighEntropyBase64(value)) return true;
  return false;
}

// ─── Layer 3: Custom rules helpers ───────────────────────────────────────────

/**
 * Default empty custom-rules structure.
 * @returns {object}
 */
function defaultCustomRules() {
  return {
    sensitive_key_patterns: [],
    sensitive_value_patterns: [],
    never_mask_keys: [],
    never_mask_values: [],
  };
}

/**
 * Returns true if the key matches any of the custom sensitive key patterns.
 * @param {string} key
 * @param {object} customRules
 * @returns {boolean}
 */
function matchesCustomKeyPattern(key, customRules) {
  const patterns = customRules.sensitive_key_patterns || [];
  return patterns.some(p => new RegExp(p, 'i').test(key));
}

/**
 * Returns true if the value matches any of the custom sensitive value patterns.
 * @param {string} value
 * @param {object} customRules
 * @returns {boolean}
 */
function matchesCustomValuePattern(value, customRules) {
  const patterns = customRules.sensitive_value_patterns || [];
  return patterns.some(p => new RegExp(p).test(value));
}

/**
 * Returns true if the key/value is on an allowlist (should never be masked).
 * @param {string} key
 * @param {string} value
 * @param {object} customRules
 * @returns {boolean}
 */
function isAllowlisted(key, value, customRules) {
  const neverKeys = customRules.never_mask_keys || [];
  if (neverKeys.some(k => k === key || new RegExp(`^${k}$`, 'i').test(key))) {
    return true;
  }
  const neverValues = customRules.never_mask_values || [];
  if (neverValues.some(p => new RegExp(p).test(value))) {
    return true;
  }
  return false;
}

// ─── detectSecrets ────────────────────────────────────────────────────────────

/**
 * Runs all three detection layers and returns a decision object.
 *
 * @param {string} key          - Config key name
 * @param {string} value        - Config value
 * @param {object} customRules  - Custom rules (may be empty object)
 * @returns {{ isSensitiveKey: boolean, isSensitiveValue: boolean, isAllowlisted: boolean, shouldMask: boolean, reason: string }}
 */
function detectSecrets(key, value, customRules) {
  const rules = Object.assign(defaultCustomRules(), customRules || {});

  const sensKey = isSensitiveKey(key) || matchesCustomKeyPattern(key, rules);
  const sensVal = isSensitiveValue(value) || matchesCustomValuePattern(value, rules);
  const allowlisted = isAllowlisted(key, value, rules);

  let reason = '';
  if (allowlisted) {
    reason = 'allowlisted';
  } else if (sensKey) {
    reason = 'sensitive key name';
  } else if (sensVal) {
    reason = 'sensitive value pattern';
  }

  return {
    isSensitiveKey: sensKey,
    isSensitiveValue: sensVal,
    isAllowlisted: allowlisted,
    shouldMask: !allowlisted && (sensKey || sensVal),
    reason,
  };
}

// ─── Script scanning ──────────────────────────────────────────────────────────

/**
 * Patterns used to flag potentially dangerous constructs in skill scripts.
 *
 * Each entry: { pattern: RegExp, severity: 'BLOCK'|'WARN'|'INFO', reason: string }
 */
const SCRIPT_PATTERNS = [
  {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
    severity: 'BLOCK',
    reason: 'requires child_process module (arbitrary command execution)',
  },
  {
    pattern: /\bexec\s*\(/,
    severity: 'BLOCK',
    reason: 'calls exec() (arbitrary command execution)',
  },
  {
    pattern: /\bspawn\s*\(/,
    severity: 'BLOCK',
    reason: 'calls spawn() (arbitrary process spawning)',
  },
  {
    pattern: /\bexecSync\s*\(/,
    severity: 'BLOCK',
    reason: 'calls execSync() (synchronous arbitrary command execution)',
  },
  {
    pattern: /\bspawnSync\s*\(/,
    severity: 'BLOCK',
    reason: 'calls spawnSync() (synchronous process spawning)',
  },
  {
    // Access to .claude or .local directories outside of legitimate use
    pattern: /['"`][^'"`]*\.(claude|local)[^'"`]*['"`]/,
    severity: 'BLOCK',
    reason: 'accesses .claude or .local directory path (potential config tampering)',
  },
  {
    pattern: /require\s*\(\s*['"]https?['"]\s*\)/,
    severity: 'WARN',
    reason: 'requires http/https module (network access)',
  },
  {
    pattern: /require\s*\(\s*['"]node-fetch['"]\s*\)/,
    severity: 'WARN',
    reason: 'requires node-fetch (network access)',
  },
  {
    pattern: /require\s*\(\s*['"]axios['"]\s*\)/,
    severity: 'WARN',
    reason: 'requires axios (network access)',
  },
  {
    pattern: /\bfetch\s*\(/,
    severity: 'WARN',
    reason: 'calls fetch() (network access)',
  },
  {
    pattern: /process\.env\b/,
    severity: 'INFO',
    reason: 'reads process.env (environment variable access)',
  },
];

/**
 * Scans a script source for potentially dangerous patterns.
 *
 * @param {string} source    - Script source code
 * @param {string} filename  - Filename (for reporting)
 * @returns {Array<{ severity: string, reason: string, line: number, file: string, match: string }>}
 */
function scanScript(source, filename) {
  const findings = [];
  const lines = source.split('\n');

  for (const { pattern, severity, reason } of SCRIPT_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(pattern);
      if (m) {
        findings.push({
          severity,
          reason,
          line: i + 1,
          file: filename,
          match: m[0],
        });
        // Only report first occurrence per pattern per file to avoid flooding
        break;
      }
    }
  }

  return findings;
}

// ─── loadCustomRules ──────────────────────────────────────────────────────────

/**
 * Loads custom rules from a JSON file, merging with defaults.
 * Silently returns defaults if file not found or malformed.
 *
 * @param {string} rulesPath - Absolute path to the JSON rules file
 * @returns {object}
 */
function loadCustomRules(rulesPath) {
  const defaults = defaultCustomRules();
  if (!rulesPath) return defaults;

  try {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign(defaults, parsed);
  } catch (err) {
    // File not found or JSON parse error → return defaults
    return defaults;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  detectSecrets,
  scanScript,
  loadCustomRules,
  isSensitiveKey,
  isSensitiveValue,
  // Exported for advanced consumers
  isHighEntropyBase64,
  isAllowlisted,
  matchesCustomKeyPattern,
  matchesCustomValuePattern,
  shannonEntropy,
  SENSITIVE_KEY_PATTERNS,
  SENSITIVE_VALUE_PATTERNS,
  SCRIPT_PATTERNS,
};
