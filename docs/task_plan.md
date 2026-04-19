# Task Plan: 2026 Personal Budget + Transaction Categorizer

## Goal
1. Google Sheets personal budget workbook with named ranges, formulas, Apps Script automation, and a slicer.
2. Transaction categorizer system: Apps Script email parser + GitHub Pages PWA for categorizing Scotiabank infoalert transactions on phone.

## Current State (April 2026)
- **Apps Script:** v11.2 — Single-ledger architecture (v11.0+) plus updateWorkbook fix to skip dashboard/header rows during formula refresh. Pending tab eliminated; Transactions is the source of truth (8 cols, with Timestamp at H). Categorize updates Category cell of existing row, no copy/move.
- **PWA:** v0.9 — deployed at https://fahyad.github.io/gsheetbudget2026-categorizerApp/ — defense-in-depth client-side trim added.
- **Workflow:** `clasp` CLI. `./deploy.sh "description"` is the one-command production deploy. Auto-bumps timestamp + writes VERSION.txt.
- **Active deployment ID** (DO NOT change): `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ`
- **Sheet inspectable by Claude:** `?action=dumpSheet&apiKey=...&metadata=true|tab=X&range=...` (no OAuth needed — uses the same API key as other endpoints).
- **Version visible everywhere:** Instructions tab rows 1-6 (with color-coded "Update needed"), PWA Setup screen, `?action=version` endpoint. Source of truth: `apps-script/VERSION.txt` on GitHub.

## Phases — Completed

### Phase 1–6: Budget Workbook (v1–v6)
- Built 6-tab workbook (Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Pending)
- 26 bi-weekly pay periods (Dec 25, 2025 → Jan 5, 2027)
- 15 named ranges, formula-driven (no expanded date rows for fixed expenses)
- Email parser for Scotiabank infoalerts (4 batched Gmail API calls)
- Apps Script menu: Build Workbook, Initialize Budget, Update Script, Add Category, Parse Emails, Set API Key, View Activity Log
- **Status:** complete

### Phase 7: Web App API (v7)
- `doGet()` routes 6 actions: parseAndFetch, categories, batchCategorize, categorize, uncategorize, addCategory
- API key auth via Script Properties
- All requests via GET (POST body lost on Apps Script 302 redirect)
- **Status:** complete

### Phase 8: PWA Foundation (v0.1–v0.4)
- Vanilla HTML/CSS/JS with ES modules (no build step)
- Mobile-first, installable PWA, service worker for offline app shell
- localStorage-backed config and category cache
- Optimistic categorize/undo with API rollback
- Add Category modal
- **Status:** complete

### Phase 9: Batch Sync (v8 + PWA v0.6)
- Refactored to local-first categorize/undo (no API call per tap)
- New `batchCategorize` endpoint — one API call sends all queued items
- Sync queue persisted to localStorage (survives page close)
- `beforeunload` warning for unsent items
- 3 API calls per session instead of 2+N
- **Status:** complete

### Phase 10: Hardening + Observability (v9)
- Fixed critical `findNextEmptyRow_` bug (was writing to row 1001+ due to `getLastRow` counting formula-filled cells)
- Added `Logs` tab with auto-rotation at 5000 rows
- `logActivity_()` helper logs every API call (Timestamp | Action | Duration | Status | Details | Error)
- `console.log/warn/error` mirrored to Cloud Logging
- LockService on all 4 mutating handlers (prevents race conditions)
- Write verification after `setValues()` on Transactions
- Category validation against Setup E:E
- Batched Pending updates (single setValues for contiguous rows)
- `SpreadsheetApp.flush()` after Transactions writes
- New menu: "View Activity Log"
- **Status:** complete

### Phase 11: Setup UX + clasp Migration (v0.7 + clasp)
- Hardcoded API URL in `js/config.js` as `DEFAULT_API_URL` (URL is public anyway)
- Setup form simplified to API Key only (URL moved to optional `<details>` "Advanced" section)
- Migrated from manual paste to clasp CLI workflow
- `apps-script/deploy.sh` — one-command deploy hardcoded to production deployment ID
- Moved planning docs from Google Drive into `docs/`
- API key rotated to fresh value (set via Apps Script menu by user)
- **Status:** complete

### Phase 12: Sheet Inspection from Claude (v10)
- Drive MCP disconnected; gcloud OAuth blocked for personal Gmail; community MCPs hit same wall
- Added `dumpSheet` read-only endpoint to Code.gs (modes: metadata, values, formulas)
- API-key gated, capped at 10000 cells/request
- Discovered 2 data issues via inspection (see "Deferred Cleanup Items" below)
- **Status:** complete

### Phase 13d: Single-Ledger Redesign (v11.0 → v11.1)
- Pending tab → eliminated; Transactions tab is the single source of truth
- New Timestamp column (H) on Transactions for PWA dedup matching
- Empty Category = "needs categorization" (replaces Pending status field)
- 5 handlers refactored: processInfoAlerts_, handleParseAndFetch_, handleBatchCategorize_, handleCategorize_, handleUncategorize_
- Net: ~60 lines of Apps Script removed; copy/move bug class eliminated
- One-shot `migratePendingToTransactions()` + `consolidateTransactions()` rescue
- PWA contract preserved — no PWA changes needed
- Resolves: orphan rows 1001-1008 ($439 invisible spending) — automatically cleaned up during migration
- **Status:** complete

### Phase 13c: Budget Tab Dashboard Redesign (v10.5)
- After reading ZBB research report, user wanted dashboard-style "Ready to Assign" surface instead of scattered `_income` rows
- Removed 26 `_income` rows (one per period) — now ONE dashboard at top with period dropdown
- Dashboard rows 1-6: dropdown + Net Income + Fixed Expenses + Total Budgeted + Ready to Assign (color-coded) + Period progress
- Header at row 7, data starts at row 8
- Frozen rows = 7 so dashboard always visible while scrolling
- Slicer kept independent (filters category rows below) — required explicit `setColumnPosition(1)` after `insertSlicer()` to avoid broken filter UX
- Named ranges shifted: `Budget_*` from row 2 to row 8
- User explicitly REJECTED YNAB-style negative-carry rule, Goals columns, Category Transfers ledger, Sparklines (deferred for now)
- **Status:** complete

### Phase 13b: Instructions Tab Rewrite (v10.3)
- Stale references to manual paste workflow + missing Logs tab + missing v10.x menu items
- Rewrote `rows[]` array in `buildInstructionsTab_` (10 sections, ~65 rows)
- Plain numbered steps + color-coded menu function table
- Brief "For Developers" section pointing to clasp workflow
- **Status:** complete

### Phase 13: Version Display (v10.2 + PWA v0.8)
- User confused by old sheets bound to outdated Apps Script — wanted in-sheet version display
- Added `apps-script/VERSION.txt` as source of truth (publicly readable on GitHub raw URL)
- Code.js: `APP_SCRIPT_VERSION` + `LAST_EDITED` constants, GitHub fetch via `UrlFetchApp.fetch()` cached in Script Properties
- `writeVersionBlock_` writes 6-row color-coded display to Instructions tab rows 1–6
- New menu item "Refresh Version Info" + auto-refresh on `onOpen()`
- `?action=version` endpoint for PWA to query
- PWA Setup screen shows PWA + Apps Script versions + update status
- `appsscript.json` explicit `oauthScopes` array (added `script.external_request`)
- `requestPermissions()` helper to trigger one-time auth dialog (no try/catch around UrlFetchApp)
- `deploy.sh` auto-bumps `LAST_EDITED` timestamp + writes `VERSION.txt` on every deploy
- **Status:** complete

## Phases — Future

### Phase 14: Auto-Categorization (not started)
- [ ] Merchant → category mapping table in sheet
- [ ] Known merchants auto-categorize during parseAndFetch (skip Pending queue)
- [ ] Only unknown merchants need manual review in PWA
- **Status:** future

## Deferred Cleanup Items (discovered 2026-04-18 via dumpSheet)

### ✅ Orphan Transactions (RESOLVED in v11.0)
- 8 transactions stuck at rows 1001-1008 from pre-v9 `findNextEmptyRow_` bug
- Resolved automatically during single-ledger migration: orphans matched with Pending categorized rows, merged in place with Timestamp + Category, then consolidated to top of Transactions tab
- $439.10 of previously-invisible spending now visible in Budget

### ✅ Budget Available Circular Reference + Trailing Space (FIXED in v10.4, 2026-04-19)
- Available formula now wraps in `IF(MATCH(A,PayPeriods_Label,0)>1, IFERROR(SUMIFS(...)), 0)` for period 1
- New `cleanupSetupWhitespace_` helper trims D2:E100 on every Update Script
- PWA `saveNewCategory` always trims (defense in depth)
- Verified: Small trip period 1 = $0 (was $865K growing), value stable across re-queries

### Fixed Monthly Expenses Due Day formatted as Date
- Cells display "Dec 31, 1899" instead of "1"
- Underlying value coerces correctly in formulas (Budget _income shows -$1948 = correct sum)
- But fragile — re-editing Due Day will likely break things
- **Cleanup:** select C2:C5 → Format → Number → Plain → re-enter values

### Phase 15: Deferred Audit Items (low priority — see findings.md "Apps Script Audit")
- [ ] Hardcoded 2026 pay dates (problem in 2027)
- [ ] 999-row pre-filled formulas overhead (cleanup)
- [ ] Pagination for very large Pending lists
- [ ] Complex income formula simplification
- [ ] Retry logic for transient API errors
- [ ] Pending tab timestamp number format (lowercase h)
- [ ] `handleAddCategory_` off-by-one at line 371
- [ ] `setNamedRanges_` deletes all named ranges every time
- [ ] `rebuildBudgetInternal_` silently clears budget rows in add mode
- **Status:** future

## Workflow Reference (CRITICAL)

### Deploying Apps Script changes
```bash
cd ~/gsheetbudget2026-categorizerApp/apps-script
# edit Code.js in your editor (or via Claude)
./deploy.sh "vNN — short description"
```

`deploy.sh` runs `clasp push` then `clasp deploy -i <PROD_DEPLOYMENT_ID> -d "..."`.
**NEVER** use plain `clasp deploy` — it creates a new deployment with a new URL and breaks the PWA.

### Deploying PWA changes
```bash
cd ~/gsheetbudget2026-categorizerApp
# edit js/, index.html, css/, sw.js
# bump version in index.html (header span) AND CACHE_VERSION in sw.js
git add . && git commit -m "..." && git push
# GitHub Pages auto-deploys from main branch
```

### After Apps Script changes, check the Logs tab
Open the budget sheet → Budget Tools → View Activity Log. Every API call from the PWA appears with duration, status, and details.

### After deploying, verify
```bash
clasp deployments     # should still show 7 deployments (HEAD + 6 versions)
                      # if it shows 8+, you accidentally created a new one — see findings.md recovery procedure
```

## Errors Encountered (high-impact only)

| Error | Resolution |
|-------|------------|
| Drive MCP can't access Sheets | Use clasp CLI for Apps Script (not Drive) |
| Period model unintuitive | Pay date = period start |
| Fixed Expenses tab unusable | Compact master list + SUMPRODUCT |
| getPlainBody() empty for HTML emails | Use getBody() + HTML stripping (v6.1) |
| POST body lost on 302 redirect | All actions via GET with URL params (v7.2) |
| Verbose Date.toString() in API responses | `Utilities.formatDate()` (v7.1) |
| knownTimestamps stale cache hiding txns | In-memory only, removed entirely in v8 |
| **Transaction writes going to row 1001+** | Rewrote `findNextEmptyRow_` to scan column A (formula-filled cells confuse `getLastRow`) (v9) |
| Categories not showing on tap | `selectTransaction()` now calls `renderCategories()` (v0.6) |

## Notes
- **Source of truth:** this git repo. Old Google Drive Code.gs and .md files are stale backups (still synced as a safety copy after each session).
- **Production deployment ID:** `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ` (in `apps-script/deploy.sh` and `js/config.js DEFAULT_API_URL` — must match)
- **PWA URL:** https://fahyad.github.io/gsheetbudget2026-categorizerApp/
- **GitHub repo:** `fahyad/gsheetbudget2026-categorizerApp` (public)
- **Local repo:** `/Users/fahyadkhan/gsheetbudget2026-categorizerApp`
- **clasp version:** 3.3.0 (`~/.npm-global/bin/clasp`)
- **clasp auth:** `~/.clasprc.json` (OAuth, never committed)
- **Credit card alerts only.** Debit alerts have a different format — TBD.
