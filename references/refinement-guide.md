# Refinement Guide

Reference for how skills-guru improves its own rules over time — both reactively during use and proactively on demand.

---

## Triggered Refinement (During Normal Operation)

When skills-guru encounters an ambiguous situation during any operation:

1. **Resolve** using best judgment in the moment — do not block the user
2. **Identify the gap:** which reference file or SKILL.md section was unclear or missing?
3. **Draft a specific edit** using the format below
4. **Present to user** for approval before applying
5. **If approved** → apply the edit immediately
6. **If rejected** → optionally save the resolved behavior to `memory/custom-rules.md` as a local-only note for future reference

This keeps skills-guru useful while accumulating improvements incrementally.

---

## Requested Self-Audit Protocol

Triggered by: "audit yourself", "review your rules", or similar phrasing.

**Steps:**

1. Read own `SKILL.md` completely
2. Read all files in `references/` directory
3. Read `memory/custom-rules.md` for accumulated edge cases and local notes
4. Cross-reference and check for:
   - **Gaps:** Rules in `custom-rules.md` not yet reflected in the reference files
   - **Contradictions:** Conflicting guidance between files (e.g., SKILL.md says one thing, a reference says another)
   - **Staleness:** References to tools, patterns, or skills that no longer exist
   - **Self-violations:** Does SKILL.md follow its own `best-practices.md` rules? (frontmatter format, line count, "When NOT to use" section, etc.)
5. Check frontmatter: is the description still accurate given current capabilities?
6. Report findings as a structured list grouped by category
7. Propose a specific edit for each finding
8. Apply **only with user approval** — never auto-apply audit changes

---

## Edit Proposal Format

All proposed edits, whether triggered or from a self-audit, use this format:

```
**File:** references/best-practices.md
**Section:** Anti-Patterns
**Current:** (exact text if modifying, "N/A" if adding new content)
**Proposed:** (the new or replacement text)
**Rationale:** (why this change improves the skill)
```

Multiple edits in one proposal are presented as a numbered list, each in this format. User can approve all, approve individually, or reject any.
