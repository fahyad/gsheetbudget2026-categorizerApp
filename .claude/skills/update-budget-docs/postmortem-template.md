# Postmortem template — for `docs/findings.md`

Insert in `docs/findings.md` BEFORE older postmortems (newest first within the postmortem region).

## Format

```markdown
### <Title> (vX.Y)[ — CRITICAL[ UX]]

- **Symptom:** what the user observed. Quote the user verbatim where possible. Include exact dumpSheet output, exact PWA error message, exact Logs entry.
- **Verification:** (optional, only if a specific reproduction was needed) the exact dumpSheet/curl/code path that reproduced.
- **Root cause:** the actual mechanism. Be specific about the line / function / formula. If the cause is non-obvious, explain WHY the obvious explanation is wrong.
- **Why it cascaded:** (optional, only if one bug led to several user-visible errors) trace the chain.
- **Blast radius:** (optional, only if the bug was present across multiple releases / affected past data) which versions / how many runs / what state the user is left in.
- **Fix (vX.Y):** what was done. Include the new function/formula text inline. Mention the file + function name.
- **Lesson:** the durable takeaway — phrased as something a future-Claude can apply. NOT "we won't do this again" — something like "X always implies Y; check Y first." Lessons that are too narrow ("don't use XLOOKUP with multiplied booleans") are also useful — add to CLAUDE.md trip-up list.
```

## Section guidance

**Symptom** — required, must be the FIRST thing. The reader should know what hurt before reading anything else.

**Verification** — only if reproduction took effort. If "user said it broke" was enough, skip this section.

**Root cause** — required. If you don't know, write "Root cause: unknown — suspected X" and ALSO add an entry to `task_plan.md` Phase 19 deferred audit.

**Why it cascaded** — only when one cell / one variable / one function broke and produced multiple visible errors. Rare but useful when it applies.

**Blast radius** — only when the bug was latent across releases. Examples: "every Update Script run since v11.8" or "all transactions Apr 1-15 had wrong period". Skip if it was caught immediately.

**Fix** — required. Show the actual new code if it's small (< 10 lines). Else describe the change + reference the file. Always include version where it landed.

**Lesson** — required. The most-skimmed part of the file by future readers. If you can't think of a lesson, the postmortem may not be needed — consider whether it's just a session entry instead.

## Severity markers in title

- **`— CRITICAL`** — data loss, security exposure, or breaks the system end-to-end
- **`— CRITICAL UX`** — user-visible breakage that doesn't lose data but blocks the workflow
- **(no marker)** — anything else

## Length guidance

Median postmortem is 80-200 words. Outliers exist on both ends:
- A 30-word postmortem is fine if the bug really was that simple ("Code.js typo: `getSheets()` → `getSheetByName()`. Fix in vX.Y.")
- A 600-word postmortem is fine if there are 3 distinct sub-bugs or a long cascade trace

## Anti-patterns

- ❌ Don't write postmortems for code reviews / refactors with no specific bug
- ❌ Don't write postmortems for "user error" issues (data they entered wrong, period mis-selection) — write a "non-bug" entry instead, with the same Symptom/Diagnosis structure but no Fix section
- ❌ Don't include literal API keys, OAuth tokens, or other secrets in dumpSheet output — redact

## Example: minimal postmortem

```markdown
### Setup E10 trailing whitespace (v10.4) — non-bug

- **Symptom:** Budget Main Category column showed `""` for one category instead of "Nice Things".
- **Root cause:** Setup E10 contained `"Nice Things "` (trailing space). `INDEX/MATCH` against `"Nice Things"` returned no match.
- **Fix:** trimmed the cell. Added `cleanupSetupWhitespace_` to runs every Update Script.
- **Lesson:** trim user input at BOTH client and server. Belt-and-suspenders. Added to CLAUDE.md trip-up #4.
```

## Example: full postmortem with cascade

(See `findings.md` "Saving B3 XLOOKUP Out-of-Range (v11.10)" or "Budget #REF! After updateWorkbook (v11.12)" for full reference examples.)
