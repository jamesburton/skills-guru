# Sync Guide

Reference for syncing skills with remote sources and managing self-updates.

---

## Source Registry

Stored in `memory/sources.md`. Format:

```markdown
## Registered Sources
### <source-name>
- URL: <git URL>
- Branch: <branch>
- Last sync: <ISO timestamp>
- Skills: [skill-a, skill-b]
- Fork of: <upstream URL> (optional)

#### <skill-name>
- Installed: <date> from commit <sha>
- Local status: clean | diverged
- Remote status: unchanged | updated
```

---

## Sync Operations

| Command | Behavior |
|---------|----------|
| `sync` | Pull latest from source, merge with local |
| `reset` | Discard local changes, replace with source version |
| `push` | Push local changes to fork/remote |
| `fork` | Clone source to user's GitHub, register as new source |
| `pr` | Create PR from local changes against upstream |
| `diff` | Show local vs upstream changes |

---

## Sync Flow

For each skill registered to a source:

1. **Identical** → skip (no action needed)
2. **Only remote changed** → update local automatically
3. **Only local changed** → keep local, mark status as `diverged`
4. **Both changed** → show diff, ask user to choose: keep local / take remote / open editor

After sync: update `memory/sources.md` with new timestamp and commit SHA.

---

## Push / PR Flow

1. Check `memory/sources.md` for a registered fork
   - If no fork found: offer to create one via `gh repo fork`
   - If `gh` not installed: provide manual instructions (fork on GitHub, add as remote)
2. Create branch: `skills-guru/<skill-name>-update`
3. Copy local skill files into branch, commit with descriptive message
4. Push branch to fork
5. Create PR via `gh pr create` targeting the upstream repo

---

## Self-Sync Operations

Applies when the skills-guru directory itself is a git repository.

| Command | Behavior |
|---------|----------|
| `update yourself` | `git fetch` + fast-forward only; refuses if local changes would be overwritten |
| `reset yourself` | `git reset --hard` to upstream HEAD (requires explicit user confirmation) |
| `what version` | `git log -1 --oneline` + compare with remote to show if behind |
| `switch to branch X` | `git fetch` + `git checkout X` |

---

## Self-Sync Safety Rules

**Before any self-sync:**
- Verify `.local/` is listed in `.gitignore` — refuse to proceed if it is not
- Warn if SKILL.md or any `references/` file has uncommitted local changes
- Offer options: stash changes / abort / force (with confirmation)

**What self-sync touches (only):**
- `SKILL.md`
- `references/` directory
- `scripts/` directory
- Root config files: `.gitignore`, `.claude-plugin/`

**What self-sync NEVER touches:**
- `memory/` — always preserved
- `.local/` — always preserved

Fast-forward only is enforced by default. Diverged local history requires `--force` flag and explicit confirmation.

---

## Custom Fork Support

When two remotes are detected (`origin` = personal fork, `upstream` = official source):

| Command | Action |
|---------|--------|
| `sync from upstream` | Pull official updates into local |
| `push to origin` | Push local changes to personal fork |
| `pr to upstream` | Open PR from fork branch to official repo |

skills-guru detects dual-remote configuration automatically and adjusts sync behavior accordingly.

---

## Security

- `.local/` is never synced — enforced by both `.gitignore` and a check in `git-sync.cjs`
- All files staged for push are scanned for secrets before push proceeds
- Auth tokens stored in `.local/config.json`, passed to git operations via environment variables
- Tokens are never embedded in remote URLs
