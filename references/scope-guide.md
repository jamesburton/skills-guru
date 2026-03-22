# Scope Guide: Skill Location and Promotion

Reference for `skills-guru` scope operations. Covers hierarchy, discovery, operations, conflict handling, and monorepo patterns.

---

## Scope Hierarchy

```
~/.claude/skills/                          ← Level 0: User-global (available in all projects)
<repo>/.claude/skills/                     ← Level 1: Repo root (this repo only)
<repo>/src/.claude/skills/                 ← Level 2: Subfolder scoped
<repo>/packages/api/.claude/skills/        ← Level 2+: Monorepo package scoped
```

**Shadowing rule:** A skill at a lower (deeper) level shadows a same-named skill at a higher level. The deepest match wins at load time.

---

## Operations

| Operation | Direction | Source | Target | Original Kept? |
|-----------|-----------|--------|--------|----------------|
| `promote` | Up (wider scope) | Deeper level | Shallower level | Optional (copy or move) |
| `demote` | Down (narrower scope) | Shallower level | Deeper level | Optional (copy or move) |
| `move` | Any direction | Source scope | Target scope | No — removed from source |
| `copy` | Any direction | Source scope | Target scope | Yes — kept at source |

Default for `promote` and `demote`: **copy** (non-destructive). Pass `--move` to remove source.

---

## Scope Discovery

### Algorithm

1. Always include `~/.claude/skills/` (Level 0).
2. Find repo root: `git rev-parse --show-toplevel`. Fall back to `cwd` if not in a git repo.
3. Walk downward from repo root, up to `maxScanDepth` levels (default: **5**, configurable in `.local/config.json`).
4. At each directory level, check for `.claude/skills/` subdirectory.
5. Also apply monorepo pattern matching (see Monorepo Awareness below).
6. Build scope map: ordered list of `{ level, path, skills[] }`.

### Scope Map Output
```
Level 0 (user-global):  ~/.claude/skills/
  - git-master, skills-guru, …

Level 1 (repo root):    /home/user/myproject/.claude/skills/
  - api-helper, db-utils

Level 2 (package):      /home/user/myproject/packages/api/.claude/skills/
  - api-helper  ← shadows Level 1 api-helper
```

Skills marked with `← shadows` indicate an active override in play.

---

## Step-by-Step: Common Operations

### Move skill from global to this project
1. Identify skill name and confirm it exists at `~/.claude/skills/<name>/`.
2. Determine project `.claude/skills/` path from scope map.
3. Conflict check at target (see Conflict Handling below).
4. Copy `~/.claude/skills/<name>/` to `<repo>/.claude/skills/<name>/`.
5. Verify copy: read `SKILL.md` at target, confirm identical.
6. Remove original at `~/.claude/skills/<name>/`.
7. Update `memory/sources.md` with new scope entry.

### Promote skill from package to repo root
1. Identify skill at `<repo>/packages/api/.claude/skills/<name>/`.
2. Conflict check at `<repo>/.claude/skills/<name>/`.
3. Copy to `<repo>/.claude/skills/<name>/`.
4. Verify.
5. If `--move`: remove from `<repo>/packages/api/.claude/skills/<name>/`.

### Copy skill from project to global
1. Identify skill at `<repo>/.claude/skills/<name>/`.
2. Conflict check at `~/.claude/skills/<name>/`.
3. Copy to `~/.claude/skills/<name>/`.
4. Verify. Original stays in place.
5. Note: skill is now present at two levels — project will still shadow global.

### Resolve shadowing intentionally
If `api-helper` at Level 2 shadows Level 1 and you want unified behavior:
1. Run `promote api-helper --move` from Level 2 to Level 1.
2. This removes the deeper copy and places it at Level 1 only.
3. No more shadowing conflict.

---

## Conflict Handling

When a skill with the same name already exists at the target scope:

### Step 1: Check content equality
Compare `SKILL.md` (and all files) byte-for-byte.
- **Identical content** → skip silently. Print: `Already up to date at target.`

### Step 2: Content differs — present options
```
Conflict: api-helper already exists at target.
  [1] Overwrite target with incoming version
  [2] Keep target, discard incoming
  [3] Show diff summary for manual resolution
```

**Overwrite:** Replace all files at target with source files.

**Keep target:** Abort operation. No changes made.

**Show diff:** Print a side-by-side line diff of `SKILL.md`. Print filenames of any additional differing files. Abort after display — no automated merge. User resolves manually, then re-runs the operation.

No three-way merge or automated conflict resolution is performed.

---

## Monorepo Awareness

### Pattern Detection

During scope discovery, match directories within the repo that follow monorepo conventions:

| Pattern | Example |
|---------|---------|
| `packages/*/` | `packages/api/`, `packages/ui/` |
| `apps/*/` | `apps/web/`, `apps/mobile/` |
| `libs/*/` | `libs/shared/`, `libs/utils/` |
| `src/*/` | `src/server/`, `src/client/` |
| `projects/*/` | `projects/alpha/`, `projects/beta/` |

Each matched subdirectory is checked for a `.claude/skills/` folder and added to the scope map at the appropriate level.

### Contextual Suggestions

When a skill is found only at a package level, offer:
> "api-helper is package-scoped. Promote to repo root to share across all packages?"

When a skill exists at global but not in the monorepo at all, offer:
> "git-master is user-global. Demote to this repo for project-specific overrides?"

### Typical Monorepo Patterns

| Scenario | Recommended Action |
|----------|--------------------|
| Shared utility skill used by all packages | `promote` to repo root or global |
| Package-specific skill with local overrides | Keep at package level (intentional shadow) |
| Global skill being customized per-repo | `copy` to repo root, then edit |
| Cleaning up accidental shadows | `promote --move` to consolidate |

---

## Shadowing Reference

| Rule | Details |
|------|---------|
| Deeper wins | Level 2 shadows Level 1 shadows Level 0 |
| Same name, any content | Shadow applies regardless of whether content differs |
| Resolve with promote | Use `promote --move` to collapse to a single scope |
| Inspect shadows | Scope map output marks all active shadows |

---

## Configuration Keys (.local/config.json)

| Key | Default | Purpose |
|-----|---------|---------|
| `maxScanDepth` | `5` | How many directory levels to walk during discovery |
| `defaultScopeOp` | `copy` | Default for promote/demote: `copy` or `move` |
| `monorepoPatterns` | see above | Array of glob patterns to match monorepo subdirs |
