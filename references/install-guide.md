# Install Guide: Skill Acquisition and Validation

Reference for `skills-guru` install operations. Covers input detection, flow, validation, and remote guardrails.

---

## Input Type Detection

| Input | Detection | Action |
|-------|-----------|--------|
| Local .md file | Path exists, ends `.md` | Copy as `SKILL.md` |
| Local directory | Path exists, contains `SKILL.md` | Copy entire directory |
| Local archive | `.zip`, `.tar.gz`, `.tgz` extension | Extract, locate `SKILL.md` |
| GitHub repo URL | `github.com/owner/repo` | Clone (sparse), extract skills |
| GitHub raw URL | `raw.githubusercontent.com/...` | Fetch single file |
| GitHub gist URL | `gist.github.com/...` | Fetch via API |
| Git URL + branch | `.git` URL or `--branch` flag | `git clone --branch <b> --depth 1` |
| Generic URL | `https://...` | Fetch, route by content type |

Detection runs in order top-to-bottom. First match wins.

---

## Installation Flow

### Step 1: Detect Input Type
```
node scripts/install-skill.cjs detectInputType <input>
```
Returns a type token: `local-md`, `local-dir`, `local-archive`, `github-repo`,
`github-raw`, `github-gist`, `git-url`, `generic-url`.

### Step 2: Fetch / Extract to Temp Directory
- Local files: copy to a system temp dir working area.
- Archives: extract with `unzip` / `tar`. Locate `SKILL.md` inside.
- Remote: download to temp. Git clones go to temp with `--depth 1`.
- Temp dir is cleaned up on success or failure.

### Step 3: Validate Skill Structure
```
node scripts/install-skill.cjs validateSkill <temp-dir> [--source-path <original-path>]
```
Checks:
- `SKILL.md` present in `<temp-dir>`
- Frontmatter block exists (`---` delimiters)
- Required keys present: `name`, `description`
- `version` is not required in SKILL.md frontmatter — skills-guru records install version in `memory/sources.md`. Docker Agent skills may store a display version in `metadata.version` (preserved as-is; not validated)

The optional `--source-path` flag passes the original source location (e.g. `~/.agents/skills/foo`) for Docker Agent detection. When the source path contains `.agents/skills`, the validator applies relaxed rules (see below).

**Docker Agent skills** (sourced from `.agents/skills/` or `~/.agents/skills/`) are detected automatically — either via `--source-path` or by detecting the pattern in `<temp-dir>` itself. Docker Agent–specific frontmatter fields (`context`, `allowed-tools`, `license`, `compatibility`, `metadata`) are reported as Info rather than warnings. See `references/docker-agent-guide.md` for validation rules specific to Docker Agent format.

### Step 4: Security Scan

**Config scan** (all files):
```
node scripts/config-reader.cjs --verify <temp-dir>
```

**Script scan** (`.cjs` / `.js` files):
```
node scripts/secret-patterns.cjs <file>  # via scanScript export
```

Severity levels and behavior:

| Severity | Pattern Examples | Behavior |
|----------|-----------------|----------|
| **BLOCK** | `child_process`, writes outside skill dir, reads `.local/` | Hard stop — requires explicit user override to proceed |
| **WARN** | Network calls (`fetch`, `axios`, `http`) | Flagged with summary, user prompted to continue |
| **INFO** | `process.env` reads | Noted in output, no prompt required |

Override prompt for BLOCK:
> "This skill contains potentially unsafe code. Type `INSTALL ANYWAY` to override."

### Step 5: Choose Install Scope
Prompt:
```
Where do you want to install?
  [1] User-global  (~/.claude/skills/)
  [2] Project      (.claude/skills/ in current repo)
```
Default: user-global if not inside a git repo; project otherwise.

### Step 6: Conflict Check
If a skill with the same `name` already exists at the target:

| Option | Action |
|--------|--------|
| **Overwrite** | Replace existing with incoming |
| **Rename** | Install as `<name>-2` (or next available suffix) |
| **Show diff** | Print line diff for manual resolution, abort install |

### Step 7: Copy to Target
Atomic: write to `<target>/.tmp-<name>/`, verify, rename to final path.

### Step 8: Record Source
Append entry to `memory/sources.md`:
```
- name: <skill-name>
  source: <original-input>
  installed: <ISO-date>
  scope: user | project
```

### Step 9: Offer Trusted-Skill Registration
```
Add <skill-name> to trusted skills? (y/N)
```
On yes: append to `memory/trusted-skills.md`.

---

## Post-Install Validation Checklist

Run automatically after copy. Issues displayed with suggested fixes.

| Check | Rule | Severity |
|-------|------|----------|
| Frontmatter parses | Valid YAML between `---` delimiters | Error |
| Name format | Kebab-case only: `[a-z0-9-]+` | Warning |
| Description prefix | Starts with "Use when..." | Warning (Claude Code only; demoted to Info for Docker Agent sources) |
| File length | Under 500 lines | Warning (not blocking) |
| Reference depth | No nested `references/` deeper than 1 level | Warning |
| No @-file loads | No lines matching `@<path>` pattern | Error |
| Docker Agent extra fields | `context`, `allowed-tools`, `license`, `compatibility`, `metadata` | Info (noted, not flagged as errors) |

For warnings, offer auto-fix:
```
Auto-fix available for: name format, description prefix.
Apply fixes? (y/N)
```
Auto-fix rewrites frontmatter in-place. Backs up original as `SKILL.md.bak`.

**Docker Agent source detection:** If the skill originates from a `.agents/skills/` or `~/.agents/skills/` path, the "description prefix" check is demoted from Warning to Info. The `context: fork` and `allowed-tools` fields are preserved during install without modification.

---

## Remote Operation Guardrails

### HTTP Fetches
- Timeout: **30 seconds** hard limit
- Retry: single retry on `5xx` responses; no retry on `4xx`
- Follow redirects: up to 3 hops
- Reject non-`200`/`206` final responses

### GitHub API
- Respect `X-RateLimit-Remaining` header
- If remaining < 5: warn user and pause
- If remaining = 0: read `X-RateLimit-Reset`, display wait time, abort

### Git Clone
- Always use `--depth 1`
- Always use `--single-branch` when a branch is specified
- Timeout: 60 seconds on clone operations
- Clean up partial clone dirs on failure

### Archives
- Maximum size: **10 MB** (configurable via `.local/config.json` → `maxArchiveMB`)
- Refuse to extract if compressed size exceeds limit
- Bomb protection: refuse if uncompressed estimate > 50x compressed size
- Only extract known extensions: `.zip`, `.tar.gz`, `.tgz`

---

## Configuration Keys (.local/config.json)

| Key | Default | Purpose |
|-----|---------|---------|
| `maxArchiveMB` | `10` | Max archive size before refusal |
| `httpTimeoutMs` | `30000` | HTTP fetch timeout |
| `allowInsecure` | `false` | Allow `http://` URLs |
| `defaultScope` | `auto` | `user`, `project`, or `auto` |
