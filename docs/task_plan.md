# Task Plan: 2026 Personal Budget + Transaction Categorizer

## Goal
1. Build a complete Google Sheets personal budget workbook with named ranges, formulas, Apps Script, and a slicer.
2. Build a transaction categorizer system: email parser (Apps Script) + mobile PWA (GitHub Pages) for categorizing Scotiabank infoalert transactions on phone.

## Current Phase
v7.3 + PWA deployed with add category. All 5 API endpoints complete. Awaiting user testing.

## Phases — Budget Workbook (Complete)

### Phase 1: Gather User Inputs
- [x] All inputs gathered
- **Status:** complete

### Phases 2–6: Build Workbook via Apps Script
- [x] v1: Initial script
- [x] v2: Period model flipped + removed Setup clutter
- [x] v3: Setup cleanup (removed Pay Date, hidden Start/End, categories adjacent)
- [x] v4: Fixed Monthly Expenses redesign (compact master list + SUMPRODUCT)
- [x] v5: Update Script + Instructions Tab (safe update function, formatted instructions)
- [x] v6: Email Parser + Pending Tab
  - `processInfoAlerts()` — batched Gmail parsing (4 API calls total)
  - Pending tab — queue for uncategorized transactions (7 cols, orange tab)
  - Regex: `for $(AMOUNT) at MERCHANT on account ... at TIME`
  - `buildTimestamp_()` helper for date+time dedup key
  - Menu: added "Parse Emails"
  - Instructions: added Parse Emails section + Gmail label warning
  - Build Workbook now creates 6 tabs
- **Status:** complete

### Phase 7: End-to-End Verification
- [ ] Paste Code.gs v6 into Apps Script editor
- [ ] Run Build Workbook → verify 6 tabs (Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Pending)
- [ ] Run Initialize Budget → verify Budget rows and slicer
- [ ] Confirm Setup shows only 3 visible columns
- [ ] Confirm Fixed Monthly Expenses is a clean 4-row list
- [ ] Confirm Instructions tab is formatted with color-coded sections
- [ ] Confirm Pending tab exists with headers and orange tab color
- [ ] Run Parse Emails → verify Safeway $15.74 appears in Pending tab
- [ ] Verify email gets "Budget/Processed" label in Gmail
- [ ] Add a 5th expense to Fixed Monthly Expenses → verify Budget auto-updates
- [ ] Enter a Paycheck transaction → confirm _income row updates
- [ ] Enter a purchase (negative) → confirm Spent/Available update
- [ ] Test Add Category
- [ ] Test Update Script (safe — no data loss)
- **Status:** pending

## Phases — Transaction Categorizer (Upcoming)

### Phase 8: Apps Script Web App API
- [x] Add `doGet()` / `doPost()` endpoints
- [x] `doGet({action: "parseAndFetch"})` — parse emails + return new pending transactions
- [x] `doGet({action: "categories"})` — return category list from Setup
- [x] `doPost({timestamp, category})` — write to Transactions, mark Pending row as categorized
- [x] Dedup: accept `knownTimestamps` param, only return new transactions
- [x] API key auth via Script Properties + `setApiKey()` menu item
- [x] Refactored `processInfoAlerts()` into UI wrapper + internal `processInfoAlerts_()`
- [x] Updated Instructions tab with API deployment guidance
- [ ] Deploy as web app: Execute as me → Anyone
- [ ] Set API key via menu
- [ ] Test via browser (categories, parseAndFetch, categorize)
- [x] v7.1: Fixed timestamp format (Utilities.formatDate instead of .toString())
- **Status:** complete (categories + parseAndFetch confirmed; categorize untested)

### Phase 9: GitHub Pages PWA
- [x] Create GitHub repo: `fahyad/gsheetbudget2026-categorizerApp` (public)
  - Local path: `/Users/fahyadkhan/gsheetbudget2026-categorizerApp`
  - GitHub CLI auth: `fahyad` (keyring, HTTPS) — can push via `gh` or `git push`
- [x] Code.gs v7.2: added `uncategorize` endpoint to `doPost(e)`
- [x] `js/config.js` — API URL + key management (localStorage)
- [x] `js/api.js` — HTTP layer: fetchCategories, parseAndFetch, categorize, uncategorize
- [x] `js/store.js` — in-memory state + localStorage cache (categories, knownTimestamps, lastCategorized)
- [x] `js/app.js` — main logic: init, refresh, optimistic categorize/undo, DOM rendering
- [x] `index.html` + `css/style.css` — mobile-first app shell
- [x] `manifest.json` + `sw.js` — PWA manifest + service worker (cache-first app shell)
- [x] Pushed to GitHub, GitHub Pages enabled
- [x] Live at: https://fahyad.github.io/gsheetbudget2026-categorizerApp/
- [x] v7.3: added addCategory API endpoint + refactored rebuildBudget_ (wrapper + internal)
- [x] PWA: add category modal (pick existing main or "New..." + sub category input)
- [x] Bug fix: [hidden] attribute override by CSS display rules
- [ ] User: paste Code.gs v7.3 + create new deployment
- [ ] User: test full flow on phone (config → refresh → categorize → undo → add category)
- **Status:** deployed — awaiting user testing

### Phase 10 (future): Auto-Categorization
- [ ] Merchant → category mapping table in sheet
- [ ] Known merchants auto-categorize, skip Pending queue
- [ ] Only unknown merchants need manual review
- **Status:** future

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Drive MCP can't access Sheets | Apps Script paste approach |
| Apr 1 expenses unassigned | Period End inclusive |
| Period model unintuitive | Pay date = period start |
| Setup cluttered | Removed/hidden columns |
| Fixed Expenses tab unusable | Compact master list + SUMPRODUCT |

## Notes
- Script: gsheet finiance/Code.gs (currently v7.3)
- First time: Build Workbook → Initialize Budget
- After code updates: Update Script (safe)
- Add categories: edit Setup D:E → run Add Category
- Add fixed expenses: edit Fixed Monthly Expenses directly (self-updating)
- Parse emails: Budget Tools → Parse Emails (or from PWA in future)
- Credit card alerts only for now (debit alerts TBD)
- PWA repo: `/Users/fahyadkhan/gsheetbudget2026-categorizerApp` (fahyad/gsheetbudget2026-categorizerApp)
