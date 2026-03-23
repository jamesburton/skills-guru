# Skill Authoring Best Practices

Reference guide for creating, maintaining, and governing skills. Apply these rules when creating
new skills, reviewing existing ones, or advising on skill architecture.

---

## Authoring Rules

### Frontmatter

- Include only `name` and `description` fields — no other frontmatter keys
- Total frontmatter block must not exceed 1024 characters
- `name`: kebab-case only — lowercase letters, numbers, and hyphens; no underscores, spaces, or special characters
- `description`: MUST begin with "Use when..." — describes the conditions that trigger the skill, not what the skill does

**Valid:**
```yaml
---
name: api-error-handler
description: Use when Claude encounters HTTP errors, API timeouts, rate limiting, or connection failures and needs to apply retry logic or error recovery strategies.
---
```

**Invalid:**
```yaml
---
name: api_error_handler        # underscores not allowed
description: Handles API errors # does not start with "Use when..."
tags: [api, errors]            # no extra frontmatter fields
---
```

### SKILL.md Size and Structure

- Keep SKILL.md under 500 lines; if it exceeds this, move heavy content into `references/`
- The `references/` subdirectory is one level deep only — no nested subdirectories within references
- Do not use `@`-prefixed file loads inside SKILL.md (e.g., `@references/guide.md`) — these cause context bloat by loading the entire file immediately on skill activation
- Instead, instruct Claude to read specific reference files only when their content is needed for the current task
- Break long procedural sections into references files, keeping SKILL.md as the entry point with navigation guidance

### Tone and Voice

- Write in third person, imperative tone throughout: "Check the config file", not "You should check" or "I will check"
- Avoid first-person ("I", "we") and second-person speculation ("you might want to")
- State rules directly: "Abort if session is stale", not "It would be best to abort if..."

### Required Sections

Every skill MUST include a "When NOT to use" section that clearly defines:
- Situations where a different skill is more appropriate
- Task types that are out of scope for this skill
- Conditions under which the skill should defer to another approach

Example:
```markdown
## When NOT to Use

- Use `git-master` instead when the task is purely about commits and branching
- Do not activate for one-off scripts — use ad-hoc commands instead
- Skip if the project already has a dedicated CI workflow for this concern
```

### CSO — Claude Search Optimization

The `description` field is the primary discovery mechanism. Claude matches skills by reading
descriptions, not filenames or headings. Optimize descriptions for discovery:

- Include error messages users might paste: "connection refused", "ENOENT", "401 Unauthorized"
- Include symptom language: "slow builds", "flaky tests", "memory leak"
- Include tool names: "webpack", "prisma", "jest", "docker-compose"
- Include synonyms and alternate phrasings: "auth / authentication / login / JWT"
- Avoid generic phrases that match everything: "general development", "code quality"

**High-discovery description:**
```
Use when encountering Prisma migration errors, schema drift warnings, "P1001: Can't reach database"
errors, or when needing to reset, seed, or introspect a database schema.
```

**Low-discovery description:**
```
Use for database-related tasks.
```

---

## Operational Rules

### Scope Selection

- Project-level (`.claude/skills/`) is the default scope for all new skills
- Promote to user-global (`~/.claude/skills/`) only after the skill has proven useful across three or more separate projects
- Do not create user-global skills for project-specific conventions, paths, or toolchains

### Monorepo Layout

- Place shared skills at the repository root `.claude/skills/`
- Place package-specific skills in `packages/<name>/.claude/skills/`
- Skills in a package directory apply only when working within that package's subtree

### Name Collision Resolution

- Project-level skills shadow (take precedence over) user-global skills with the same name
- When shadowing is intentional, document the override reason in the skill's frontmatter description
- Avoid creating project-level skills that silently override global behavior without justification — this creates confusion when switching projects

### Testing Skills

- Test every skill before relying on it in production workflows
- Use the `superpowers:writing-skills` TDD approach: describe expected behavior, verify skill produces it, iterate
- Do not trust a skill that has never been exercised end-to-end on a real task

### Focus Principle

- One skill, one concern
- If a skill addresses more than one distinct domain (e.g., "handles auth AND database AND caching"), split it
- Focused skills are easier to maintain, test, and discover

---

## Ecosystem Guardrails

### Size Limits

- Hard limit: SKILL.md must not exceed 500 lines
- Combined limit: SKILL.md plus all files in `references/` must total fewer than 2000 lines
- Warn (and recommend refactoring) if activating a skill would load more than 50KB into context

### Dependency Rules

- No circular skill references: if Skill A instructs Claude to read Skill B, Skill B must not reference back to Skill A
- Detect circular chains at authoring time, not at runtime

### Duplication Guardrails

- Do not create skills that duplicate content already in `CLAUDE.md` — use `CLAUDE.md` for project conventions that always apply
- Skills are for on-demand behaviors; CLAUDE.md is for persistent project context

### One-Off vs. Recurring

- Do not create skills for one-time tasks — use ad-hoc Claude commands instead
- Skills earn their place when the same workflow recurs across multiple sessions or projects

### Plugin Skills vs. Custom

- Prefer established plugin skills (from the OMC ecosystem or trusted sources) over custom implementations when they cover the same need
- Custom skills for well-covered domains require justification

### Staleness

- Flag skills not updated in more than six months as potentially stale
- Review stale skills against current toolchain versions before use
- Add a `last-verified` comment in the skill if the maintainer has confirmed it still works

---

## Docker Agent Compatibility

Skills in `~/.claude/skills/` are automatically discoverable by both Claude Code and Docker Agent (flat scan). Skills in `.agents/skills/` or `~/.agents/skills/` are Docker Agent–only.

### Cross-Agent Authoring

- The Claude Code `description: Use when...` convention is **not required** by Docker Agent. A description without that prefix is valid for Docker Agent and still works in Claude Code (downgraded to a Warning, not an Error).
- Docker Agent supports additional frontmatter fields (`context`, `allowed-tools`, `license`, `compatibility`, `metadata`). These fields are **harmless** in Claude Code — unknown frontmatter keys are ignored.
- The `context: fork` field is Docker Agent–specific. Claude Code does not support sub-agent context isolation; omit it when the skill is intended for Claude Code only.
- For skills meant to work in both agents, place them in `~/.claude/skills/` or `<repo>/.claude/skills/` and avoid `context: fork`.

### Enabling Skills in docker-agent

Docker Agent requires both `skills: true` and a `filesystem` toolset in the agent config:

```yaml
agents:
  root:
    model: openai/gpt-4o
    instruction: You are a helpful assistant.
    skills: true
    toolsets:
      - type: filesystem   # required for reading skill files
```

Without `filesystem`, skill files cannot be read even if `skills: true` is set.

---

## Anti-Patterns

### Kitchen Sink Skills

**Pattern:** A single skill exceeding 800 lines that handles multiple unrelated concerns.

**Problem:** Loads excessive context, hard to maintain, discovery description becomes vague.

**Fix:** Split into focused skills, each under 500 lines, each with a precise description.

---

### Vague Descriptions

**Pattern:** `description: Use when doing general development tasks.`

**Problem:** Matches nothing specifically; Claude will not select it over more targeted skills.

**Fix:** Name concrete tools, errors, symptoms, or workflows the skill addresses.

---

### Overriding Core Behavior Without Justification

**Pattern:** A skill that instructs Claude to ignore built-in safety checks, override default tool behavior, or bypass standard protocols.

**Problem:** Fragile, confusing when combined with other skills, may break unexpectedly after updates.

**Fix:** Override only what is necessary, document the reason explicitly, and narrow the scope to specific task conditions.

---

### Diverging Duplicate Scopes

**Pattern:** The same skill name exists at both project and global scope, but the two versions have diverged in content.

**Problem:** Shadowing makes the global version invisible in that project, and divergence is invisible to maintainers.

**Fix:** Either consolidate into one canonical version or rename one to eliminate the collision.

---

### Hardcoded Paths, URLs, or Environment Values

**Pattern:** `/home/user/myproject/`, `https://internal.corp/api`, `NODE_ENV=production` embedded in skill logic.

**Problem:** Skill breaks when used on a different machine, project, or environment.

**Fix:** Reference environment variables, relative paths, or configuration files instead of literal values.

---

### Embedded Secrets or Credentials

**Pattern:** API keys, passwords, tokens, or private URLs written directly into skill content.

**Problem:** Skills are committed to version control and shared across contexts — a critical security vulnerability.

**Fix:** Never embed secrets. Use the config-reader/config-writer workflow (see `security-guide.md`) or reference environment variables.

---

### Description Summarizing the Workflow

**Pattern:** `description: Use when you want Claude to first explore the codebase, then generate a plan, then execute changes, then run tests.`

**Problem:** Claude may follow the description as instructions rather than reading the full skill body, producing partial or incorrect behavior.

**Fix:** Descriptions should describe *when* to activate the skill (conditions, triggers, symptoms), not *what* the skill does. The skill body contains the workflow.
