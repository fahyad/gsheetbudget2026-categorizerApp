# Session entry template — for `docs/progress.md`

Append to the BOTTOM of `docs/progress.md`. The file is chronological — never insert in the middle.

## Format

```markdown
## Session: YYYY-MM-DD[ (cont. | later | later 2 | etc.)] — short title

### Setup
What the user reported / asked for / context. 1-3 sentences. If a specific user message triggered the session, quote the relevant phrase.

### Diagnosis
(Or: "Investigation" / "Design" / "Decision" — pick what fits)
What was done to understand the problem / explore the design space. Include dumpSheet outputs, formula traces, options considered.

### Fix
(Or: "Implementation" / "Outcome")
What was done. Include version landed, files touched, key code snippets if instructive.

### Status[ — VERIFIED WORKING | IN PROGRESS | PENDING USER ACTION]
- vX.Y deployed @N (commit `<short-hash>`)
- User next steps OR verification result OR what's blocked on
- Anything for the next session to pick up
```

## Section guidance

**Title:**
- Use a single date plus a `(cont.)` / `(later)` / `(later 2)` qualifier for multiple sessions on the same day
- Short title is 3-7 words, captures the work theme. Examples: "Saving Tab Bring-Up Bugs (v11.9 + v11.10)", "PWA Period Filter (v0.11)", "Gas Rollover Investigation"

**Setup** — required. The READER may be picking up the session log fresh; they need context. Include:
- What triggered this work (user message, scheduled review, observation)
- The pre-existing state if relevant ("v11.10 just shipped...")
- 1-3 sentences. Don't overdo it.

**Diagnosis** (or equivalent) — usually required.
- For bug-fixes: how was the root cause found? What was tried that didn't work?
- For features: what design decisions were made and why?
- For verification: what was checked and how?

**Fix** (or equivalent) — usually required.
- What landed (commit hash, version)
- Files touched
- Key code if non-obvious

**Status** — REQUIRED. Always. Even if the session ended in the middle.
- Include the status marker in the heading: `### Status — VERIFIED WORKING` etc.
- List the deployment commit hash + deployment number
- Be EXPLICIT about what's done and what's not
- If user has next steps (run Update Script, edit a cell), say so clearly so a future session knows to check

## Tone

Match the rest of the file: matter-of-fact, technical, occasionally use **bold** for emphasis on key insights, code blocks for actual code/output. Don't over-narrate ("First I did X, then I did Y") — focus on what was learned.

## Length

Median: 200-500 words. Outliers fine:
- 50-word entry for a verification-only session
- 1000-word entry for a multi-bug investigation with full traces

## Stale state cleanup

When writing a NEW session entry that resolves a previous "user needs to run X" status:
1. ALSO update the previous entry's Status to mark X as resolved
2. Keep the previous entry intact otherwise — it's history, not living state

Example: previous session ended with `Status: User needs to run Update Script`. New session confirms they did. Update previous entry to:
```
### Status — RESOLVED 2026-04-20
- vX.Y deployed @N (commit ...)
- User ran Update Script. Verified via dumpSheet (see Session 2026-04-20 entry).
```

Don't delete the previous entry — append to its Status line.

## Anti-patterns

- ❌ Don't insert sessions in the middle of the file (chronological order matters)
- ❌ Don't write a Status section that just says "Done" — what version, what commit, what verified
- ❌ Don't use vague titles ("More fixes", "Bug fixes") — be specific
- ❌ Don't write entries for sessions with no concrete outcome (no decision, no code, no verification) — those are conversations, not sessions
- ❌ Don't omit the Status header — even if the answer is "left in progress"

## Example: short verification session

```markdown
## Session: 2026-04-21 — v11.13 verification

### Setup
User ran v11.13 Update Script (the GitHub-Claude-prepared logClientMetrics endpoint). Wanted to confirm everything works before using it from the PWA.

### Diagnosis
dumpSheet on Logs tab + curl on the new `/logClientMetrics` endpoint with a sample payload. Both clean.

### Status — VERIFIED WORKING
- v11.13 deployed @33 (commit `abc1234`)
- New endpoint accepts JSON body, logs to Logs tab
- No follow-up needed
```

## Example: full session

(See `docs/progress.md` "Session: 2026-04-19 — Integrated Code Review" or "Session: 2026-04-20 — Saving Tab Bring-Up Bugs" for full reference.)
