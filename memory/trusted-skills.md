# Trusted Skills Catalog

<!-- Format for entries:
### <skill-name>
- **Source:** <plugin or path or URL>
- **Rating:** essential | recommended | situational | experimental | deprecated
- **Tags:** #tag1 #tag2
- **Notes:** Brief description of value and when to use
- **Install:** <install command or path>
-->

<!-- Add entries below as skills are vetted -->

### autoresearch
- **Source:** https://github.com/uditgoenka/autoresearch
- **Rating:** recommended
- **Tags:** #automation #iteration #autonomous #research #security #debugging
- **Notes:** Autonomous goal-directed iteration for Claude Code — inspired by Karpathy's autoresearch. Runs a continuous loop: make focused change → verify mechanically → keep or auto-revert → log everything. Includes 9 commands: core loop, planning wizard, security audits (STRIDE/OWASP), deployment, scientific debugging, error elimination, documentation generation, edge-case exploration, and multi-persona analysis. One change per iteration ensures atomic, traceable improvements.
- **Install:** `/plugin marketplace add uditgoenka/autoresearch` then `/plugin install autoresearch@autoresearch`

### get-shit-done
- **Source:** https://github.com/gsd-build/get-shit-done
- **Rating:** essential
- **Tags:** #workflow #planning #execution #context-engineering #parallel #atomic-commits #multi-agent
- **Notes:** Meta-prompting and spec-driven development system for Claude Code. Solves context degradation with structured discuss → plan → execute → verify → ship cycles. Parallel execution in dependency-aware waves, atomic commits per task, multi-agent orchestration (research, planning, execution, debugging), state persistence across sessions. Quick mode for ad-hoc tasks. Supports 30+ commands including new-project, discuss-phase, plan-phase, execute-phase, verify-work, debug, pause/resume-work. Works with Claude Code, OpenCode, Gemini CLI, Codex, Copilot, Cursor.
- **Install:** `npx get-shit-done-cc@latest`
