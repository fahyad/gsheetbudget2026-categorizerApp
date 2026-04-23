# CLAUDE.md — Orientation for new sessions

You're in the **2026 Personal Budget + Transaction Categorizer** repo. This file orients you in 60 seconds. Then read `docs/task_plan.md` for current state and `docs/findings.md` for technical reference.

## What this is

Two interconnected systems for one user (the repo owner):
1. **Google Sheets budget workbook** — driven by Apps Script (`apps-script/Code.js`)
2. **Mobile PWA categorizer** — vanilla HTML/JS at root (`index.html`, `js/`, `css/`, `sw.js`)

The PWA calls the Apps Script via a deployed web app URL.

## ⚠️ READ THIS BEFORE TOUCHING APPS SCRIPT

**Apps Script lives at `apps-script/Code.js`** (managed via [clasp](https://github.com/google/clasp)). Edit there, not in the Apps Script editor.

**To deploy a change, ALWAYS use:**
```bash
cd apps-script
./deploy.sh "vNN — short description"
```

**NEVER use plain `clasp deploy`** — it creates a new deployment with a new URL. The PWA is hardcoded to one URL. Plain `clasp deploy` silently breaks production.

The production deployment ID is `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ`. It's hardcoded in two places (must stay in sync):
- `apps-script/deploy.sh` → `PROD_DEPLOYMENT_ID`
- `js/config.js` → `DEFAULT_API_URL` (the URL embeds this ID)

## Current versions
- **Apps Script:** v11.12 (updateWorkbook now delegates Budget refresh to `rebuildBudgetInternal_` because the in-place per-row refresh loop was silently failing — dashboard formulas worked but per-row formulas (rows 8+) stayed `#REF!` indefinitely). Earlier shakedown: v11.9 updateWorkbook ordering so Saving formulas don't break to `#REF!`; v11.10 replaced XLOOKUP-with-array-multiplication with INDEX+MATCH; v11.11 Saving schema refactor (dropped On Track?, added Allocated This Period, adaptive Needed Future Periods).
- **PWA:** v0.12.1 (cache v16) — **scaffolding restructure** (Deploy 1 of 3). App shell reduced to ~35 LOC; hash router + lazy-loaded view modules + bottom tab-bar. No user-visible feature change from v0.11 (same manual-categorize flow). Dashboard tab is a placeholder stub. Auto-suggest swipe deck ships in Deploy 3. Currently on the experimental branch `claude/read-markdown-context-v1c5T` — NOT yet merged to `main`. See "PWA architecture" section below.

## Common commands

```bash
# Deploy Apps Script change (correct)
cd apps-script && ./deploy.sh "v10 — what changed"

# View live Cloud Logging from Apps Script
cd apps-script && clasp logs --watch

# See what files clasp will push
cd apps-script && clasp status

# List deployments (should be 7 — HEAD + 6 versions)
cd apps-script && clasp deployments

# Pull edits made via the Apps Script editor (rare)
cd apps-script && clasp pull

# Open Apps Script editor in browser
cd apps-script && clasp open
```

## Reading the Google Sheet (no OAuth needed)

You have a `dumpSheet` endpoint that lets you read any tab via the existing API key. Use this when you need to inspect sheet state — Drive MCP doesn't work for this account, gcloud OAuth is blocked for personal Gmail.

```bash
URL="https://script.google.com/macros/s/AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ/exec"
# API key is NOT committed to this repo. Get it from one of these sources, in order:
#   1. Ask the user
#   2. Open the PWA in a browser, DevTools → Application → Local Storage → key `budget_api_key`
#   3. Apps Script editor → Project Settings → Script Properties → API_KEY
KEY="<paste-api-key-here>"

# List all tabs + dimensions
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&metadata=true" | python3 -m json.tool

# Read a specific tab/range (display values — formatted strings)
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Setup&range=A1:E27" | python3 -m json.tool

# Read with formulas instead of values (debugging formulas)
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Budget&range=D2:D10&includeFormulas=true" | python3 -m json.tool
```

Caps at 10000 cells per request. Read-only (no writes). API-key gated.

Tabs in this sheet (v11.8+): `Instructions`, `Logs`, `Setup`, `Fixed Monthly Expenses`, `Budget`, `Transactions`, `Saving`.

**Pending tab REMOVED in v11.0** — single-ledger architecture. The Transactions tab now holds:
- All categorized transactions (manual + email-parsed + PWA-categorized)
- All UNCATEGORIZED transactions (Category column empty = "needs categorization")

PWA reads Transactions where Category="" AND Timestamp is set. Categorize action updates the Category cell of an existing row. No copy/move between tabs.

**Transactions tab layout (v11.0+):** 8 columns:
- A: Date | B: Merchant | C: Amount (signed) | D: Category (empty = uncategorized)
- E: Main Category (formula from D + Setup) | F: Transaction # (manual) | G: Period (formula from A + PayPeriods)
- H: Timestamp (NEW in v11.0 — precise datetime from email; blank for manual entries)

**Categorization rule:** PWA only sees rows where `Category=""` AND `Timestamp` is set. Manual rows (Timestamp blank) are invisible to PWA — by design, they're already categorized.

**Saving tab layout (v11.11+):** 9 columns A-I, dashboard at rows 1-3, header at row 5, goals at rows 6-105 (up to 100 goals).
- A: Goal Name | B: Linked Category (dropdown) | C: Target | D: Target Period (dropdown)
- E-H: computed (Currently Saved, Allocated This Period, Periods Remaining, Needed Future Periods — all currency/integer, no CF)
- I: Notes
- Dashboard B3 has the "current period" INDEX+MATCH (match_type=1) that all per-row formulas reference. Don't move it; don't replace with XLOOKUP-over-multiplied-booleans (see trip-up #11).
- Column H's "Needed Future Periods" is adaptive: when F (Allocated This Period) > 0, divides by (G - 1) so the value stays constant when user budgets the previously-shown amount. When F = 0, divides by G. Previous static formula caused confusing user-facing drift from $222 → $209 after allocation.
- Tab gets created automatically by Update Script if missing — no migration step needed.

**Budget tab layout (v10.5+):**
- **Rows 1-6:** Dashboard (display only). B1 = period dropdown. Row 4 shows Net Income / Fixed Expenses / Total Budgeted / Ready to Assign for the selected period. F1 shows period progress ("Day X of Y").
- **Row 7:** Header row (Period | Main | Category | Budgeted | Spent | Available)
- **Rows 8+:** Category data (no more `_income` rows). 8 categories × 26 periods = 208 data rows.
- **Frozen rows:** 7 (dashboard + header always visible when scrolling)
- **Slicer:** to the right of column F (anchored row 1 col 8). Filters by Period (col 1 of data range). Independent of dashboard dropdown.
- **Named ranges** (Budget_Period, Budget_Category, Budget_Budgeted, Budget_Available) all start at row 8.

## Version display (added v10.2)

**Source of truth for "latest version":** `apps-script/VERSION.txt` in this repo. Auto-bumped by `deploy.sh` on every deploy. Publicly accessible via `https://raw.githubusercontent.com/fahyad/gsheetbudget2026-categorizerApp/main/apps-script/VERSION.txt`.

**Where it shows up:**
- **Sheet → Instructions tab rows 1-6**: Version, last edited, "Update needed: Yes/No" (green if no, red if yes), last checked timestamp. Auto-refreshed on `onOpen()`. Manually via menu "Budget Tools → Refresh Version Info".
- **PWA → Setup screen**: PWA version + Apps Script version + update status. Refreshes when user opens Settings.
- **API endpoint**: `?action=version&apiKey=...` returns full JSON.

**Auto-bump on deploy:** `./deploy.sh "..."` updates `APP_SCRIPT_LAST_EDITED` in Code.js to current timestamp + writes `VERSION.txt` automatically. The VERSION number itself (`v10.2`) is manually bumped in Code.js by editing `APP_SCRIPT_VERSION = 'v10.2'` when shipping a meaningful change.

**If you change the OAuth scopes** (e.g. add a new Google API like UrlFetchApp), you must re-authorize: open Apps Script editor → run `requestPermissions()` from the function dropdown → grant the new permission. The web app deployed as USER_DEPLOYING runs with the owner's auth, which doesn't auto-update on scope changes.

## PWA changes
PWA is plain static files at the repo root. GitHub Pages auto-deploys from `main`. To deploy:
```bash
git add . && git commit -m "..." && git push
```
Bump `APP_VERSION` in `js/config.js` AND `CACHE_VERSION` in `sw.js` when shipping a real change (otherwise installed PWAs keep serving cached old code via the service worker).

The header version label in `index.html` is populated at runtime from `APP_VERSION` — no need to touch HTML.

## PWA architecture (v0.12+)

Restructured in v0.12 from a 657-line single-file app into a thin shell + lazy-loaded view modules. The shell is ~35 LOC and loads instantly; each view is fetched on first navigation.

**Module layout:**
```
js/
  app.js           ~40   shell: version label, settings-btn handler, initial-route gate, beforeunload
  router.js        ~60   hashchange -> lazy import(view) -> mount(root) / unmount()
  ui.js            ~40   shared showError/showSuccess + setHeaderActions({refresh, sync, settings})
  config.js, api.js, store.js, periods.js   unchanged from v0.11
  views/
    categorize.js  ~400  the manual-categorize flow (period filter, picker, add-cat modal, sync, undo)
    setup.js       ~130  config form + version info panel
    dashboard.js   ~20   placeholder stub; real content lands in Deploy 2 (v0.13)
```

**Routes:** `#/categorize` (default), `#/dashboard`, `#/setup`. Navigation via `<a href="#/...">` in the bottom tab-bar — zero JS click handlers for nav, browser back/forward works.

**View contract:** every view module default-exports `{ mount(root), unmount() }`. `mount` renders its DOM into `#view-root` and attaches listeners. `unmount` removes shell-level listeners (header buttons) — in-view DOM is wiped by the router's `root.innerHTML = ''` before the next mount.

**Header buttons:** `sync-btn` and `refresh-btn` are hidden by default in HTML. Views declare what they need via `setHeaderActions({refresh, sync, settings})` on mount. `settings-btn` is always visible (except where a view hides it); the shell handler routes based on current hash — `#/setup` from elsewhere, or back to `#/categorize` when already on setup. Setup view relabels the button to "Done" on mount so the affordance reads correctly.

**Tab-bar:** bottom-fixed, hidden on `#/setup`. Stacks at `var(--tab-bar-total)` = 56px + `env(safe-area-inset-bottom)`. Undo-bar and category-picker position themselves above it via the same CSS var.

**Service worker (v15+):** precaches the shell (app.js, router.js, ui.js, config.js, api.js, store.js, periods.js, index.html, style.css, manifest.json). Lazy view modules under `/js/views/` and `/js/lib/` are served via stale-while-revalidate — dynamic imports work offline after first successful fetch. Bump `CACHE_VERSION` on every PWA release so the new SW activates and purges old caches.

**State:** `store.js` is still a singleton loaded once in the shell (`store.loadCache()` before `router.start()`). No pub/sub — views call renders explicitly, same as v0.11. Deferred to a future deploy if view-to-view coupling becomes painful.

### Deploy sequence (3 deploys total)
- ✅ **Deploy 1 (v0.12 / v0.12.1) — shipped** on branch `claude/read-markdown-context-v1c5T`. Scaffolding only; behaviour identical to v0.11. v0.12.1 fixed a UX regression where Setup had no exit button.
- ⏳ **Deploy 2 (v0.13)** — implement `views/dashboard.js` against `api.dumpSheet('Budget', ...)`. Row layout TBD when we get there.
- ⏳ **Deploy 3 (v0.14)** — auto-suggest swipe deck. Add `lib/swipe.js` + `lib/suggest.js` + swipe view or sub-route under categorize. Suggestion source TBD.

Detailed plan: `/root/.claude/plans/let-s-discuss-layout-of-nifty-moore.md`.

### Current branch state
- **Branch with v0.12.1 restructure:** `claude/read-markdown-context-v1c5T` (pushed to origin)
- **Branched from:** `pwa/experiments`
- **`main` still carries v0.11.** GitHub Pages auto-deploys from `main` — until this is merged, users on the production URL see v0.11.
- **Preview options:** point Pages source at the branch (Settings → Pages → Source), or test locally via `python3 -m http.server`.
- **PR:** not opened (user manages PRs manually).

## File map

| Path | Purpose |
|------|---------|
| `index.html` | PWA entry. Shell DOM: header + `<main id="view-root">` + `<nav id="tab-bar">` + `#error-toast`. Views render into `#view-root`. |
| `sw.js`, `manifest.json` | Service worker + PWA manifest |
| `css/style.css` | Single stylesheet with section-header TOC. `--tab-bar-total` CSS var drives bottom-fixed stacking. |
| `js/app.js` | Shell (~40 LOC). Version label, settings-btn routing, beforeunload, store.loadCache(), hands off to router. |
| `js/router.js` | Minimal hashchange router with lazy view imports + mount/unmount lifecycle. |
| `js/ui.js` | Shared UI helpers: `showError`, `showSuccess`, `setHeaderActions`. |
| `js/config.js` | `APP_VERSION`, hardcoded `DEFAULT_API_URL`, localStorage config getters/setters. |
| `js/api.js` | Thin fetch wrapper around the Apps Script endpoints. |
| `js/store.js` | In-memory + localStorage-backed state: transactions, categories, syncQueue. |
| `js/periods.js` | Client-side pay-period math from a single anchor date — no backend roundtrip. |
| `js/views/categorize.js` | Manual-categorize flow (period filter, picker, add-cat modal, sync, undo). |
| `js/views/setup.js` | Config form + version info panel. |
| `js/views/dashboard.js` | Placeholder stub. Real content ships in v0.13. |
| `apps-script/Code.js` | Apps Script source (~2400 lines) |
| `apps-script/deploy.sh` | One-command production deploy |
| `apps-script/.clasp.json` | Apps Script project link (scriptId + rootDir) |
| `apps-script/.claspignore` | Allowlist (only Code.js + appsscript.json get pushed) |
| `docs/task_plan.md` | Current state + phases — **read this first** |
| `docs/findings.md` | Technical reference (architecture, bugs, decisions) |
| `docs/progress.md` | Session log (chronological) |

## Known data issues (as of 2026-04-19)

These are real-data quirks visible via `dumpSheet`. Don't be confused by them.

1. **Transactions tab has orphan data in rows 1001–1008.** Eight transactions categorized via the buggy `findNextEmptyRow_` (pre-v9) ended up below the visible/formulaic range. They DON'T contribute to Budget Spent totals (named range `Transactions_Amount` only reaches row 1000). Total: $439.10. Cleanup deferred — see `docs/findings.md` "Orphan Transactions" section.

2. **Fixed Monthly Expenses → Due Day column is formatted as Date, not Number.** Cells display "Dec 31, 1899" instead of "1". Underlying value is a Date object, but it coerces to numeric `1` when used in formulas — so the SUMPRODUCT in Budget _income works correctly. Display is just confusing. Cleanup: change column format to Number and re-enter values 1–31.

3. ~~**Budget Available circular reference (Small trip + Eating out values diverging)**~~ — **FIXED in v10.4.** Wrap of `IF(MATCH(A,PayPeriods_Label,0)>1, ..., 0)` around the prior-period rollover eliminates the bad `INDEX(_, 0)` call.

4. ~~**"Nice Things " trailing space in Setup E10**~~ — **FIXED in v10.4.** New `cleanupSetupWhitespace_` runs on Update Script, trims all D2:E100. PWA's `saveNewCategory` also now trims dropdown values (defense in depth).

## Things that will trip you up (lessons from past sessions)

> ⚠️ **Before you assume "Budget miscalculation"**: the Available column is CUMULATIVE rollover, not "this period only". If a category overspends in any period, the negative balance carries forward forever via the prior-period SUMIFS. A row showing -$280 with $100 budgeted and $40 spent is the formula working correctly against an earlier overspend, not a bug. Trace the chain back through that category before assuming miscalculation. The user has been bitten by this twice (v10.4 circular-ref divergence + late v11.x Gas confusion). Redesign to a non-rollover or two-column model has been discussed but deferred — see `docs/findings.md` "Gas Rollover Investigation (non-bug)".

1. **`getLastRow()` lies on formula-filled sheets.** Transactions tab has formulas in rows 2–1000 that return `""`. `getLastRow()` reports 1000, not the real last data row. Always use `findNextEmptyRow_()` (scans column A) — already fixed in v9.

2. **POST body is lost on Apps Script 302 redirects.** Use GET with URL params for everything. `doGet()` routes all 6 actions; `doPost()` is kept for curl testing only.

3. **Plain `clasp deploy` creates a new URL.** Always use `./deploy.sh` or `clasp deploy -i AKfycbw2EbHNk_...`.

4. **The Apps Script editor and clasp can both edit Code.gs.** If the user makes an edit in the editor, run `clasp pull` BEFORE editing locally to avoid clobbering.

5. **Categories tab is named "Setup", not "Categories".** Categories live in Setup `D2:E100` (Main, Sub).

6. **PWA gating on Transactions tab is `Category="" AND Timestamp set`.** Empty Category = "uncategorized." Manual rows (blank Timestamp) are invisible to the PWA by design.

7. **API key is in Apps Script Script Properties** (set via Budget Tools → Set API Key menu). Never hardcoded.

8. **The user already manually pasted v9 to Apps Script** before clasp migration. The remote and local are in sync as of clasp clone.

9. **`Slicer.setColumnPosition()` throws TypeError in web-app context** (Google API change discovered Apr 2026). Slicer manipulation in `rebuildBudgetInternal_` is now wrapped in try/catch with a typeof guard, and prefers `setRange()` on the existing slicer instead of destroying-and-recreating. Don't reintroduce the destroy-then-recreate pattern. See `docs/findings.md` "Slicer.setColumnPosition API Change Bug (v11.7)".

10. **`setNamedRanges_` deletes-and-recreates ranges — any formula referencing them at deletion time is permanently broken to `#REF!`**. Recreating the same name with the same definition does NOT heal existing formulas. Therefore any code that writes formulas referencing named ranges (Saving tab builder is the current example) MUST run AFTER `setNamedRanges_` in `updateWorkbook`. See `docs/findings.md` "Saving Tab #REF! After Update Script (v11.9)".

11. **XLOOKUP with multiplied-boolean lookup arrays is unreliable in Sheets.** A formula like `XLOOKUP(1, (startCol<=today)*(endCol>=today), labelCol)` may return no-match even when a match clearly exists. Prefer `INDEX(labelCol, MATCH(today, startCol, 1))` when the start column is ascending-sorted — it's more portable and doesn't rely on array-broadcast behavior. See `docs/findings.md` "Saving B3 XLOOKUP Out-of-Range (v11.10)".

12. **updateWorkbook's in-place per-row setFormula refresh silently fails (v11.12).** The same setFormula text that works from `rebuildBudgetInternal_` stored `#REF!` when called from the in-place loop inside `updateWorkbook` — even when the named ranges existed (dashboard formulas in the same tab resolved correctly). Root cause unknown; suspected Apps Script state-commit quirk. Fix: `updateWorkbook` now calls `rebuildBudgetInternal_('refresh', ss)` instead of the per-row loop. Don't reintroduce per-row refresh in `updateWorkbook`. See `docs/findings.md` "Budget #REF! After updateWorkbook (v11.12)".

13. **PWA views must declare `setHeaderActions` on mount (v0.12+).** The shell hides `refresh-btn` and `sync-btn` by default. Each view calls `setHeaderActions({refresh, sync, settings})` in `mount()` to declare what it needs. Forgetting this leaves the view with no Refresh/Sync affordance. Setup view intentionally uses `settings: true` + relabels the button to "Done" so it acts as the exit — without this, users get stranded on setup with no way back (the tab-bar is also hidden on `#/setup`). See `v0.12.1` commit for the regression fix.

14. **In-view event listeners die with the DOM; shell-level listeners must be removed explicitly.** The router does `root.innerHTML = ''` before mounting the next view, so any listener on an element inside `#view-root` is garbage-collected. But listeners attached to `#refresh-btn`, `#sync-btn`, `#settings-btn`, or `window` persist — views must `removeEventListener` those in `unmount()`. See `categorize.js` for the pattern (tracks handler refs at module scope, removes in `unmount`).

## When in doubt
- Check `docs/task_plan.md` for current state
- Check `docs/findings.md` "⚠️ CRITICAL: Always update the existing deployment" section
- Check the Logs tab in the Google Sheet for recent API activity
- Run `clasp deployments` to confirm you haven't accidentally created extras
