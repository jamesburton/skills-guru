# Skills Guru

Expert skill manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — install, scope, sync, and curate skills with secure config handling.

## Quick Install

**One-liner (recommended — keeps sync for updates):**

```bash
git clone --depth 1 https://github.com/jamesburton/skills-guru.git ~/.claude/skills/skills-guru
```

**Without sync (standalone copy):**

```bash
git clone --depth 1 https://github.com/jamesburton/skills-guru.git ~/.claude/skills/skills-guru && rm -rf ~/.claude/skills/skills-guru/.git
```

**Windows (PowerShell):**

```powershell
git clone --depth 1 https://github.com/jamesburton/skills-guru.git "$env:USERPROFILE\.claude\skills\skills-guru"
```

After install, the skill is immediately available — Claude Code discovers it automatically. Say "install a skill" or "what best practices should I follow?" to try it.

## Prerequisites

| Requirement | Purpose | Required |
|-------------|---------|----------|
| `node` >=18 | Scripts are CommonJS (.cjs), no npm deps | Yes |
| `git` | Clone, sync, divergence tracking | Yes |
| `gh` CLI | PR/fork operations only | Optional |

## What It Does

| Capability | Example |
|------------|---------|
| **Install skills** | From files, URLs, GitHub repos, gists, archives |
| **Manage scope** | Promote/demote between user-global, project, and package levels |
| **Sync skills** | Pull from git repos with divergence tracking, fork/PR support |
| **Curate a catalog** | Rate and tag trusted skills for quick selection |
| **Enforce best practices** | Authoring rules, ecosystem guardrails, anti-pattern detection |
| **Secure config handling** | Read/write config files with automatic secret masking |
| **Self-refinement** | Proposes improvements to its own rules when gaps found |

## Usage

Just tell Claude what you want — skills-guru detects intent and routes automatically:

```
"Install this skill: https://github.com/user/cool-skill"
"Move my-skill from global to this project"
"Sync my skills from the team repo"
"What skills do I have? Which are trusted?"
"Read appsettings.json safely"       ← secrets auto-masked
"Audit your own rules"               ← self-audit protocol
"What best practices should I follow for skills?"
```

## File Structure

```
~/.claude/skills/skills-guru/
├── SKILL.md                    # Core orchestration (76 lines)
├── references/                 # Detailed guides loaded on demand
│   ├── best-practices.md       #   Authoring, operational, ecosystem rules
│   ├── install-guide.md        #   Installation flow and validation
│   ├── scope-guide.md          #   Promote/demote/move/copy operations
│   ├── sync-guide.md           #   Git sync, fork, PR workflows
│   ├── memory-guide.md         #   Memory schemas and operations
│   ├── refinement-guide.md     #   Self-audit protocol
│   └── security-guide.md       #   Secret handling rules
├── scripts/                    # Node.js utilities (no npm deps)
│   ├── secret-patterns.cjs     #   3-layer secret detection engine
│   ├── config-reader.cjs       #   Read config → mask secrets → stdout
│   ├── config-writer.cjs       #   Write config ← restore secrets
│   ├── install-skill.cjs       #   Input detection + validation
│   └── git-sync.cjs            #   Sync utilities + divergence tracking
├── memory/                     # Shareable knowledge (your catalog)
│   ├── trusted-skills.md       #   Vetted skills with ratings
│   ├── known-tools.md          #   Tools and patterns encountered
│   ├── custom-rules.md         #   Your added best-practice rules
│   └── sources.md              #   Registered git repos
├── .local/                     # Private (gitignored, never shared)
│   ├── config.json             #   Local settings
│   ├── secret-rules.json       #   Custom secret detection patterns
│   └── session-secrets.json    #   Ephemeral (auto-cleared)
├── .gitignore
├── .claude-plugin/plugin.json
└── README.md
```

## Security

Skills-guru includes a complete secret-masking system for safely reading and editing config files:

- **Secrets are never exposed** in prompts, logs, or agent dispatches
- Config files are read through `config-reader.cjs` which replaces secrets with stable `{{SECRET:...}}` identifiers
- Edits are written back through `config-writer.cjs` which restores the originals
- 3-layer detection: key-name heuristics, value-pattern matching, user-configurable rules
- Session secrets are ephemeral (8h inactivity / 24h absolute TTL)
- Custom rules in `.local/secret-rules.json` for project-specific patterns

## Memory System

| Directory | What's in it | Shareable? |
|-----------|-------------|------------|
| `memory/` | Trusted skills catalog, known tools, custom rules, source repos | Yes — export/import |
| `.local/` | Machine config, secret patterns, session secrets | Never |

**Key separation:** sharing the skill shares only logic (SKILL.md + references/ + scripts/). Your memory and private config stay local.

## Self-Update

If you installed with git (the recommended method):

| Say this | What happens |
|----------|-------------|
| "Update yourself" | Fast-forward from upstream (safe, refuses if local changes) |
| "Reset yourself" | Hard reset to upstream (asks for confirmation) |
| "What version am I on?" | Shows current commit + checks for updates |
| "Switch to branch X" | Checks out a feature branch for testing |

Your `memory/` and `.local/` directories are **never touched** by self-sync.

## Contributing

1. **Fork** — `gh repo fork jamesburton/skills-guru`
2. **Clone your fork** — `git clone <your-fork-url> ~/.claude/skills/skills-guru`
3. **Make changes** — edit references, improve scripts, add rules
4. **Test** — `cd scripts && node test-secret-patterns.cjs && node test-config-reader.cjs && node test-config-writer.cjs && node test-install-skill.cjs && node test-git-sync.cjs`
5. **PR** — tell skills-guru "Create PR to upstream" or use `gh pr create`

## License

MIT
