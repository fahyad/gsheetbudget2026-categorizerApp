# Phase entry template — for `docs/task_plan.md`

Phases group meaningful units of work. NOT every commit is a Phase. NOT every bug fix is a Phase.

## When to add a NEW Phase entry

ADD a new Phase when:
- A new feature is shipped (e.g., new tab, new endpoint, new PWA capability)
- A multi-version arc completes (e.g., "Saving Tab v11.8 → v11.12" is one Phase, not five)
- A self-contained body of work concludes (e.g., "Integrated Code Review")

DO NOT add a new Phase when:
- A bug fix is part of an ongoing Phase (extend the existing Phase entry's text instead)
- A refactor with no observable behavior change
- A docs-only update
- A verification of previous Phase work (extend that Phase's text or add to its Status)

## Format

```markdown
### Phase N: <Title> (vX.Y[ → vA.B])
1-3 paragraphs describing the work. Focus on:
- WHY (what problem prompted this)
- WHAT (what was built/changed at the architectural level)
- HOW (key decisions, design choices, trade-offs)

If this Phase contains multiple sub-phases or shipped across multiple versions, include a bulleted sub-list:
- **vX.Y (label):** what changed
- **vX.Y+1 (label):** what changed

Patterns added to CLAUDE.md trip-up list (items #N, #M, ...).

- **Status:** complete | in progress | future | complete + verified working
```

## Section guidance

**Phase number:** The next sequential integer after the highest existing Phase. Don't fill gaps; don't skip numbers. If you discover a duplicate (e.g., two Phase 17s), renumber the LATER one — don't shift everything.

**Title:** Short noun phrase. "Saving Tab — One-Time Goals" not "We added a Saving tab". Use hyphens for sub-titles.

**Version range:** Single version `(v11.7)` for one-shot work. Range `(v11.8 → v11.12)` for multi-version arcs (the bring-up bugs of a new feature, for instance).

**Body:** 1-3 paragraphs. NOT a stream of bullets — paragraphs forced you to synthesize.

**Sub-list of versions:** Use ONLY when a single Phase shipped across multiple versions and you want to enumerate them. Format:
```markdown
- **vX.Y (short label):** description
- **vX.Y+1 (short label):** description
```

**Trip-up reference:** If this Phase's work added entries to CLAUDE.md trip-ups, list them at the bottom: "Patterns added to CLAUDE.md trip-up list (items #N, #M)."

**Status:** REQUIRED. One of:
- `complete` — done, no follow-up
- `complete + verified working` — done AND user has confirmed real-world usage
- `in progress` — actively being built
- `future` — planned but not started
- `ongoing — N of M items resolved` — for tracking multi-item Phases like Phase 19 deferred-audit

## Order in file

Phases are listed in NUMERIC order under "## Phases — Completed". 

Top of section = Phase 1 (oldest). Bottom of section = highest Phase number (newest).

If you find phases out of order, FIX IT before adding new entries. Out-of-order phases is the most common drift mode in this file.

Future phases (`Status: future`) live under "## Phases — Future" below Completed.

## Examples

### Good — feature that arced over multiple versions

```markdown
### Phase 17: Saving Tab — One-Time Goals (v11.8 → v11.12)
User wanted to track one-time savings goals like "Europe trip $5,000 by Oct 2026" and see what to budget per period to hit them. Implemented as a new tab on the existing Budget infrastructure — no new data model needed.

Initial design decisions (per user input):
- 1:1 goal:category mapping
- Manual archive (just stop budgeting; row stays for record-keeping)
- "Currently Saved" pulls from Budget Available for the period containing today

**Four bring-up bugs found and fixed as the user first used the feature:**
- **v11.9 (#REF! cascade):** updateWorkbook built the Saving tab BEFORE setNamedRanges_ ran. Fix: move Saving block to AFTER setNamedRanges_.
- **v11.10 (B3 XLOOKUP unreliable):** Dashboard cell used XLOOKUP with multiplied booleans which Google Sheets doesn't reliably broadcast. Fix: replaced with INDEX+MATCH.
- **v11.11 (schema refactor):** Per-Period Need drifted $222 → $209 after user budgeted suggested amount. User-directed redesign added "Allocated This Period" column and made "Needed Future Periods" adaptive.
- **v11.12 (Budget #REF! across entire tab):** Per-row refresh in updateWorkbook silently failing. Fix: delegate to rebuildBudgetInternal_.

Patterns added to CLAUDE.md trip-up list (items #10, #11, #12).
- **Status:** complete + verified working
```

### Good — single-shot fix

```markdown
### Phase 16: Slicer Crash Fix (v11.7)
PWA addCategory was crashing with TypeError: setColumnPosition is not a function. Google appears to have changed the Slicer API. Fix in rebuildBudgetInternal_: prefer setRange on existing slicer, recreate-with-typeof-guard when none exists, top-level try/catch so slicer issues never crash the parent operation.

User impact: addCategory works again. Existing slicer needs one-time manual fix (right-click → Set Column → Period); future addCategory calls only resize so the manual fix sticks.

- **Status:** complete
```

### Bad — mixing version pointers + work description

```markdown
### Phase X: Latest stuff (v11.8, v11.9, v11.10, v11.11, v11.12)
We did a bunch of work. The Saving tab. Some bugs. Then more bugs. The user is on v11.12 now.
- **Status:** done
```

## Anti-patterns

- ❌ Don't add a phase for every commit
- ❌ Don't insert mid-file (always append after the highest number)
- ❌ Don't use vague status like "done", "wrapped up" — use one of the canonical labels
- ❌ Don't leave Status off — every phase must have a Status line
- ❌ Don't use Phase entries as a session log — that's progress.md's job
