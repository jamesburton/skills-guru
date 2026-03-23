# Docker Agent Skills Guide

Reference for `skills-guru` Docker Agent integration. Covers discovery, format differences, cross-agent operations (copy/move/edit), and conversion rules.

---

## What Are Docker Agent Skills?

Docker Agent (`docker-agent`) uses the same `SKILL.md` convention as Claude Code, but stores skills in different directories and supports additional frontmatter fields.

---

## Search Path Differences

### Claude Code

| Scope | Path | Search Type |
|-------|------|-------------|
| User-global | `~/.claude/skills/` | Flat (immediate children only) |
| Project | `<repo>/.claude/skills/` | Flat (repo root only) |
| Package | `<repo>/packages/*/.claude/skills/` | Flat |

### Docker Agent

Paths are listed in precedence order — later entries override earlier ones (lower in this list = higher precedence):

| Scope | Path | Search Type |
|-------|------|-------------|
| User-global (lowest) | `~/.codex/skills/` | Recursive |
| User-global | `~/.claude/skills/` | Flat |
| User-global (highest) | `~/.agents/skills/` | Recursive |
| Project | `<cwd>/.claude/skills/` | Flat (cwd only) |
| Project (highest) | `<each-dir-from-git-root-to-cwd>/.agents/skills/` | Flat (closer to cwd wins) |

**Key insight:** `~/.claude/skills/` is shared — skills there are discoverable by both Claude Code and Docker Agent. `.agents/skills/` directories are Docker Agent–only.

---

## Frontmatter Format Differences

### Claude Code (skills-guru rules)

```yaml
---
name: my-skill
description: Use when...
---
```

Required: `name`, `description`. The `description` must start with "Use when..." per skills-guru authoring rules.

### Docker Agent

```yaml
---
name: my-skill
description: Short description for agent matching (no "Use when..." requirement)
context: fork          # optional: run as isolated sub-agent
allowed-tools:         # optional: restrict available tools
  - filesystem
  - web_search
license: Apache-2.0   # optional
compatibility: Docker Agent >= 0.5, Node >= 18  # optional
metadata:             # optional: arbitrary key-value pairs
  author: my-org
  version: "1.0"
---
```

Required: `name`, `description` only.

### Compatibility Summary

| Field | Claude Code | Docker Agent |
|-------|-------------|--------------|
| `name` | Required | Required |
| `description` | Required, starts "Use when..." | Required, free-form |
| `version` | Recorded during install (memory) | Via `metadata.version` |
| `context` | Not supported | Optional (`fork`) |
| `allowed-tools` | Not supported | Optional |
| `license` | Not supported | Optional |
| `compatibility` | Not supported | Optional |
| `metadata` | Not supported | Optional |

---

## Discovery: Listing Docker Agent Skills

### Step 1: Find all docker-agent skill locations

```bash
# User-global
ls ~/.agents/skills/           # primary docker-agent global
ls ~/.codex/skills/            # codex agent global

# Project (from git root to cwd)
git rev-parse --show-toplevel  # get repo root
# Then walk from root to cwd, checking for .agents/skills/ at each level
```

### Step 2: Build combined scope map

Include both Claude Code and Docker Agent paths in the scope map:

```
[docker-agent] User-global:  ~/.codex/skills/
[docker-agent] User-global:  ~/.agents/skills/
[shared]       User-global:  ~/.claude/skills/
[docker-agent] Project:      <each-dir-from-git-root-to-cwd>/.agents/skills/
[shared]       Project:      <cwd>/.claude/skills/
```

Mark each entry with its agent type (`docker-agent`, `claude-code`, or `shared`).

---

## Cross-Agent Operations

### Copy skill from Claude Code to Docker Agent

Copies a skill from a Claude Code location to a Docker Agent location. The skill content is preserved; frontmatter is adapted if needed.

1. Identify source skill at `~/.claude/skills/<name>/` or `<repo>/.claude/skills/<name>/`.
2. Determine target path: `~/.agents/skills/<name>/` or `<repo>/.agents/skills/<name>/`.
3. Conflict check at target (see Conflict Handling in scope-guide.md).
4. Copy all files.
5. **Adapt frontmatter** only for Docker Agent–specific fields; copy `description` as-is (even if it starts with "Use when...", Docker Agent has no such requirement and keeping the text is safe).
6. Verify copy.
7. Report: "Copied `<name>` to Docker Agent scope at `<target-path>`."

### Copy skill from Docker Agent to Claude Code

Copies a skill from a Docker Agent location to a Claude Code location. Frontmatter is adapted to meet Claude Code authoring rules.

1. Identify source skill at `~/.agents/skills/<name>/` or `<repo>/.agents/skills/<name>/`.
2. Determine target path: `~/.claude/skills/<name>/` or `<repo>/.claude/skills/<name>/`.
3. Conflict check at target.
4. Copy all files.
5. **Adapt frontmatter:**
   - If `description` does not start with "Use when...", warn the user and offer to rewrite it — do not auto-prepend, as the result is likely to be grammatically incorrect. Present the original and ask the user for an appropriate "Use when..." rewrite, or offer to keep it as-is (with an ongoing Warning when used in Claude Code).
   - Remove or preserve unsupported fields (`context`, `allowed-tools`, `license`, `compatibility`, `metadata`):
     - `context: fork` — **remove** from Claude Code copy (not supported; would be ignored or cause confusion).
     - `allowed-tools` — **remove** from Claude Code copy (not applicable).
     - `license`, `compatibility`, `metadata` — **preserve as-is** (harmless extra frontmatter; Claude Code ignores unknown keys).
6. Verify copy.
7. Update `memory/sources.md` with new entry if the skill was not previously recorded.
8. Offer to add to `memory/trusted-skills.md`.

### Move skill between agent types

Same as copy operations above, but remove the source after a verified copy.

1. Perform the appropriate copy operation (Claude Code → Docker Agent or vice versa).
2. Verify the target.
3. Remove source directory.
4. Report: "Moved `<name>` from `<source-path>` to `<target-path>`."

### Edit skill (in-place, agent-aware)

When editing a skill that exists in a Docker Agent path:

1. Identify the skill and its agent type from the scope map.
2. Open `SKILL.md` at the path.
3. If the user is editing frontmatter fields specific to Docker Agent (`context`, `allowed-tools`, `license`, `metadata`), allow them — do not enforce Claude Code-only rules.
4. Validate: `name` and `description` are present and non-empty.
5. Save.

---

## Frontmatter Adaptation Rules

### Claude Code → Docker Agent

| Rule | Action |
|------|--------|
| `description` starts "Use when..." | Keep as-is (valid; Docker Agent has no format restriction) |
| Unknown fields | Preserve as-is |

Note: Version is recorded in `memory/sources.md` by skills-guru, not in SKILL.md frontmatter. No conversion is needed when copying to Docker Agent; add a `metadata.version` key only if you want Docker Agent to expose version information.

### Docker Agent → Claude Code

| Rule | Action |
|------|--------|
| `description` does not start "Use when..." | Warn user; prompt for a "Use when..." rewrite (do not auto-prepend) |
| `context: fork` | Remove (warn user: sub-agent context not supported in Claude Code) |
| `allowed-tools` | Remove (warn user: tool restriction not supported in Claude Code) |
| `license` | Preserve (harmless; ignored by Claude Code) |
| `compatibility` | Preserve (harmless; ignored by Claude Code) |
| `metadata` | Preserve (harmless; ignored by Claude Code) |

---

## Validating Docker Agent Skills

When validating a skill sourced from a Docker Agent path, relax the Claude Code-specific rules:

| Check | Claude Code Rule | Docker Agent Rule |
|-------|-----------------|-------------------|
| `name` present | Required | Required |
| `description` present | Required | Required |
| `description` starts "Use when..." | Warning | Not required |
| `version` present | Expected | Not required (use `metadata.version`) |
| `context` value | n/a | Must be `fork` if present |
| `allowed-tools` format | n/a | Must be YAML list or comma-separated string |

---

## Enabling Skills in docker-compose.yaml / agents.yaml

When helping a user enable Docker Agent skills in their project config:

```yaml
# agents.yaml or docker-compose.yaml agent section
agents:
  root:
    model: openai/gpt-4o
    instruction: You are a helpful assistant.
    skills: true
    toolsets:
      - type: filesystem   # required for reading skill files
```

The `skills: true` flag and `filesystem` toolset are both required for skill discovery to work.

---

## Precedence Reminder

When both Claude Code and Docker Agent discover the same skill name:

- Docker Agent: global → project (root → cwd); later overrides earlier.
- Claude Code: deeper (more specific) scope wins.
- Skills in `~/.claude/skills/` are visible to both agents — this is the recommended location for skills you want to share across agents.

---

## Common Workflows

### Share a skill across both agents

```
"Copy my-skill from ~/.claude/skills/ to ~/.agents/skills/"
```

Because `~/.claude/skills/` is flat-scanned by Docker Agent, the skill is already available there. The copy to `~/.agents/skills/` makes it available recursively and with higher precedence.

### Import a Docker Agent skill for use in Claude Code

```
"Copy create-dockerfile from .agents/skills/ to .claude/skills/"
```

skills-guru will adapt the frontmatter and install it into the Claude Code scope.

### Promote a project docker-agent skill to user-global

```
"Promote my-skill from .agents/skills/ to ~/.agents/skills/"
```

Same as a standard promote operation, but using Docker Agent paths.

### List all skills across all agents

```
"Show me all skills, including docker-agent skills"
```

Presents a combined scope map with agent-type labels.
