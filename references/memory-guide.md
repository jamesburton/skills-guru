# Memory Guide

Reference for the memory system: file formats, operations, and the separation guarantee.

---

## Memory Files and Schemas

### trusted-skills.md

Curated list of skills the user trusts and wants surfaced in recommendations.

```markdown
### <skill-name>
- **Source:** <plugin, path, or URL>
- **Rating:** essential | recommended | situational | experimental | deprecated
- **Tags:** #tag1 #tag2
- **Notes:** Brief description of value and when to use
- **Install:** <install command or path>
```

**Rating meanings:**

| Rating | Meaning |
|--------|---------|
| `essential` | Always load/use; core to workflow |
| `recommended` | Use in most cases; strong default |
| `situational` | Only in specific contexts (named in Notes) |
| `experimental` | Untested or unstable; use with caution |
| `deprecated` | Should be replaced; kept for reference only |

---

### known-tools.md

Notes on external tools encountered during skill operations.

```markdown
### <tool-name>
- **Context:** Where/how this tool is relevant
- **Recommendation:** When to use or avoid
- **Caveats:** Known issues or limitations
```

---

### custom-rules.md

User-specific overrides, local policies, and edge-case notes that don't belong upstream.

```markdown
### <rule-name>
- **Rule:** The guidance
- **Rationale:** Why this rule exists
- **Applies to:** Scope (all skills, specific types, etc.)
```

---

### sources.md

Registry of remote skill sources and sync state. Format documented in `sync-guide.md`.

---

## Memory Operations

| Operation | How it works |
|-----------|-------------|
| `review` | Read and display a formatted summary of the specified memory file(s) |
| `add` | Append a new `### heading` entry in the correct format for that file |
| `edit` | Locate entry by `### heading` name, modify the specified fields |
| `remove` | Locate entry by `### heading` name, delete from that heading until the next `###` |
| `clear` | Replace file content with the header line and format comment only; structure preserved |
| `export` | Copy `memory/` files to a target path or git repo |
| `import (replace)` | Overwrite the target memory file with imported content entirely |
| `import (merge)` | Append new entries by heading name; skip exact duplicates; flag conflicts (same name, different content) for manual resolution |

---

## Separation Guarantee

The memory system is explicitly separated from the skill logic:

| Action | What it touches |
|--------|----------------|
| Share the skill | `SKILL.md` + `references/` + `scripts/` only — no personal data |
| Share knowledge | Export `memory/` separately and deliberately |
| Reset the skill | Replace from source; `memory/` is never touched |
| Clear memory | Wipe `memory/` files; skill logic is never touched |

This means users can freely update skills-guru from upstream, share it with others, or reset it to defaults — without any risk of exposing or losing personal memory data.
