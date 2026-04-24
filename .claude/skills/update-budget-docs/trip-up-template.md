# Trip-up template — for `CLAUDE.md`

Add to the numbered list under `## Things that will trip you up`. Use the next sequential number.

## Format

```markdown
N. **One-line summary.** Detail in 1-3 sentences. See `docs/findings.md` "Postmortem Title".
```

## Rules for whether to add a trip-up

ADD a trip-up when:
- The bug is in a class that has bitten BEFORE (recurring) — high priority
- The bug stems from a non-obvious external behavior (Google API quirk, browser API requirement, formula language gotcha)
- The fix established an INVARIANT that future code must respect (e.g., "X must run after Y in updateWorkbook")
- A future-Claude could plausibly make the same mistake
- The lesson is short enough to fit in one line + brief detail

DO NOT add a trip-up when:
- The bug was a typo / one-off / code-specific issue with no general lesson
- The lesson is already covered by an existing trip-up
- The fix is purely defensive (can't be repeated by accident)
- Adding it would dilute the existing list (current list is 12 items — keep it scannable)

## Format constraints

- **Bold the summary** — first sentence is what the reader skims
- Detail is 1-3 sentences MAX — if it needs more, link to findings.md
- ALWAYS link to the corresponding findings.md postmortem by section title
- Use backticks for code/symbol names (`function_name()`, `setNamedRanges_`)
- Numbered (not bulleted) — preserves stable references like "see trip-up #11"

## Where to insert

Append to the END of the numbered list. Renumbering existing items is OK if needed for grouping but NOT necessary — chronological-by-discovery order is acceptable.

## Severity callout (optional)

For trip-ups that are higher-stakes than the rest, prepend a callout:

```markdown
> ⚠️ **<urgent context>**: <reason this matters>

1. **First trip-up...**
```

The Available-rollover callout (currently at the top of the list) is one example. Use sparingly — too many callouts and the file becomes shouty.

## Examples

### Good (specific + actionable + linked)

```markdown
12. **updateWorkbook's in-place per-row setFormula refresh silently fails (v11.12).** The same setFormula text that works from `rebuildBudgetInternal_` stored `#REF!` when called from the in-place loop inside `updateWorkbook` — even when the named ranges existed (dashboard formulas in the same tab resolved correctly). Root cause unknown; suspected Apps Script state-commit quirk. Fix: `updateWorkbook` now calls `rebuildBudgetInternal_('refresh', ss)` instead of the per-row loop. Don't reintroduce per-row refresh in `updateWorkbook`. See `docs/findings.md` "Budget #REF! After updateWorkbook (v11.12)".
```

### Bad (too vague, no link)

```markdown
N. **Watch out for #REF! errors.** They can happen sometimes.
```

### Bad (too long)

```markdown
N. **Long preamble explaining context that the reader didn't ask for.** [Multi-paragraph history of how the bug was discovered, what was tried, what worked, what didn't, plus three sub-cases and an architectural overview of the affected subsystem...]
```

## Anti-patterns

- ❌ Don't link to a non-existent findings.md section
- ❌ Don't add trip-ups for fixes that don't have a reusable lesson
- ❌ Don't write a trip-up that contradicts an existing one without addressing the conflict
- ❌ Don't use trip-ups as a place to vent ("This stupid Google API...")
- ❌ Don't repeat the same lesson under different titles
