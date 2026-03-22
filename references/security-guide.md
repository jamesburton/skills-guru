# Security Guide — Config Reader/Writer Workflow

Reference for safe handling of secrets in skill configuration files. Apply this guide whenever
reading, editing, or writing files that may contain credentials, tokens, or sensitive values.

---

## Config Reader

**Command:**
```
node scripts/config-reader.cjs <file> [--verify] [--clear] [--local-dir <path>]
```

**Normal mode** (no flags):
- Reads the target file
- Detects and masks secrets, replacing them with `{{SECRET:<id>}}` placeholders
- Outputs masked content to stdout for Claude to read and edit
- Writes a session map to `.local/session-secrets.json` mapping placeholder IDs to original values
- Does NOT modify the original file

**`--verify` mode:**
- Dry run only — reports what WOULD be masked and what would be PRESERVED
- Does NOT write or modify the session map
- Use before committing or pushing to confirm no secrets will leak

**`--clear` mode:**
- Deletes `.local/session-secrets.json`
- Use at the end of config-editing workflows to clean up the session
- Does NOT affect the original config file

**`--local-dir <path>`:**
- Overrides the default `.local/` directory for session map storage
- Use when working with multiple projects or isolated environments

**Supported formats:**
- JSON (`.json`) — full key/value traversal
- `.env` files — `KEY=VALUE` line format
- Basic YAML (`.yml` / `.yaml`) — flat and one-level-deep keys only; nested structures beyond one level are not guaranteed to be detected

---

## Config Writer

**Command:**
```
node scripts/config-writer.cjs <masked-file> <target-file> [--local-dir <path>]
```

- Reads the masked file (containing `{{SECRET:...}}` placeholders)
- Loads the session map from `.local/session-secrets.json`
- Restores original secret values for all intact placeholders
- Writes the result to the target file

**Abort conditions:**
- If the session map is missing, config-writer aborts with an error — it never writes placeholder strings to the target file
- If the session is stale (see TTL rules below), config-writer aborts — re-run config-reader to start a fresh session

**Never writes placeholders:** config-writer treats a missing or expired session as a hard failure, not a degraded success. The target file is either written correctly or not written at all.

---

## Secret Detection Layers

Detection runs in three layers. A value is masked if ANY layer matches.

### Layer 1 — Key-Name Heuristics

Keys containing these substrings (case-insensitive) trigger masking:

`password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, `connectionstring`,
`connection_string`, `private_key`, `privatekey`, `auth`, `credential`, `access_key`,
`signing_key`, `encryption_key`, `webhook`

### Layer 2 — Value Patterns

Values matching these patterns trigger masking regardless of key name:

- `sk-...` — OpenAI-style API keys
- `ghp_...`, `ghs_...`, `github_pat_...` — GitHub tokens
- `Bearer <token>` — Authorization header values
- PEM-encoded keys (`-----BEGIN ...-----`)
- Database connection strings (`postgres://`, `mysql://`, `mongodb://`, `redis://`)
- High-entropy base64 strings (32+ chars with mixed case and symbols)

### Layer 3 — Custom Rules

Custom rules in `.local/secret-rules.json` extend detection:

```json
{
  "key_patterns": ["my_internal_key", "corp_.*_token"],
  "value_patterns": ["^CORP-[A-Z0-9]{16}$"],
  "never_mask_keys": ["publicKey", "hash", "checksum"],
  "never_mask_values": ["data:image/", "https://public.cdn."],
  "always_mask_files": ["production.env", "secrets.yml"]
}
```

- `key_patterns`: regex patterns for additional sensitive key names
- `value_patterns`: regex patterns for additional sensitive value formats
- `never_mask_keys`: exact key names exempted from masking even if heuristics match
- `never_mask_values`: value prefix/pattern exemptions (e.g., public data URIs)
- `always_mask_files`: filenames where ALL values are masked unconditionally

---

## Session TTL

Sessions have two timeout rules:

| Rule | Duration | Behavior |
|------|----------|----------|
| Inactivity timeout | 8 hours | Refreshed on every config-reader invocation |
| Absolute maximum | 24 hours | Hard limit regardless of activity |

**On expiry:** config-writer aborts with a stale-session error. Re-run config-reader on the original file to start a new session.

**Explicit cleanup:** Run `config-reader.cjs --clear` at the end of any config-editing workflow. This removes the session map and prevents stale data from persisting.

---

## Modified Secret Handling

When a user replaces a `{{SECRET:<id>}}` placeholder with a literal value in the masked file:

- config-writer writes the literal value as-is to the target file
- Only intact, unmodified placeholders are restored from the session map
- This is intentional: it allows users to update or rotate secrets during an edit session

**After writing a modified secret:** Re-run config-reader on the updated target file if further edits are expected in the same session. This ensures the new value is captured in the session map and will be masked correctly on next read.

---

## Pre-Push Scanning

Before any push, sync, or pull request involving files in the skill directory:

1. Run `config-reader.cjs --verify` on all config files in the skill
2. Review the report — confirm all sensitive values appear in the "would be masked" list
3. Confirm no secrets appear in the "would be preserved" list
4. If unexpected values appear unmasked, add custom rules to `.local/secret-rules.json` and re-verify
5. Only proceed with the push after a clean verify run

This scan is a prerequisite, not optional. Skipping it risks committing credentials to version control.

---

## Custom Rules Reference

`.local/secret-rules.json` full schema:

```json
{
  "key_patterns": [
    "pattern1",
    "pattern2"
  ],
  "value_patterns": [
    "^PREFIX-[A-Z0-9]+$"
  ],
  "always_mask_files": [
    "production.env",
    "*.secrets.json"
  ],
  "never_mask_keys": [
    "publicKey",
    "algorithm",
    "hash"
  ],
  "never_mask_values": [
    "data:image/",
    "localhost",
    "127.0.0.1"
  ]
}
```

All pattern fields accept standard regex strings. Matching is case-insensitive for key patterns and
case-sensitive for value patterns unless the pattern includes a `(?i)` flag.

The `.local/` directory (containing `session-secrets.json` and `secret-rules.json`) must be listed
in `.gitignore`. Never commit the session map — it contains unmasked secret values.
