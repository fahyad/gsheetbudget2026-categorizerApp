# Progress Log

> ## 📍 Current State (read this first)
>
> **Apps Script:** v9 — at `apps-script/Code.js`, deployed via `cd apps-script && ./deploy.sh "..."`. NEVER use plain `clasp deploy` (creates a new URL, breaks PWA).
>
> **PWA:** v0.7 — at `index.html`, `js/`, `css/`, `sw.js`. Auto-deployed via GitHub Pages on `git push`.
>
> **Production deployment ID:** `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ` (in `apps-script/deploy.sh` and `js/config.js DEFAULT_API_URL` — must match).
>
> **For full orientation:** read `CLAUDE.md` (root) and `docs/task_plan.md`.
>
> The session entries below are CHRONOLOGICAL — older entries reference workflows that are NO LONGER USED (e.g. "user pastes Code.gs into Apps Script editor"). Treat them as history, not current procedure.

---

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

## Session: 2026-04-17 — clasp Migration + v0.7 Setup Simplification

### Workflow Migration: Manual Paste → clasp (CLI)
**Before:** edit Code.gs in Drive → Apps Script editor → paste → save → Deploy → New version. No git, no diffs, no rollback.
**After:** edit `apps-script/Code.js` in any editor → `./deploy.sh "desc"` (runs `clasp push` + `clasp deploy -i <prodId>`). Full git history.

**Steps completed:**
- Installed clasp 3.3.0 at `~/.npm-global/bin/clasp` (user prefix, no sudo)
- `~/.zshrc` PATH updated
- Added clasp MCP to `~/Library/Application Support/Claude/claude_desktop_config.json` (activates after Claude restart)
- `clasp login` → `~/.clasprc.json`
- Clone via `clasp clone 1EIXhe6Vv6SEaA7x_nn9a7OHsmRhctyp6GoQDfuui5ZRbvCs2F4u9tMjs --rootDir .` into `apps-script/`
- Diff against local Code.gs = identical → no push needed initially
- Moved `findings.md`, `progress.md`, `task_plan.md` from Drive to `docs/`
- Added `.gitignore` (excludes `.clasprc.json`, `.DS_Store`, editor dirs)
- Added `apps-script/.claspignore` (allowlist: only `Code.js` + `appsscript.json`)
- Added `apps-script/deploy.sh` — one-command deploy hardcoded to production deployment ID `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ` (prevents accidental new-URL creation)
- Commits `6102517` (migration) + `e4d377d` (deploy.sh) pushed

### PWA v0.7 — Simplified Setup (URL Hardcoded)
**Problem:** Setup screen asked for URL + Key every new device. URL never changes (single deployment).

**Fix:**
- `js/config.js`: `DEFAULT_API_URL` constant (production deployment URL)
- `getApiUrl()` returns localStorage override OR default
- Setup form asks for API Key only; URL moved to optional `<details>` "Advanced" section
- `isConfigured()` now checks only for key (URL is always configured)

**API key rotation:**
- Generated new 40-char key via `openssl rand -base64 36` (key value redacted from this log; never commit)
- User sets in Apps Script via "Budget Tools → Set API Key"
- User updates PWA on each device (one-time, per device)

**Security trade-off (explicitly accepted):**
- URL in public JS (GitHub Pages). Safe — already visible in network requests
- Key still private (localStorage only, never committed)
- Rotate anytime via `Set API Key` menu if leaked

### Version bumps
- PWA: v0.6 → v0.7
- SW cache: v6 → v7
- No Code.gs change

### Files changed (commit `a1adb6b`)
| File | Change |
|------|--------|
| `js/config.js` | DEFAULT_API_URL, getApiUrl fallback, isConfigured simplified |
| `index.html` | Setup form: key only; URL in `<details>`; version bump |
| `js/app.js` | Settings prefill only shows URL override, not default |
| `css/style.css` | `.advanced-config` styles |
| `sw.js` | Cache v6 → v7 |

### Deployment workflow reference

**ALWAYS use `./deploy.sh`** (or `clasp deploy -i AKfycbw2EbHNk_...` directly). Plain `clasp deploy` creates a NEW deployment with a NEW URL — the PWA is hardcoded to one URL, so it breaks immediately.

Production deployment ID (used by both `deploy.sh` and PWA `config.js DEFAULT_API_URL`):
`AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ`

```bash
cd ~/gsheetbudget2026-categorizerApp/apps-script
./deploy.sh "vNN — description"      # ✓ correct: push + update existing deployment
clasp logs --watch                    # live Cloud Logging tail
clasp status                          # show changed files
clasp pull                            # pull edits from Apps Script editor
clasp deployments                     # list deployments (should stay at 7)
```

**⛔ NEVER:** `clasp deploy -d "..."` — no `-i` = new URL = breaks PWA.

See findings.md "⚠️ CRITICAL: Always update the existing deployment" section for full details.

### Status
- PWA v0.7 live on GitHub Pages
- Awaiting user: (1) set new API key in Apps Script, (2) update PWA on each device

## Session: 2026-04-18 — v10 dumpSheet endpoint + sheet inspection

### Goal
User asked if I could read the Google Sheet directly without Chrome MCP. Investigated and found:
- Drive MCP server: disconnected (restart didn't bring it back)
- gcloud + Sheets API: blocked ("This app is blocked" for personal Gmail OAuth verification)
- Community MCP servers (mcp-google-sheets etc.): same OAuth wall
- Anthropic native Sheets connector: not in MCP registry yet (Sheets via Cowork "in development" per Feb 2026 announcement)
- Best path: add a read-only endpoint to the Apps Script we already own + use existing API key

### v10: dumpSheet endpoint
**New action `dumpSheet`** in Code.gs (read-only, API-key gated, capped at 10000 cells/request):

- `?action=dumpSheet&apiKey=...&metadata=true` → list all tabs + dimensions + colors
- `?action=dumpSheet&apiKey=...&tab=X&range=A1:F50` → display values
- `?action=dumpSheet&apiKey=...&tab=X&range=...&includeFormulas=true` → formulas + values mixed

Bug found and fixed during testing: `getTabColorObject().asRgbColor()` throws on tabs without color → wrapped in try/catch, returns null instead.

Two deploys: v10 (initial) + v10.1 (tabColor fix). Both via `./deploy.sh`. Same deployment ID. Production version is now @9.

### Sheet state inspection findings

**Tab inventory (7 tabs):**
| Tab | Status | Rows | Notes |
|-----|--------|------|-------|
| Instructions | OK | 79 | Documentation |
| Logs | OK | 47 | Activity log working — captured the v10 deploy + tabColor crash |
| Setup | OK | 27 | 26 periods + 7 categories |
| Fixed Monthly Expenses | ⚠️ Display bug | 5 | Due Day column formatted as Date — see findings.md |
| Budget | OK | 209 | 26 periods × 8 rows |
| Pending | OK | 33 | 32 transactions waiting |
| Transactions | ⚠️ Orphan rows 1001–1008 | 1008 | Pre-v9 bug wrote 8 transactions to wrong location |

**Discovery 1 — Orphan transactions ($439.10 invisible to budget):**
8 transactions categorized pre-v9 ended up in rows 1001–1008. They're correctly formatted but outside the named range `Transactions_Amount` (C2:C1000), so Budget Spent SUMIFS doesn't see them. Detailed table in findings.md "Known Data Issues" section.

**Discovery 2 — Fixed Monthly Expenses Due Day shows "Dec 31, 1899":**
Cell formatted as Date instead of Number. User typed `1` for "1st of month", Sheets stored it as Date(1) = Dec 31, 1899 (Sheets epoch day 1). Underlying value still coerces to numeric `1` so the SUMPRODUCT formula in Budget _income works correctly (verified: -$1948 = sum of 4 fixed expenses for Jan period). Display is just confusing.

**Discovery 3 — Activity Log validated:**
The Logs tab from v9 is collecting data correctly:
- 5 successful `dumpSheet` calls this session (durations 331–656ms)
- 1 crash captured at 15:51:20 (tabColor bug, full stack trace) — proved error capture works
- Yesterday's `parseAndFetch` from PWA: "parsed 0, returned 24 pending"

### Files changed
| File | Change |
|------|--------|
| `apps-script/Code.js` | Added `handleDumpSheet_()`, route in `routeAction_`, summary case in `summarizeResult_`. Try/catch on tab color. |
| `CLAUDE.md` | Added "Reading the Google Sheet" section + "Known data issues" section |
| `docs/findings.md` | Added dumpSheet to API table, "Known Data Issues" section with orphan rows + Due Day bug |
| `docs/progress.md` | This session entry |
| `docs/task_plan.md` | New deferred items (orphan cleanup, Due Day formatting) |

### Deferred (don't fix now, but documented)
1. **Orphan transactions cleanup** — write one-shot Apps Script function to migrate rows 1001–1008 to first empty rows in 2–1000
2. **Fixed Monthly Expenses Due Day formatting** — change column format Date → Number, re-enter values

### Status
- v10.1 deployed (production deployment ID unchanged, version @9)
- Sheet state fully visible to Claude going forward
- Two real data issues identified and documented for future cleanup

## Session: 2026-04-18 (cont.) — v10.2 + PWA v0.8 version display

### Goal
User opened an OLD sheet by mistake and didn't realize it was bound to outdated Apps Script code. Wanted in-sheet display of: current Apps Script version, last edited date, "is an update needed?". Same for PWA.

### Architecture decision
- **Source of truth:** `apps-script/VERSION.txt` in repo (publicly readable on GitHub raw URL — no OAuth needed)
- Each deployed Apps Script carries its own `APP_SCRIPT_VERSION` constant
- At runtime: `UrlFetchApp.fetch()` GitHub VERSION.txt, compare to local constant
- "Update needed: Yes/No" with color coding (red/green)

### v10.2 changes — Apps Script
- `apps-script/VERSION.txt` (NEW) — single source of truth
- `Code.js`:
  - `APP_SCRIPT_VERSION` + `APP_SCRIPT_LAST_EDITED` + `LATEST_VERSION_URL` constants
  - `getLatestVersionInfo_()` — fetches GitHub VERSION.txt, caches in Script Properties for 1 hour, falls back to cached on failure
  - `writeVersionBlock_(sheet)` — writes 6-row version display to Instructions rows 1–6 with color-coded update status
  - `refreshVersionInfo()` — menu function, force-refresh
  - `requestPermissions()` — one-time auth helper (no try/catch around UrlFetchApp so Google shows the auth dialog)
  - `handleVersion_()` — API endpoint
  - Modified `buildInstructionsTab_()` — existing content shifts to row 7+, version block fills 1–6
  - Modified `onOpen()` — auto-refreshes version block + adds "Refresh Version Info" menu item
  - Modified `routeAction_` + `summarizeResult_` for the new endpoint
- `appsscript.json` — explicit `oauthScopes` array including `script.external_request` for UrlFetchApp
- `deploy.sh` — auto-bumps `APP_SCRIPT_LAST_EDITED` to current time + writes `VERSION.txt` before push. Reads `APP_SCRIPT_VERSION` as single source. Single command keeps everything in sync.

### v0.8 changes — PWA
- `js/config.js`: `APP_VERSION` + `APP_LAST_EDITED` constants
- `js/api.js`: `fetchVersion()` function
- `index.html`: `#version-info` block in Setup screen with PWA + Apps Script + update status rows
- `js/app.js`: `populateVersionInfo()` — populates the block, handles error states gracefully
- `css/style.css`: `#version-info` styling, color classes for update status (red `update-needed`, green `up-to-date`)
- Bumped v0.7 → v0.8, SW cache v7 → v8

### Authorization gotcha (lesson learned)
- Web apps deployed `USER_DEPLOYING` run with the OWNER's OAuth grants. Adding a new scope (UrlFetchApp) doesn't auto-extend the grant.
- Re-deploying alone won't trigger re-auth — owner has to MANUALLY re-grant from the editor.
- And if the new scope is wrapped in try/catch, the auth error is swallowed before Google can show the auth dialog. Solution: temporary `requestPermissions()` function with NO try/catch around the UrlFetchApp call. User runs it from the editor → Google shows the dialog → user grants → done.
- After re-auth, all deployed code immediately picks up the new permission (no re-deploy needed).

### Verification
- `?action=version` returns `{version: "v10.2", latestVersion: "v10.2", updateNeeded: false, error: null}` ✓
- Instructions tab rows 1–6 populated with version info ✓ (still shows old error message until next `onOpen`/`Refresh Version Info` — auth was granted AFTER last refresh)
- VERSION.txt publicly accessible on GitHub raw ✓
- 4 deploys done this session (@10 v10.2 initial, @11 manifest scopes, @12 force push, @13 + requestPermissions helper)
- Production deployment ID UNCHANGED — PWA still works against same URL

### Status
- v10.2 deployed + authorized + tested
- PWA v0.8 live on GitHub Pages
- User just needs to reload the sheet (or run "Refresh Version Info" from menu) to see the green "Update needed: No" in the Instructions block

## Session: 2026-04-18 (cont.) — v10.3 Instructions tab rewrite

### Goal
Existing Instructions tab content was stale (referenced manual paste workflow, missing Logs tab + new menu items + version display). User wanted concise + sectioned + plain numbered steps.

### Changes
Replaced `rows[]` array in `buildInstructionsTab_` with new content:

**New section flow** (10 sections, ~65 content rows down from ~85):
1. Title — "BUDGET TOOLS — INSTRUCTIONS"
2. WHAT IS THIS? — 3-line overview + repo link
3. TABS — 1-line per tab + purpose (added Logs)
4. MENU FUNCTIONS — 8 items, color-coded (added View Activity Log + Refresh Version Info)
5. FIRST-TIME SETUP — 4 numbered steps
6. DAILY USE — 5 numbered steps (PWA workflow)
7. ADD / EDIT DATA — 3 sub-blocks
8. TROUBLESHOOTING — 5-entry problem→fix table
9. DO NOT — 6 hard rules (red bg)
10. FOR DEVELOPERS — 4 lines (repo, PWA URL, deploy command, docs)

**Removed (stale):**
- "HOW TO UPDATE THE SCRIPT CODE" with manual paste steps
- "HOW TO DEPLOY THE MOBILE APP API" with deployment dialog walkthrough
- Wordy 5-bullet descriptions for each menu item

**Added (current state):**
- Logs tab in TABS list
- View Activity Log + Refresh Version Info menu items
- Troubleshooting section with PWA + sync + version + auth issues
- For Developers section pointing to clasp workflow

**Same formatting palette** — colors, fonts, single-column layout. No schema changes to row format.

### Verification
- `dumpSheet` of rows 7–79 confirms all sections populated correctly ✓
- Color coding intact (red Build Workbook, yellow Initialize Budget, green safe items, gray info items)
- Version block (rows 1-6) still works
- Bumped to v10.3, deployed @14

### Status
- v10.3 deployed
- Instructions tab content rewritten and verified
- Sheet's version cache will refresh on next sheet open (or via Refresh Version Info menu)

## Session: 2026-04-19 — Budget calculation bug investigation

### Symptom reported
User opened Budget tab and saw inflated `Available` values for "Small trip" ($145,200) and "Eating out" ($89,700) — even though Budgeted = $0 and Spent = $0 in those cells. Other categories (Groceries, Gas, etc.) showed correct values.

### Investigation via dumpSheet
- Read full Budget tab — 234 data rows, 26 periods × 9 categories per period (1 _income + 8 sub-cats)
- Ran multiple `dumpSheet` queries minutes apart. **The bad values GREW each time** — Small trip went $145,200 → $745,200 → $865,200. Definite iterative calculation divergence.
- Read formulas with `includeFormulas=true` — confirmed all 208 Available cells use the IDENTICAL formula
- Verified Budgeted column underlying values are clean integers (0 or 300)
- Checked for whitespace differences in category names — Budget col C is clean, Setup col E mostly clean BUT "Eating out" row has main category `"Nice Things "` with trailing space

### Root cause identified
The Available formula:
```
=IFERROR(SUMIFS(Budget_Available, Budget_Period,
    INDEX(PayPeriods_Label, MATCH(A2, PayPeriods_Label, 0) - 1),
    Budget_Category, C2), 0) + D2 - E2
```

For period 1, `MATCH - 1 = 0`. **`INDEX(range, 0)` in Sheets returns the entire range as an array**, not an error. SUMIFS with array criterion matches Budget_Period against ANY of the 26 labels — effectively summing Available across all periods of the same category. This includes the cell itself → circular reference. Sheets resolves iteratively, with values multiplying ~27× per recalc for any category with non-zero Budgeted somewhere.

### Why only Small trip + Eating out diverge
All 208 cells use the same formula. Theory: Sheets caches a stable $0 fixed point for cells that were $0 when first evaluated. Older categories (Groceries, etc.) found this stable point before the user added $300/$200 Budgeted to period 8. Small trip and Eating out either were added later or had cells edited afterward — landed in the divergent iteration instead.

### Secondary issue
PWA's "Add Category" function passed user input without trimming → `"Nice Things "` (trailing space) saved to Setup E10. Will cause future INDEX/MATCH lookups for "Nice Things" (no space) to silently fail.

### Documented in findings.md
Two new postmortem entries:
- "Budget Available Circular Reference Bug" — full root cause, divergence math, fix
- "Trailing Whitespace in Category Names" — root cause, impact, prevention

### Option B implementation (v10.4 + PWA v0.9) — DONE
- Fixed Available formula in **two** places: `updateWorkbook` line 1426 + `rebuildBudgetInternal_` line 1907. Both now wrap in `IF(MATCH(A,PayPeriods_Label,0)>1, IFERROR(SUMIFS(...)), 0) + Budgeted - Spent` — period 1 explicitly returns 0 for the prior-period rollover, eliminating the bad `INDEX(_, 0)` call entirely
- Added new `cleanupSetupWhitespace_(ss)` helper. Reads Setup D2:E100, trims any string cells, writes back if changed. Called from `updateWorkbook` start (silently — only logs to Cloud Logging if changes were made)
- PWA `saveNewCategory` line 386: now always trims `mainCategory` regardless of dropdown vs new-input source
- Bumped APP_SCRIPT_VERSION to v10.4, PWA to v0.9, SW cache to v9
- Deployed @15

### Verification (post Update Script)
- Setup D10 = `"Nice Things"` (len 11) — was `"Nice Things "` (len 12) ✓
- Budget Small trip period 1 = $0 — was $865,200 ✓
- Budget Small trip period 8 = $300, periods 9-26 = $300 (rolled forward, stable) ✓
- Re-queried Available 3x — value stays $0 (was growing each query) — **circular ref gone** ✓
- Version endpoint: `version=v10.4`, `error=null` ✓

### Status
- v10.4 deployed and verified — Budget calculation bug fixed
- PWA v0.9 ready (will auto-deploy via GitHub Pages on push)
- All known critical bugs resolved as of this session

## Session: 2026-04-19 (cont.) — v10.5 Budget tab dashboard redesign

### Goal
After reading a Claude research report on ZBB best practices, user identified `_income` rows as "functional but not that useable" — scattered across 26 periods, hard to find, and hidden behind the slicer filter. Wanted a dedicated dashboard at top of Budget tab showing budgetable income for ONE period at a time (selected via dropdown). Display-only, fixed at top.

User explicitly REJECTED the YNAB-style negative-carry rule (`max(prior, 0)` rollover) — preferred shuffling money mid-period over having debt zeroed between periods.

### Design
- Rows 1-6: dashboard (frozen with row 7)
- Row 1: PERIOD dropdown (B1) + PROGRESS text (F1: "Day X of Y (Z% elapsed)")
- Row 4: 4 metrics — Net Income (raw paycheck), Fixed Expenses (only periods containing 1st of month), Total Budgeted, READY TO ASSIGN (color-coded green/red/yellow)
- Row 7: original header (now shifted from row 1)
- Row 8+: category data (no `_income` rows)
- Slicer: kept independent (filters category rows below; doesn't drive dashboard)

### Code.js changes (v10.5)
- Refactored `buildIncomeFormula_(row)` → split into `buildPaycheckFormula_(periodCellRef)` + `buildFixedExpensesFormula_(periodCellRef)` for dashboard reuse
- New `buildBudgetDashboard_(budget)` helper — writes rows 1-6 with formulas, dropdown data validation, conditional formatting on Ready to Assign, sets frozen rows = 7
- `rebuildBudgetInternal_`: removed `_income` row generation, all data writes start at row 8 instead of row 2, recreates slicer at row 7+ range
- `updateWorkbook`: removed `_income` branch, calls `buildBudgetDashboard_` to refresh dashboard
- `setNamedRanges_`: Budget_* ranges shifted from `*2:*500` to `*8:*500` (skip dashboard + header)
- `buildWorkbook`: Budget header moved from A1:F1 to A7:F7

### Bug found and fixed during deploy
**Slicer broken after Initialize Budget** — "no values show up when filtering for period". Root cause: `insertSlicer()` programmatically creates a slicer with NO column filter set. User clicking the slicer would see no filter options work properly.

Fix: explicitly call `newSlicer.setColumnPosition(1)` after `insertSlicer()`. This sets the slicer to filter by column 1 of the data range (Period column).

Two deploys: @16 (initial v10.5) + @17 (slicer fix).

### Verification (after Initialize Budget x2)
- Dashboard rows 1-6 populated with formulas ✓
- B1 dropdown defaults to "Apr 15 - 28" — when changed, all metrics recalculate ✓
- Net Income = $2,795, Fixed Exp = $0 (Apr 15-28 doesn't contain 1st), Total Budgeted = $1,850, RtA = $945 (yellow — under-allocated) ✓
- Period progress: "Day 5 of 14 (36% elapsed)" — TODAY is Apr 19, period started Apr 15 ✓
- Header at row 7, data at row 8+, no `_income` rows anywhere ✓
- Apr 15-28 Budgeted values preserved through rebuild: Groceries $300, Gas $100, Parking $100, House things $350, Saajidah $200, Fahyad $200, Small trip $300, Eating out $300 ✓
- Slicer filters by Period correctly after re-Initialize ✓

### Decisions explicitly NOT taken (user choice)
- ❌ YNAB-style negative-carry rollover rule — kept current behavior
- ❌ Category Transfers ledger
- ❌ Sinking fund / Goals columns
- ❌ AutoCat rules (deferred to Phase 14)
- ❌ Sparkline progress bars per category row

### Status
- v10.5 deployed @17 — Budget tab restructured
- All Budgeted values preserved
- Slicer working with explicit setColumnPosition(1)

## Session: 2026-04-19 (cont.) — v11.0 single-ledger redesign

### Goal
User reported "appscript not moving categorized transactions" — investigation showed actually no recent batchCategorize calls in Logs (the 8 "categorized" Pending rows were old orphans from v8 still sitting at Transactions row 1001-1008). User asked whether a redesign would be better than just fixing the bug.

### Decision (after discussion)
Single-ledger redesign (the ZBB report's "Pattern A"):
- Eliminate Pending tab entirely
- Transactions becomes the single source of truth
- Empty Category cell = "needs categorization"
- Categorize updates an existing row's Category cell — no copy/move
- PWA contract preserved (same API signatures), so PWA code unchanged

### Implementation
- New Transactions structure: 8 cols (added H = Timestamp for PWA dedup)
- Refactored 5 handlers: processInfoAlerts_, handleParseAndFetch_, handleBatchCategorize_, handleCategorize_, handleUncategorize_
- All "find row by Pending status" logic replaced with "find row by Timestamp where Category empty"
- Net: ~60 lines of Apps Script removed
- Added new named range Transactions_Timestamp = H2:H1000
- buildWorkbook no longer creates Pending tab
- updateWorkbook adds Timestamp column header if missing (idempotent)
- New `migratePendingToTransactions()` one-shot function — moves Pending data to Transactions, archives Pending tab, then deletes it

### Bug found and fixed during migration
Initial migration (v11.0) had an order-of-operations bug: appended new pending rows to Transactions FIRST (which went past row 1000 since orphans were still at 1001-1008), then ran orphan cleanup which then tried to "move" both the original orphans AND the newly-appended rows up — but they all ended up at rows 1039-1076 (past the named ranges).

Fix: added `consolidateTransactions()` rescue function — reads all rows where Merchant is set, clears the data area (cols A:D, F, H — preserving formulas in E, G), writes the data back starting at row 2.

### Final state (v11.1)
- 39 rows of data at Transactions rows 2-40 ✓
- R2 = manual paycheck (no Timestamp)
- R3-R10 = 8 categorized (formerly orphans at 1001-1008)
- R11-R40 = 30 uncategorized (waiting for PWA categorization)
- Rows 1000+ all empty
- Pending tab gone (archived at `Pending_Archive_20260419_120817`)
- Migration menu items removed (one-shot job complete)

### Deploys this session
- @18: v11.0 initial single-ledger
- @19: v11.0.1 added Consolidate Transactions rescue
- @20: (force-push artifact)
- @21: v11.1 removed migration menu items

### Status
- v11.1 deployed and verified
- All transaction data consolidated and visible
- PWA unchanged — same API contract, will work as before
- Budget tab Apr 1-14 will now reflect $439 of previously-invisible categorized spending

## Session: 2026-04-19 (cont.) — v11.2 fix updateWorkbook clobbering dashboard

### Bug
After deploying v11.1 single-ledger redesign, user ran Update Script and saw `#N/A`-style errors in cells F3 and F7:
- "Did not find value 'Net Income' in MATCH evaluation" (F3)
- "Did not find value 'Period' in MATCH evaluation" (F7)

### Root cause
`updateWorkbook`'s formula refresh loop iterated rows 2 to lastRow and only skipped rows where col C was empty or `_income`. But the dashboard rows (3 = labels, 4 = values) and header row (7) had non-empty content in col C ("Total Budgeted" in C3, "Category" in C7), so the loop entered them and overwrote the dashboard cells with the Available SUMIFS formula. That formula references `MATCH(A_row, PayPeriods_Label, 0)` — A3 = "Net Income" and A7 = "Period" — both fail MATCH → #N/A.

The earlier (Phase 13c) Budget redesign added the dashboard at rows 1-6 + header at row 7 with data starting at row 8, but the updateWorkbook formula refresh loop wasn't updated to match the new layout boundaries.

### Fix (v11.2)
1. Pre-load `PayPeriods_Label` into a Set
2. Skip any row where col A is NOT a valid period label
3. Defensively rewrite header row 7 each Update Script (so any old corruption is fixed)
4. Defensively clear stray formulas in row 7 cols B/E/F before re-writing labels

This ensures only real data rows (rows 8+ where col A is "Dec 25 - Jan 20" etc.) get formula refresh.

### Verification
- F3 = "READY TO ASSIGN" (label) ✓
- F4 = -$1,948.00 (correct computed value for Dec 25 period — fixed expenses minus zero paycheck)
- F7 = "Available" (header) ✓
- B7 = "Main Category" (header) ✓
- All 39 transaction rows still in correct positions

### Lesson
**When you change a tab's row layout, audit ALL functions that iterate the tab.** updateWorkbook and rebuildBudgetInternal_ both iterate Budget rows but only one was updated for the new layout. Pre-loading valid period labels into a Set is a more robust filter than checking col C — it correctly identifies "this is a data row" regardless of what's in C.

### Status
- v11.2 deployed @22
- Errors gone; dashboard, header, and data rows all correct

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Code.gs v11.1 (single-ledger architecture — Pending tab eliminated; Transactions has 8 cols including new Timestamp at H; categorize updates Category cell in place; ~60 lines of Apps Script removed). PWA v0.9 unchanged. |
| Where am I going? | User tests PWA flow end-to-end (Refresh → categorize → Sync). If working, the deferred cleanup items become non-blockers (orphans already gone). Future: Phase 14 auto-categorization, Goals/Transfers/Sparklines from ZBB report still available but deferred. |
| What's the goal? | Budget sheet + mobile transaction categorizer system |
| What have I learned? | 16 Code.gs iterations. **NEW:** When designing migrations, BACKWARDS CHRONOLOGY — clean up legacy data BEFORE adding new data. My first migration (v11.0) put orphan cleanup AFTER pending append, which made the cleanup target the new rows too. Required a v11.0.1 rescue function. Lesson: write a "consolidate" / "compact" function as a generic rescue tool — it's a useful primitive even outside migration scenarios. |
| What have I done? | Single-ledger redesign (v11.0 → v11.2): Pending tab eliminated, Transactions is source of truth with new Timestamp col H. 5 handlers refactored. ~60 lines of Apps Script removed. Migration moved 30 pending + 8 categorized + 8 orphan rows to Transactions; Pending archived + deleted. v11.0.1 added consolidateTransactions rescue (migration order-of-ops bug). v11.1 removed migration menu items. v11.2 fixed updateWorkbook clobbering dashboard/header (Budget redesign hadn't audited the formula-refresh loop's row boundary check). |
