---
name: skills-guru
description: Use when installing, managing, moving, reviewing, syncing, or auditing Claude Code skills — handles skill files from URLs/repos/archives, manages user vs project scope, maintains a trusted skills catalog, and enforces authoring best practices
---

# Skills Guru

Expert skill manager for Claude Code. Orchestrates installation, scoping, synchronization, memory, quality enforcement, and secure config handling.

## When NOT to Use

- Writing a new skill from scratch → use `writing-skills` (TDD methodology)
- Project-specific conventions → use CLAUDE.md
- One-off automation → use commands
- Editing skill content directly → edit the SKILL.md file

## Security Protocol

**HARD RULES — no exceptions:**
- NEVER include secrets in prompts, logs, tool outputs, or agent dispatches
- ALL config file reads MUST go through `scripts/config-reader.cjs`
- ALL config file writes MUST go through `scripts/config-writer.cjs`
- NEVER read `.local/session-secrets.json` directly — only the scripts access it
- Before ANY push/sync/PR operation, run `config-reader.cjs --verify` on all files
- If `config-reader.cjs` or `config-writer.cjs` reports an error, STOP and report to user

## Sub-Operations

Detect user intent and load the appropriate reference file:

| Intent Keywords | Load Reference | Script |
|----------------|---------------|--------|
| install, add, URL/path given | `references/install-guide.md` | `scripts/install-skill.cjs` |
| move, copy, promote, demote | `references/scope-guide.md` | file operations via Bash |
| docker-agent, .agents/skills, cross-agent, agents skills | `references/docker-agent-guide.md` | file operations via Bash |
| sync, update, reset, push, pr, fork | `references/sync-guide.md` | `scripts/git-sync.cjs` |
| remember, catalog, trusted, sources, known tools | `references/memory-guide.md` | — |
| audit, review rules, refine self | `references/refinement-guide.md` | — |
| read config, edit config, mask secrets | `references/security-guide.md` | `scripts/config-reader.cjs`, `scripts/config-writer.cjs` |
| best practice, should I, how should | `references/best-practices.md` | — |

**After loading a reference, follow its instructions exactly.**

## Core Rules

1. **Default scope is project-level.** Only promote to user-global when skill is proven across 3+ projects.
2. **Always validate frontmatter** after any install operation.
3. **Always record source** in `memory/sources.md` for installed skills.
4. **Always offer** to add installed skills to `memory/trusted-skills.md`.
5. **Never modify memory/** during sync operations — sync only touches skill logic files.
6. **Self-edits require user approval.** Never auto-apply changes to own files.
7. **Secrets never appear** in prompts, logs, or agent dispatches.

## Memory Separation

| What | Where | Shareable |
|------|-------|-----------|
| Skill logic | `SKILL.md` + `references/` + `scripts/` | Yes (git sync) |
| Knowledge | `memory/` | Yes (export/import) |
| Private config | `.local/` | Never |

- **Share the skill** = copy SKILL.md + references/ + scripts/ (no personal data)
- **Share knowledge** = export memory/ separately
- **Reset the skill** = replace from source, memory untouched
- **Clear knowledge** = wipe memory/ files, skill logic untouched

## Self-Refinement

When an ambiguous situation is encountered during operation:
1. Resolve using best judgment
2. Identify which reference or section was unclear
3. Draft a specific edit with rationale
4. Present to user — apply ONLY if approved
5. If rejected, optionally save to `memory/custom-rules.md`

When user requests "audit yourself" or "review your rules":
1. Load `references/refinement-guide.md` for the full audit protocol
