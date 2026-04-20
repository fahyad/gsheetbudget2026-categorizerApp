# Task Plan: 2026 Personal Budget + Transaction Categorizer

## Goal
1. Google Sheets personal budget workbook with named ranges, formulas, Apps Script automation, and a slicer.
2. Transaction categorizer system: Apps Script email parser + GitHub Pages PWA for categorizing Scotiabank infoalert transactions on phone.

## Current State (April 2026)
- **Apps Script:** v11.6 — Single-ledger architecture (v11.0+) plus 4 phases of integrated-review work (v11.3 → v11.6). LockService on processInfoAlerts_, unique timestamp suffixes, batched verify-read, stricter validation, scoped named-range removal, no-match errors on uncategorize, and many docs/polish fixes. See `docs/progress.md` 2026-04-19 entry for the detailed phase breakdown.
- **PWA:** v0.11 (cache v14) — adds period filter dropdown so the user can scope the list to a single pay period (Phase 5). Plus all v0.10 fixes (sync/undo race guard, refresh debounce, localStorage quota recovery, green success toast, beforeunload prompt fix, single APP_VERSION source).
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

### Phase 14: Integrated Code Review (v11.3 → v11.6 + PWA v0.10)
Three independent reviews (mine + 2 external) merged into a single 26-item plan, executed in 4 phases:
- **Phase 1 (v11.3):** S1 leaked API key scrub + rotation; S2 sw.js cache version bump (was stuck on v9 across multiple PWA-affecting releases); S3 unique-suffix Timestamps so two same-second emails can't collide; S4 LockService on processInfoAlerts_ (was racing with PWA syncs).
- **Phase 2 (v11.4):** A3 res.ok HTTP status check (was masking 500s as JSON parse errors); A4 sync/undo race guard; A6 refresh button debounce; A8 handleUncategorize_ no-match returns error (was silent success); A9 localStorage quota guard with fallback recovery.
- **Phase 3 (v11.5):** A2 batched verify-read in handleBatchCategorize_ (~30x fewer reads on a 30-item batch); A5 handleAddCategoryInner_ capacity error instead of silent overflow; A7 stricter setAllowInvalid validation; B1 findNextEmptyRow_ throws past row 1000 (was silently writing orphans); B3 setNamedRanges_ scoped to owned prefixes; B4 beforeunload prompt actually fires now.
- **Phase 4 (v11.6):** B2 consolidateTransactions renamed to consolidateTransactionsRescue with stronger docstring; B5 PWA version unified to single APP_VERSION source; B7 showSuccess() helper (sync success no longer red); B8 portable `sed -i.bak` in deploy.sh; B9 BUDGET_YEAR constant; B10 buildAvailableFormula_ helper extracted; C1 scrubbed remaining Pending references in user-visible Instructions tab + alerts + comments.
- **Status:** complete

### Phase 15: PWA Period Filter (PWA v0.11)
The user falls behind on categorization sometimes. When a new pay period starts, they want to focus on just-the-current-period txns and circle back to the older ones later. New `js/periods.js` derives pay-period info from a single anchor (`Date.UTC(2026,0,21)` = period 1 start) plus a special case for period 0 (the long lead-in). No backend changes — period assignment uses `txn.timestamp.slice(0,10)` (locale-independent ISO date). Dropdown options are computed from the current uncategorized set: empty periods don't appear, current period is flagged, counts inline. Default selection: current if it has txns, else "All". Annual rollover touches the two PWA constants. Verified with 13 boundary tests including hash-suffixed timestamps.
- **Status:** complete

## Phases — Future

### Phase 16: Auto-Categorization (not started)
- [ ] Merchant → category mapping table in sheet
- [ ] Known merchants auto-categorize during parseAndFetch (skip the uncategorized queue)
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

### Phase 17: Deferred Audit Items (low priority — see findings.md "Apps Script Audit")
- [x] Hardcoded 2026 in fixed-expenses formula → `BUDGET_YEAR` constant (B9, v11.6). PayPeriods array still hardcoded — annual rollover touches 2 places.
- [ ] 999-row pre-filled formulas overhead (cleanup)
- [ ] Pagination for very large uncategorized-transaction lists (no longer "Pending" — single ledger)
- [ ] Complex income formula simplification
- [ ] Retry logic for transient API errors
- [x] `handleAddCategory_` off-by-one — fixed (A5, v11.5): now returns explicit capacity error
- [x] `setNamedRanges_` deletes all named ranges every time — fixed (B3, v11.5): scoped to owned prefixes
- [ ] `rebuildBudgetInternal_` silently clears budget rows in add mode
- **Status:** ongoing — 3 of 8 items resolved by Phase 14 review work

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
