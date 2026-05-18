---
name: lint
description: Run the docs consistency lint (version pointers across CLAUDE.md + task_plan.md + progress.md + findings.md + VERSION.txt + Code.js, phase numbering, postmortem structure, trip-up numbering). Use when the user types "/lint", asks to "check docs", or before a commit that touches doc files.
---

# lint

Run the docs lint script and report its output cleanly.

## What to do

1. Run: `bash .claude/skills/update-budget-docs/lint.sh`
2. Read the script's output (it prints sectioned check results + a summary).
3. Report to the user based on the summary line:

   - **`✅ Lint clean.`** — say "Lint clean" + the trip-up count (e.g. "28 trip-ups, 0 blocking, 0 warnings").
   - **`⚠️  Lint passed with N warning(s).`** — list each `🟡 WARNING:` line. Say which file + section needs fixing. Don't fix automatically; let the user decide.
   - **`❌ Lint FAILED with N blocking issue(s).`** — list each `🔴 BLOCKING:` line. Note that `git commit` will be blocked by the pre-commit hook. Suggest the fix for each (usually a version pointer to bump or a missing Symptom/Fix marker in a postmortem).

   Always include `🔵 INFO:` lines too (lower priority but worth knowing).

## When NOT to fix automatically

The lint reveals issues but **shouldn't be silently auto-fixed**. The user should see what's flagged and decide. Most blocking issues are version-pointer drift across the four doc files — these are deliberate (you're shipping a version bump and just missed a file) so the user wants to see what they missed before you patch it.
