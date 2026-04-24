---
name: update-budget-docs
description: Use this skill when shipping a code change in the budget repo (Apps Script deploy or PWA push) to update the four documentation files (CLAUDE.md, docs/task_plan.md, docs/findings.md, docs/progress.md) consistently. Also use when the user asks to "update docs", "sync docs", or after running an Update Script that revealed new behavior. Walks through classification, version-pointer sync, choosing which entries to write, and consistency lint. NOT for trivial docs-only typo fixes.
---

# update-budget-docs

You are about to update the four documentation files in this repo:

- `CLAUDE.md` — orientation for new Claude sessions (versions, trip-ups, layouts)
- `docs/task_plan.md` — phases (chronological work units) + current state
- `docs/findings.md` — technical reference + bug postmortems
- `docs/progress.md` — chronological session log

The files have evolved organically across many sessions and have inconsistencies (different postmortem structures, out-of-order phases, stale "user needs to" lines). This skill encodes the established patterns and prevents the common drift modes.

## When to invoke

✅ **Invoke after:**
- Apps Script deploy lands (`./deploy.sh` succeeded + you committed)
- PWA push lands
- Update Script run revealed new behavior (good or bad)
- A bug investigation produced a finding (even if no code change)
- User asks "update docs" / "sync docs" / "make sure docs are current"

❌ **Don't invoke for:**
- Trivial typo fixes
- In-progress work (wait until landed)
- Reading-only sessions where nothing was learned
- Changes already documented this session

## Step 1 — Classify the change

Before touching any file, answer these questions internally:

**A. Type:**
- `feature` — new capability (new tab, new column, new endpoint)
- `bug-fix` — repair existing behavior
- `refactor` — internal restructure, no observable change
- `discovery` — found a problem but didn't fix yet
- `verification` — confirmed something works, no code change
- `docs-only` — pure documentation update

**B. Scope:** Apps Script / PWA / both / neither (docs/ops only)

**C. Severity (for bug-fixes only):**
- `CRITICAL` — data loss, security, or breaks the system end-to-end
- `important` — incorrect output, but isolated
- `polish` — UX or readability
- `cosmetic` — typo, formatting

**D. Recurring class?** Has this kind of bug bitten before? (If yes, ALWAYS add a CLAUDE.md trip-up.)

**E. User-action required?** Did you ship code that requires the user to do something (run Update Script, rotate API key, edit a cell)? If yes, the session entry MUST track whether they did it.

## Step 2 — Sync version pointers

Six places hold the current version. After any version bump they must all match. Run `bash .claude/skills/update-budget-docs/lint.sh` to verify (or check manually):

| Location | Pattern |
|---|---|
| `apps-script/Code.js` | `var APP_SCRIPT_VERSION = 'vX.Y';` |
| `apps-script/VERSION.txt` | line 1 |
| `CLAUDE.md` | "Current versions" section, Apps Script line |
| `docs/task_plan.md` | "Current State" section, Apps Script line |
| `docs/findings.md` | header pointer ("Sections describe the system as it currently exists (vX.Y...)" |
| `docs/progress.md` | "Current State" header callout |

PWA has its own version (`config.js APP_VERSION` + `sw.js CACHE_VERSION`) tracked in the same places.

If pointers disagree, ask which is canonical. Apps Script `Code.js` constant is usually right (it's what `deploy.sh` reads).

## Step 3 — Decide what entries to write

Use this table:

| Change type | CLAUDE.md | task_plan.md | findings.md | progress.md |
|---|---|---|---|---|
| Tiny bug fix (≤30 LOC, isolated) | trip-up if recurring | bump only | brief postmortem (3-5 bullets) | brief session (1-2 paragraphs) |
| Medium bug fix | trip-up if recurring | bump only | full postmortem | full session |
| Critical bug | trip-up REQUIRED | bump only | full postmortem with **CRITICAL** marker | full session |
| Bug discovery → fix-deferred | trip-up if recurring | mention in Phase 19 deferred audit | postmortem with **Status: PENDING** in title | session noting deferral |
| New feature | new tab/feature block + 1+ trip-ups for new gotchas | new Phase N entry | new architecture section + initial postmortems if any bring-up issues | full session per bring-up bug |
| Refactor | only if architecture changed | mention in existing Phase | only if non-obvious | session mentioning |
| Docs-only / verification | usually nothing | nothing | nothing | brief session |

## Step 4 — Use templates

Don't write entries from scratch. Use these (in this directory):

- `postmortem-template.md` — for findings.md
- `session-entry-template.md` — for progress.md
- `trip-up-template.md` — for CLAUDE.md
- `phase-entry-template.md` — for task_plan.md

Each template has placeholders. Fill them in; remove sections you don't need; ADD sections only when there's a real reason.

**Cross-link discipline:**
- findings.md postmortems should link back to task_plan.md Phase by name
- CLAUDE.md trip-ups should link to findings.md section by title
- progress.md session Status should reference commit hash + deployment number

## Step 5 — Order matters in task_plan.md

Insert NEW Phase entries at the END of "Phases — Completed", in chronological order (highest phase number last). Do NOT insert at the top.

Common mistake: each session inserts the new phase right after Phase 14, producing reverse-chronological order. The list should read top-to-bottom = oldest-to-newest.

If you're adding Phase N+1 and the most recent entry in the file is Phase N, append below it. If the most recent is some earlier number (suggesting drift), check for duplicate or out-of-order entries before adding.

Future phases (Phase X: ... — Status: future) live in their own "## Phases — Future" section below "Completed".

## Step 6 — Update stale state

Before committing, find and update stale state from previous entries:

- `Status: PENDING` postmortems where the fix has now landed → update to `Status: FIXED in vX.Y`
- "User needs to run X" lines in older session entries where you've now verified X happened → mark resolved or DELETE if older than the most recent session
- "5-Question Reboot Check" in progress.md is a periodic synthesis snapshot — don't update it on every session, only when intentionally doing a session-end review

## Step 7 — Lint

Run:
```bash
bash .claude/skills/update-budget-docs/lint.sh
```

Output is grouped by severity:
- 🔴 BLOCKING — version pointer drift, duplicate Phase numbers (must fix)
- 🟡 WARNING — postmortem missing Lesson, session missing Status (should fix)
- 🔵 INFO — code reference may be stale (review)

Address blocking issues before committing. Warnings should be fixed unless there's a reason. Info entries are awareness only.

## Step 8 — Commit

Use a docs-only commit (don't bundle with code changes — the doc commit should land AFTER the code commit it documents). Commit message format:

```
Docs: [vX.Y / Phase N / topic] — short description

- CLAUDE.md: <what changed>
- task_plan.md: <what changed>
- findings.md: <what changed>
- progress.md: <what changed>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Anti-patterns to avoid

| Don't | Because |
|---|---|
| Auto-write Lessons section | Lessons are the highest-value part. They require judgment. Prompt for one; don't synthesize. |
| Make every session entry 500+ words | Some sessions are 3 sentences. Length should match content. |
| Add a postmortem for every bug fix | Trivial fixes (typo, off-by-one) don't need findings.md. They need a session entry only. |
| Update CLAUDE.md trip-up list for every bug | Trip-ups are for RECURRING classes of bugs. Adding too many dilutes the signal. |
| Insert phases out of order | Sort by phase number; chronological order top-down. |
| Leave "user needs to run X" hanging | If they did it, mark resolved. If they haven't, that's the next session's problem. |
| Write postmortems for fixes that fixed themselves (data error, user mistake) | Document as a "non-bug" with the diagnosis trail, but don't claim it as a code fix. |
| Ship docs without running lint | Drift accumulates. Lint takes 2 seconds. |

## Example sessions where this skill applies

**Example 1 — bug fix landed:**
1. Code committed (e.g. `v11.12 — fix Budget #REF!`).
2. Invoke skill.
3. Classify: bug-fix / Apps Script / CRITICAL / recurring class (third #REF! variant).
4. Sync version pointers: `Code.js` is `v11.12`, others currently `v11.11`. Update all 4 .md files.
5. Write entries: trip-up #12 in CLAUDE.md, brief task_plan.md mention, full postmortem in findings.md, full session in progress.md.
6. Update task_plan.md Phase 17 (the parent phase for this work) to mention v11.12.
7. Lint passes.
8. Commit `Docs: v11.12 Budget #REF! cascade postmortem`.

**Example 2 — feature shipped:**
1. Code committed (e.g. `v11.8 — new Saving tab`).
2. Invoke skill.
3. Classify: feature / Apps Script / N/A severity / new gotchas expected.
4. Sync versions to v11.8.
5. New Phase N entry in task_plan.md.
6. New architecture section in findings.md.
7. New session entry in progress.md.
8. CLAUDE.md: new "Saving tab layout" block + version bump. No trip-up yet (will add after first user-found bug).
9. Lint passes.
10. Commit.

**Example 3 — verification only:**
1. User ran Update Script + reported "looks good". Confirmed via dumpSheet.
2. Invoke skill.
3. Classify: verification / N/A / N/A / N/A.
4. No version change, no postmortem, no new phase.
5. Update most recent session entry's Status from "user needs to run X" → "VERIFIED WORKING + dumpSheet snapshot".
6. Brief commit `Docs: close the loop on vX.Y verification`.

## When to deviate from the templates

The templates encode the median case. Deviate when:

- A bug needs a comparison table (e.g., before/after state across many cells)
- A session spans multiple distinct topics (then write multiple session entries with shared date suffix)
- A fix's lesson applies to MORE than this codebase (then write the lesson generally, link from this codebase to it)
- A postmortem benefits from an architectural diagram (use ASCII)

Deviation is fine if it serves clarity. Deviation just to avoid the template is not.
