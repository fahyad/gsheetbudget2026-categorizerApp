---
name: deploy
description: Deploy Apps Script to production. Wraps the canonical workflow — pre-flight verification, ./apps-script/deploy.sh, post-deploy timestamp commit, push. Use when the user types "/deploy <description>" or asks to "deploy", "ship to production", "push to apps script". REQUIRES a version description argument like "v11.19 — short summary of changes".
---

# deploy

Orchestrate the full Apps Script deploy workflow. Each step is gated — fail fast if anything's wrong rather than barreling forward.

## Argument

The user invokes this with a description string (`/deploy "v11.19 — fix archive idempotency"`). The description appears in:
- The Apps Script deployment description (visible in clasp + the editor)
- The post-deploy timestamp commit message

If no description was provided, **ask for one before proceeding**. Never auto-generate it — the description is editorial.

## Pre-flight (read-only — safe to run silently)

Before invoking deploy.sh:

1. Read `apps-script/Code.js` for `APP_SCRIPT_VERSION` and confirm the user's description's version prefix matches (e.g., `v11.19 — ...` requires Code.js to say `v11.19`). If they don't match, ask the user to either bump APP_SCRIPT_VERSION in Code.js first OR adjust the description.

2. Run `git status --short` — if `Code.js` has substantive uncommitted changes, deploy.sh's own guard will block. Surface this early so the user can commit first.

3. Show what's about to happen: current branch, last commit hash, version being deployed. Brief — three lines.

## The deploy itself

4. Run: `./apps-script/deploy.sh "<description>"` from the `apps-script/` directory (or with the full path).

   - The script enforces its own pre-flight guard (no uncommitted substantive Code.js changes) — if it blocks, surface the message and stop.
   - It runs `clasp push` then `clasp deploy -i <prod-id>`. Both can fail on auth, network, or quota issues.
   - If deploy fails, **stop the workflow** — do NOT proceed to commit. The user should see the failure and decide.

## Post-deploy commit + push

5. After deploy succeeds, deploy.sh has updated `apps-script/Code.js` LAST_EDITED line + rewritten `apps-script/VERSION.txt` with the new timestamp. Stage and commit those:

   ```
   git add apps-script/Code.js apps-script/VERSION.txt
   git commit -m "chore: post-deploy timestamp bump for <description>"
   ```

6. Push: `git push origin <current-branch>`. Confirm push succeeded.

## Report

7. Final summary to the user:
   - Deployed Apps Script revision number (from clasp output, e.g., `@44`)
   - Commit hashes (the original code commit + the post-deploy timestamp commit)
   - Branch pushed to
   - Suggest the user verify on the sheet (Budget Tools → Refresh Version Info)

## What NOT to do

- Don't bump APP_SCRIPT_VERSION yourself — that's a deliberate action by the user before they invoke /deploy.
- Don't update other docs (CLAUDE.md, progress.md etc.) — that's the `/update-budget-docs` skill's job, run separately after the deploy is verified.
- Don't `clasp push` or `clasp deploy` directly — always go through deploy.sh, which has the URL-drift safety + lint hooks + timestamp logic.
- Don't retry on failure. The user may want to investigate before retrying.
