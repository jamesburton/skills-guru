# Skills Guru

Expert skill manager for Claude Code — install, scope, sync, and curate skills with secure config handling.

## Quick Install

**With sync (recommended):**
```bash
git clone --depth 1 --branch main \
  https://github.com/jamesburton/skills-guru.git \
  ~/.claude/skills/skills-guru
```

**Without sync:**
```bash
git clone --depth 1 https://github.com/jamesburton/skills-guru.git \
  ~/.claude/skills/skills-guru && \
  rm -rf ~/.claude/skills/skills-guru/.git
```

## Prerequisites

- `node` (>=18) — scripts are CommonJS (.cjs)
- `git` — sync, clone, divergence tracking
- `gh` CLI (optional) — required only for PR/fork operations

## What It Does

- **Install skills** from files, URLs, GitHub repos, gists, archives
- **Manage scope** — promote/demote skills between user-global, project, and package levels
- **Sync skills** from git repos with divergence tracking, fork/PR support
- **Curate a catalog** of trusted skills with ratings and notes
- **Enforce best practices** for skill authoring and organization
- **Secure config handling** — read/write config files with automatic secret masking

## Usage

Just invoke the skill — it detects your intent automatically:

- "Install this skill: https://github.com/user/cool-skill"
- "Move my-skill from global to this project"
- "Sync my skills from the team repo"
- "What skills do I have? Which are trusted?"
- "Read appsettings.json safely"
- "Audit your own rules"

## Memory System

| Directory | Contents | Shareable |
|-----------|----------|-----------|
| `memory/` | Trusted skills, known tools, custom rules, sources | Yes |
| `.local/` | Machine config, secret patterns, session secrets | Never |

## Self-Update

If installed with git:
- "Update yourself" — fast-forward from upstream
- "Reset yourself" — full reset to upstream (with confirmation)
- "What version am I on?" — show current commit

## Contributing

1. Fork the repo
2. Make changes
3. Say "Create PR to upstream" — skills-guru handles the rest
