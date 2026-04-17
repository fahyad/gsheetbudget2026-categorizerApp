# Progress Log

## Session: 2026-04-12

### Phases 1–6: Complete (v1 → v6)
- v1: Initial script with all tabs, formulas, named ranges
- v2: Period model flip + removed Gross Pay/Fixed Deductions/Net Income from Setup
- v3: Setup cleanup — removed Pay Date, hidden Start/End, categories in D:E
- v4: Fixed Monthly Expenses redesign
  - Tab renamed from "Fixed Expenses" to "Fixed Monthly Expenses"
  - 48 expanded date rows → 4-row master list (Name, Monthly Amount, Due Day)
  - SUMPRODUCT+LET formula auto-calculates which months' due dates fall in each period
  - Named range: FixedExpenses_DueDate → FixedExpenses_DueDay
  - buildIncomeFormula_() helper extracted for readability
- v5: Update Script + Instructions Tab
  - Added updateWorkbook() — safe formula/range refresh (no data clearing)
  - Added Instructions tab with color-coded formatting
  - Extracted setTransactionFormulas_() and setNamedRanges_() helpers
  - Updated menu with clearer labels and Update Script option
  - Build Workbook now creates 5 tabs, improved data-loss warning
- v6: Email Parser + Pending Tab
  - Added processInfoAlerts() — parses Scotiabank infoalert emails from Gmail
  - Batched API approach: 4 total calls regardless of email count
  - Regex: `for $(AMOUNT) at MERCHANT on account ... at TIME`
  - buildTimestamp_() helper: combines email date + parsed time → dedup key
  - Amounts negated (purchases → negative in budget)
  - Batch writes to Pending tab via single setValues() call
  - Labels processed emails "Budget/Processed" via batch addToThreads()
  - Added Pending tab to buildWorkbook() (7 cols, orange tab color)
  - updateWorkbook() creates Pending tab if missing (safe)
  - Updated menu: added "Parse Emails"
  - Updated Instructions tab: Parse Emails section + Gmail label warning
  - Build Workbook now creates 6 tabs

## Session: 2026-04-15

### Transaction Categorizer — Planning & Architecture
- Designed full system architecture: Apps Script backend + GitHub Pages PWA frontend
- Key decisions made:
  - Manual trigger (not auto-polling) — user controls when emails are parsed
  - Trigger from PWA via Apps Script doGet() endpoint
  - Timestamp (date+time) as dedup key
  - PWA local cache prevents re-fetching already-loaded transactions
  - Pending tab in same budget sheet
  - All transactions manual categorization (Phase 1); auto-categorization is Phase 10
  - Credit card alerts only for now; debit alerts later
- Researched Apps Script Gmail performance:
  - Bottleneck is API call count, not parsing speed
  - Batched approach: search + getMessagesForThreads + setValues + addToThreads = 4 calls total
  - getPlainBody() initially chosen but failed (see error log); switched to getBody() + HTML stripping in v6.1
  - Expected: 2–4 seconds for 1–10 emails
- Analyzed Scotiabank infoalert email format:
  - From: infoalerts@scotiabank.com
  - Subject: "Authorization on your credit account"
  - Body pattern: "There was an authorization for $AMOUNT at MERCHANT on account XXXX at TIME pm ET."
- Built v6 with email parser and Pending tab

### v6.1: Parser fix — getPlainBody() → getBody() + HTML stripping
- User tested Parse Emails: 0/31 messages parsed, all reported as errors
- Root cause: emails are HTML-only, getPlainBody() returned empty/garbled text
- Fix: switched to getBody() with HTML tag stripping + entity decoding + whitespace collapse
- User removed Budget/Processed labels from Gmail for re-test

### Phase 7: Verification
- **Status:** pending — user needs to paste Code.gs v6.1 and re-test Parse Emails

## Error Log
| Timestamp | Error | Resolution |
|-----------|-------|------------|
| 2026-04-12 | Drive MCP can't access Sheets | Apps Script paste |
| 2026-04-12 | Apr 1 expenses gap | Period End inclusive |
| 2026-04-12 | Period model unintuitive | Pay date = start |
| 2026-04-12 | Setup cluttered | Remove/hide columns |
| 2026-04-12 | Fixed Expenses tab unusable | Compact list + SUMPRODUCT |
| 2026-04-15 | getPlainBody() returns empty for HTML-only emails (0/31 parsed) | Switch to getBody() + HTML strip + entity decode (v6.1) |
| 2026-04-15 | Timestamp returned as verbose JS Date string in API response | Use Utilities.formatDate() instead of .toString() (v7.1) |
| 2026-04-15 | CSS display:flex overrides HTML hidden attribute on undo-bar | Added [hidden] { display: none !important } |
| 2026-04-15 | POST body lost on Apps Script 302 redirect (categorize not updating sheet) | Switched all PWA calls to GET with URL params |
| 2026-04-15 | knownTimestamps persisted in localStorage, filtering out all transactions | Made knownTimestamps in-memory only |
| 2026-04-16 | Categories not showing in PWA (only "Add Category" visible) | selectTransaction() now calls renderCategories(); error catch added; empty state message |

### v7: Apps Script Web App API (Phase 8)
- Added `doGet(e)` — routes GET requests to `parseAndFetch` or `categories` actions
- Added `doPost(e)` — handles `categorize` action (writes to Transactions, marks Pending row)
- Added `handleParseAndFetch_(params)` — parses emails + returns new pending transactions as JSON
- Added `handleCategories_()` — returns category list from Setup tab as JSON
- Added `handleCategorize_(body)` — finds Pending row by timestamp, writes to Transactions, updates Pending status
- Added `setApiKey()` — prompts user for API key, stores in Script Properties
- Added `validateApiKey_(key)` — checks request key against stored Script Property
- Added `jsonResponse_(data)` — helper for `ContentService.createTextOutput().setMimeType(JSON)`
- Added `formatDate_(date)` — formats date as "yyyy-mm-dd" for JSON output
- Added `findNextEmptyRow_(sheet)` — finds first empty row in a sheet
- Refactored `processInfoAlerts()` → UI wrapper that calls internal `processInfoAlerts_()`
- `processInfoAlerts_()` — internal version, no UI calls, returns result object (safe for web app context)
- Updated menu: added "Set API Key" item
- Updated Instructions tab: added API deployment section + API key setup
- **Status:** complete

### v7.1: Timestamp format fix
- Timestamps in Pending tab are auto-parsed by Sheets into JS Date objects
- `.toString()` on Date produced verbose format: `"Tue Apr 14 2026 18:21:00 GMT-0600 (Mountain Daylight Time)"`
- Fix: use `Utilities.formatDate()` to produce clean `"yyyy-mm-dd hh:mm:ss"` in both `handleParseAndFetch_()` and `handleCategorize_()`
- Applied to both reading (API response) and matching (categorize lookup)

### GitHub Repo Created
- Repo: `fahyad/gsheetbudget2026-categorizerApp` (public)
- Local: `/Users/fahyadkhan/gsheetbudget2026-categorizerApp`
- Auth: `gh` CLI logged in as `fahyad` (keyring, HTTPS) — can push directly

### Phase 8: API Testing Results
- **categories endpoint:** confirmed — returns 7 categories with main/sub grouping
- **parseAndFetch endpoint:** confirmed — returns 31 transactions with clean timestamps
- **categorize endpoint:** code complete, not yet tested by user
- **Status:** complete

### v7.2: Uncategorize endpoint
- Added `uncategorize` action to `doPost(e)` route
- Added `handleUncategorize_(body)` — reverses a categorization:
  - Searches Transactions tab for matching row (merchant + amount + category, last match)
  - Deletes that row via `sheet.deleteRow()`
  - Restores Pending row status to "pending", clears Category
  - Edge case: if Transactions row not found, still restores Pending row
- **Status:** complete — awaiting user testing (paste Code.gs, new deployment)

### Bug Fix: POST requests not reaching Apps Script
- POST requests through Apps Script 302 redirects get converted to GET (HTTP spec), dropping the body
- Categorize/uncategorize/addCategory calls were silently failing — sheet never updated
- Fix: moved all write actions into `doGet` alongside read actions; PWA now uses GET for everything
- GET params are URL-encoded; `amount` parsed with `parseFloat()` for numeric comparison
- **Lesson:** Apps Script web apps should use GET for all actions from browser clients due to redirect behavior

### Bug Fix: knownTimestamps causing "no transactions"
- `knownTimestamps` was persisted in localStorage across sessions
- All 31 timestamps from previous fetches were saved, so parseAndFetch filtered them all out
- Server already filters by `status === 'pending'`, making client-side dedup redundant
- Fix: knownTimestamps is now in-memory only (not persisted). Cleans up stale localStorage key.
- Added version number (v0.4) to PWA header for easier debugging

### Bug Fix: hidden attribute override
- CSS `display: flex` on `#undo-bar` was overriding HTML `hidden` attribute
- Undo bar visible on load, category picker hidden behind it
- Fix: added `[hidden] { display: none !important; }` to CSS

### v7.3: Add Category API + rebuildBudget refactor
- Refactored `rebuildBudget_(mode)` → UI wrapper + `rebuildBudgetInternal_(mode, ss)` (no UI calls)
- Added `handleAddCategory_(body)` to `doPost(e)`: validates, writes to Setup D:E, rebuilds Budget
- Duplicate sub category check (case-insensitive)
- Returns `{ success, category: {main, sub}, budgetRowsAdded }`
- **Status:** complete — awaiting user testing (paste Code.gs, new deployment)

### Phase 9: PWA Add Category Feature
- Added `api.addCategory(main, sub)` — POST to new endpoint
- Added `store.addCategory(cat)` / `store.removeCategory(sub)` for optimistic UI
- Added modal: main category dropdown (existing + "New...") + sub category text input
- Optimistic flow: add to store immediately, rollback on API failure
- Bumped SW cache to v2
- Pushed to GitHub

### Phase 9: PWA Foundation Built
- Researched optimal architecture: optimistic UI, CORS via text/plain, localStorage, single-level undo
- Created PWA with 9 files:
  - `js/config.js` — API URL + key management (localStorage)
  - `js/api.js` — HTTP layer for 4 endpoints (fetchCategories, parseAndFetch, categorize, uncategorize)
  - `js/store.js` — in-memory state + localStorage cache (categories, knownTimestamps)
  - `js/app.js` — main logic: init, refresh, categorize (optimistic), undo (optimistic), DOM rendering
  - `index.html` — single page app shell with config/app/undo sections
  - `css/style.css` — minimal mobile-first styles (48px+ tap targets, fixed category picker, undo bar)
  - `manifest.json` — PWA manifest (standalone, theme color #1a237e)
  - `sw.js` — service worker (cache-first app shell, network-only for API)
  - `icons/icon.svg` — placeholder SVG icon
- Pushed to GitHub: `fahyad/gsheetbudget2026-categorizerApp`
- GitHub Pages enabled: https://fahyad.github.io/gsheetbudget2026-categorizerApp/
- **Status:** deployed — awaiting user testing

## Session: 2026-04-16

### Architecture Review & Batch Sync Decision
- User reported categories not showing in PWA (only "Add Category" visible)
- Before fixing, user requested a **visual summary of system communication flow**
- Created full architecture diagram: 3 components (Sheet, Apps Script, PWA), 4 user flows (Refresh, Categorize, Undo, Add Category)
- User asked: "What if we do categorizations in batches?" and "What if we build the whole app in Apps Script?"
- Analyzed 3 options:
  1. **Current (chatty):** 2+N API calls per session — fragile, slow
  2. **Batch PWA:** 3 API calls total — fast, robust, keeps PWA benefits
  3. **Pure Apps Script (HtmlService):** 0 external calls — simplest but no PWA, slower loads, uglier UX
- **Decision:** Batch PWA — user approved

### v8: Batch Sync Refactor
- **Categorize is now fully local** — no API call, instant. Transaction removed from list, added to sync queue
- **Undo is now fully local** — no API call, instant. Removes from sync queue, restores transaction
- **Sync button** sends all queued categorizations in **one API call** (`batchCategorize`)
- **Sync queue** persisted to localStorage — survives page close/refresh
- **`beforeunload` warning** — browser prompts if closing with unsent items
- **Removed:** `api.categorize()`, `api.uncategorize()`, `store.knownTimestamps`, `categorizeInFlight` lock
- **Added to Code.gs:** `handleBatchCategorize_(params)` — reads Pending once, writes Transactions in single `setValues()`, returns per-item results
- **Added to doGet route:** `batchCategorize` action
- **Performance:** 30 transactions = 3 API calls total (categories + parseAndFetch + batchSync) instead of 32+

### Bug Fix: Categories not showing in PWA
- **Error:** Tapping a transaction showed only "Add Category" — no category buttons
- **Root cause:** `selectTransaction()` did not call `renderCategories()` before showing picker. Categories were only rendered once at init, and the async `fetchCategories()` error was silently swallowed (`.catch(() => {})`)
- **Fix (3 changes):**
  1. `selectTransaction()` now calls `renderCategories()` before unhiding picker
  2. `init()` catch logs error + shows message if categories array is empty
  3. `renderCategories()` shows "No categories loaded. Tap Refresh." when empty
  4. `refresh()` now re-fetches categories too (not just transactions)

### PWA v0.6 Changes
- Sync button in header (disabled when 0 pending, orange with count when items queued)
- Version bump v0.4 → v0.6
- Service worker cache bump v4 → v6
- `parseAndFetch()` no longer sends `knownTimestamps` (removed client-side dedup entirely)
- Empty state message in category picker

### Error Log Updates
| Timestamp | Error | Resolution |
|-----------|-------|------------|
| 2026-04-16 | Categories not showing in PWA (only "Add Category" visible) | `selectTransaction()` now calls `renderCategories()` before showing picker; error catch added to category fetch |

### Phase 10: Status
- Code.gs v8 ready — user needs to paste + deploy new version
- PWA v0.6 pushed to GitHub Pages
- **Status:** awaiting user testing of batch sync flow

## Session: 2026-04-16 (cont.) — v9 Hardening

### Critical Bug Discovered: Transaction Writes Going to Row 1001+
- **Report:** After batch sync, Pending rows marked "categorized" but Transactions tab showed no new rows
- **Root cause:** `getLastRow()` counts formula-filled cells as content even when formulas return `""`. Transactions tab has formulas pre-filled in rows 2-1000 (cols E and G via `setTransactionFormulas_`). `getLastRow()` returns 1000, so `findNextEmptyRow_` returns 1001. All writes (since initial build) landed at rows 1001+, far below the visible range
- **This was the root cause for the OLD single-txn `handleCategorize_` too** — undetected because the response payload was generated by reading back from the same (wrong) row
- **User action:** Scroll to row 1001+ in Transactions to see orphaned data from prior tests; manually clean up

### Apps Script Audit — 26 Issues Identified
Full audit ranked findings into critical/high/medium/low. This session addressed the critical bug + high-priority items. Deferred: hardcoded 2026 pay dates, 999-row pre-fill overhead, complex income formula, `handleAddCategory_` off-by-one, silent clear in `rebuildBudgetInternal_`, etc. (see `findings.md`).

### v9 Changes

**Bug Fix:**
- `findNextEmptyRow_()` rewritten — now scans column A (never a formula column) from bottom up to find the actual last data row. Safe regardless of formula-filled rows

**Activity Log + Observability:**
- New `Logs` tab (auto-created on first write): Timestamp | Action | Duration (ms) | Status | Details | Error
- Newest entries inserted at row 2 (top-first)
- `logActivity_(action, duration, status, details, error)` helper — also mirrors to `console.log/warn/error` for Cloud Logging persistence
- `getOrCreateLogsSheet_()` — creates tab with headers, frozen row, column widths on first call
- `rotateLogsIfNeeded_()` — archives to `Logs_Archive_<timestamp>` when > 5000 rows
- `summarizeResult_(action, parsed)` — produces human-readable detail string per action type
- `routeAction_(action, params)` — pure dispatch, extracted from doGet/doPost
- `showLogsTab()` — menu function that opens the Logs tab
- Menu item: "Budget Tools → View Activity Log"
- **Every API request logged** — action, duration, status, per-action summary, error details

**Hardening:**
- `LockService.getScriptLock()` wraps 4 mutating handlers (batchCategorize, categorize, uncategorize, addCategory). 10s acquire timeout, 30s for addCategory (rebuilds budget). Returns clear error if busy
- **Write verification** after Transactions `setValues()` — reads back row, asserts merchant + amount match. If mismatch, logs to Logs tab and returns error WITHOUT updating Pending (prevents the exact inconsistency that caused this session's bug)
- **Category validation** — loads Setup!E2:E100 once, rejects items with unknown categories before writing. Returns clear error instead of silent data validation rejection
- **Batched Pending updates** in `handleBatchCategorize_` — contiguous rows → single `setValues()`; non-contiguous → per-row `setValues` (replaces 2N individual `setValue` calls)
- `SpreadsheetApp.flush()` added after Transactions writes

### Error Log Updates
| Timestamp | Error | Resolution |
|-----------|-------|------------|
| 2026-04-16 | Transactions writes going to row 1001+ (getLastRow formula bug) | Rewrote findNextEmptyRow_ to scan column A; added write verification as safety net |

### Phase 10+: Status
- Code.gs v9 complete — user needs to paste + deploy new version
- No PWA changes this session
- **Status:** awaiting user deployment + testing

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Code.gs v9 with Logs tab + LockService + write verification. Fixed findNextEmptyRow_ (was writing to row 1001+). Awaiting user deployment. |
| Where am I going? | User tests v9 (verify Transactions writes to row 2, 3, 4 etc; verify Logs tab populates; verify LockService prevents races). Then optional PWA polish, then Phase 11 (deferred audit items). |
| What's the goal? | Budget sheet + mobile transaction categorizer system |
| What have I learned? | 9 iterations; getLastRow counts formula-filled cells as content (THE lesson); batch sync; local-first categorize/undo; LockService for concurrency; write verification as safety net; sheet-based activity log + Cloud Logging mirror |
| What have I done? | Script v9: fixed findNextEmptyRow_, added Logs tab, logActivity_, summarizeResult_, routeAction_, LockService on 4 handlers, write verification, category validation, batched Pending updates, flush after writes, "View Activity Log" menu |
