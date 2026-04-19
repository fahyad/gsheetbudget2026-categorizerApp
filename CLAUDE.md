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
- **Apps Script:** v10.5 (Budget tab redesigned — top dashboard at rows 1-6, no more `_income` rows, data starts at row 8)
- **PWA:** v0.9 (defense-in-depth trim on saveNewCategory)

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
KEY="p0LiMHcdpP0xeYaN0gBCnk4z91Pjhf4czZ0OjVS1"

# List all tabs + dimensions
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&metadata=true" | python3 -m json.tool

# Read a specific tab/range (display values — formatted strings)
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Setup&range=A1:E27" | python3 -m json.tool

# Read with formulas instead of values (debugging formulas)
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Budget&range=D2:D10&includeFormulas=true" | python3 -m json.tool
```

Caps at 10000 cells per request. Read-only (no writes). API-key gated.

Tabs in this sheet: `Instructions`, `Logs`, `Setup`, `Fixed Monthly Expenses`, `Budget`, `Pending`, `Transactions`.

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
Bump `<span class="version">vX.Y</span>` in `index.html` AND `CACHE_VERSION` in `sw.js` when shipping a real change (otherwise users get cached old code).

## File map

| Path | Purpose |
|------|---------|
| `index.html`, `js/`, `css/`, `sw.js`, `manifest.json` | PWA (GitHub Pages) |
| `apps-script/Code.js` | Apps Script source (1600+ lines) |
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

1. **`getLastRow()` lies on formula-filled sheets.** Transactions tab has formulas in rows 2–1000 that return `""`. `getLastRow()` reports 1000, not the real last data row. Always use `findNextEmptyRow_()` (scans column A) — already fixed in v9.

2. **POST body is lost on Apps Script 302 redirects.** Use GET with URL params for everything. `doGet()` routes all 6 actions; `doPost()` is kept for curl testing only.

3. **Plain `clasp deploy` creates a new URL.** Always use `./deploy.sh` or `clasp deploy -i AKfycbw2EbHNk_...`.

4. **The Apps Script editor and clasp can both edit Code.gs.** If the user makes an edit in the editor, run `clasp pull` BEFORE editing locally to avoid clobbering.

5. **Categories tab is named "Setup", not "Categories".** Categories live in Setup `D2:E100` (Main, Sub).

6. **Pending tab uses `status='pending'` to gate inclusion.** Once status is "categorized", parseAndFetch ignores it.

7. **API key is in Apps Script Script Properties** (set via Budget Tools → Set API Key menu). Never hardcoded.

8. **The user already manually pasted v9 to Apps Script** before clasp migration. The remote and local are in sync as of clasp clone.

## When in doubt
- Check `docs/task_plan.md` for current state
- Check `docs/findings.md` "⚠️ CRITICAL: Always update the existing deployment" section
- Check the Logs tab in the Google Sheet for recent API activity
- Run `clasp deployments` to confirm you haven't accidentally created extras
