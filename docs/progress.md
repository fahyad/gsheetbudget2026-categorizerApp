# Progress Log

> ## 📍 Current State (read this first)
>
> **Apps Script:** v11.11 — at `apps-script/Code.js`, deployed via `cd apps-script && ./deploy.sh "..."`. NEVER use plain `clasp deploy` (creates a new URL, breaks PWA).
>
> **PWA:** v0.11 (cache v14) — at `index.html`, `js/`, `css/`, `sw.js`. Auto-deployed via GitHub Pages on `git push`. New `js/periods.js` powers the period filter dropdown (Phase 5).
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

## Session: 2026-04-19 — Integrated Code Review (4 phases, v11.3 → v11.6 + PWA v0.10)

### Setup
After the v11.2 dashboard fix, we ran three independent code reviews of the entire system:
1. **My own review** — 13 findings via 3 parallel Explore agents (Apps Script correctness, PWA contract, data integrity)
2. **External Review #1** — focused review of v11.x changes (PR-style diff review)
3. **External Review #2** — comprehensive review of full project (18 files, 23 commits)

The three reviews were merged into a single 26-item plan grouped by severity (Tier S/A/B/C) and themed by phase. Pre-flight review caught 1 false positive (A1 — `handleBatchCategorize_` was claimed to have a perf regression but the v11.0 code already reads timestamps once outside the loop) and 1 partial misread (A2 — rollback IS comprehensive in current code, but the verify reads were N individual calls; batched them into 1).

### Phase 1 (v11.3) — security + active data loss
- **S1 leaked API key.** The 40-char production API key was committed in plaintext to `CLAUDE.md` (line 61) and `docs/progress.md` (line 313). Repo is public on GitHub Pages. Scrubbed from current files; rotated server-side; added `.git/hooks/pre-commit` that blocks future commits matching the pattern (verified working). Old key remains in git history — rotation is the actual fix, history-rewrite would be theater.
- **S2 stale service worker cache.** `sw.js CACHE_VERSION` was stuck at `'v9'` across multiple PWA-affecting releases. Returning users were running stale code indefinitely. Bumped to `'v10'`. Established practice: bump on every PWA release.
- **S3 timestamp collisions.** Email parser used `YYYY-MM-DD HH:MM:SS` (one-second resolution). Two charges in the same second would have identical timestamps; PWA's `addToSyncQueue` removes by timestamp before push, so the second one would silently overwrite the first. Added a 4-char MD5 suffix derived from `merchant|amount`, with in-batch collision counter (`-1`, `-2`). New format: `YYYY-MM-DD HH:MM:SS#<hex>`. Backward compatible — old rows still match by string equality.
- **S4 trigger race.** `processInfoAlerts_` had no LockService. Gmail trigger could fire while user hit Sync from PWA → both writers call `findNextEmptyRow_`, both pick the same row, one silently clobbers the other. Wrapped in `LockService.getScriptLock(20000)`. Lock failure logs and skips run; emails retry on next trigger.

### Phase 2 (v11.4) — correctness gaps
- **A3 PWA `res.ok` check.** `api.js` was calling `res.json()` without checking HTTP status. Apps Script returns HTML error pages on 500s; `res.json()` on HTML throws "Unexpected token <" with no clue the server actually 500'd. Now throws `HTTP <status> <statusText>`.
- **A4 sync/undo race.** User taps Sync (1-3s in flight), then taps Undo on an already-categorized item. Undo removed it from local syncQueue, but the backend write had already landed. Result: row stayed categorized in the spreadsheet, but PWA thought it was undone. Added `syncInFlight` module flag; Undo refuses with "Wait for sync to finish before undoing" message; Undo button visually disabled during sync.
- **A6 refresh debounce.** Triple-tapping Refresh fired `parseAndFetch` 3x (each triggers a Gmail scan on backend). Added `refreshInFlight` flag + button disable during fetch. Same pattern as A4.
- **A8 silent uncategorize success.** `handleUncategorize_` returned `success: true` whether or not it found a matching row. PWA would treat empty-sheet or no-match as success and remove the item from syncQueue. Now returns `{success: false, error: 'Row not found for timestamp: ...'}` on no-match.
- **A9 localStorage quota.** Every `setItem` was unwrapped — quota exceeded would crash the app. Wrapped in `safeSetItem_` helper that detects QuotaExceededError across browsers (name, code, legacy code). Categories cache failures are silent (will refetch). SyncQueue failures attempt one recovery (drop categories cache, retry) before setting `store.persistFailed = true` and console.erroring loudly.

### Phase 3 (v11.5) — correctness polish
- **A2 batched verify-read.** `handleBatchCategorize_` was doing N individual `getValue` calls during verification. Replaced with one `getValues` over min..max row span. ~30x fewer sheet reads on a 30-item batch. Writes still individual (rows non-contiguous; `setValues` doesn't help).
- **A5 add-category capacity error.** Loop in `handleAddCategoryInner_` could advance `nextRow` to 101 if all 99 slots were full, then silently write outside the `CategoryMain` named range. Now returns explicit "Categories tab full" error.
- **A7 strict validation.** `setAllowInvalid(true)` in buildWorkbook vs `false` in updateWorkbook → behavior depended on which path created the validation. Both now `false`. Misleading "allow empty" comment removed (empty cells are always allowed regardless of this flag).
- **B1 row-1000 ceiling.** `findNextEmptyRow_` would silently return 1001+ if data crept past the named-range ceiling — exactly the bug class that produced the v8 orphan rows. Now throws a descriptive error with the sheet name and row number. Optional `maxRow` arg lets callers override.
- **B3 scoped named-range removal.** `setNamedRanges_` previously deleted EVERY named range on the spreadsheet before re-creating ours. Any user-defined named range would be wiped on every Update Script run. Now scoped to known prefixes (`PayPeriods`, `CategoryList`, `CategoryMain`, `FixedExpenses_`, `Budget_`, `Transactions_`).
- **B4 beforeunload prompt.** Chrome (and modern Firefox/Safari) require BOTH `e.preventDefault()` AND assigning a string to `e.returnValue` for the unsaved-changes prompt to actually fire. We had only the first. Added `e.returnValue = ''`.

### Phase 4 (v11.6) — polish
- **B2 rescue rename.** `consolidateTransactions` → `consolidateTransactionsRescue` with stronger DESTRUCTIVE warning in docstring. Function isn't in the menu (already wasn't); only callable from the editor.
- **B5 PWA version unification.** Removed the hardcoded `v0.9` from `index.html` header span. `app.js` now sets it from the `APP_VERSION` constant in `config.js` at boot. Two final sources of truth: `APP_VERSION` (semantic) and `CACHE_VERSION` (cache invalidation marker) — conceptually different, kept independent.
- **B7 success toast.** Sync success was using `showError()` (red styling). Added `showSuccess()` helper using a `.success` class on the same `#error-toast` element (green via `background: #2e7d32`).
- **B8 portable sed.** `deploy.sh` used BSD-only `sed -i ''`. Replaced with `sed -i.bak ... && rm -f file.bak` which works on both BSD (macOS) and GNU (Linux).
- **B9 BUDGET_YEAR constant.** `buildFixedExpensesFormula_` had `2026` hardcoded in 13 month checks. Now sourced from `BUDGET_YEAR` constant at top of Code.js. Annual rollover: bump constant + update `PayPeriods` array (still hardcoded — out of scope for this pass).
- **B10 buildAvailableFormula_.** The Available formula `=IF(MATCH>1, ..., 0)+D-E` was duplicated in `rebuildBudgetInternal_` (full rebuild) and updateWorkbook's formula-refresh loop. Extracted to a single helper.
- **C1 Pending references.** Scrubbed surviving Pending references in user-visible places (Instructions tab content, updateWorkbook alert, processInfoAlerts report, findNextEmptyRow_ comment, CLAUDE.md "trip you up" item 6). Historical references in docstrings and migration code kept (they're correct context).
- **C2 dead code.** Reviewed `handleBatchCategorize_` end-to-end. False positive — no v10-era leftover; v11.0 rewrite is clean.
- **C3 log rotation.** Reviewed rotation logic at `rotateLogsIfNeeded_`. Threshold 5001 rows; copyTo + clearContent pattern is sound. Manual stress test skipped (would require populating 5000+ rows just to confirm working logic).

### Lessons from running 3 reviews
- 14 of 26 findings (54%) came from the external reviews — meaningful incremental coverage.
- External reviews are best at: cross-system integration concerns (race conditions, cache invalidation, leaked secrets), things that require breadth.
- My own review was best at: data-shape invariants (timestamp collisions, quota, hardcoded literals).
- The single-pass merge into a tier-ranked plan with phase grouping was high-leverage. Doing the same again on future PRs would be cheap and catch a similar percentage of issues.

### Status
- v11.3 deployed @23, v11.4 @24, v11.5 @25, v11.6 @26
- PWA cache: v9 → v10 → v11 → v12 → v13 across phases
- Commits: `bce9f2b`, `6f872eb`, `12eab16`, `68b43ad`
- All 4 phases live in production; pushed to GitHub main

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Code.js v11.6 (4 phases of integrated-review work on top of v11.0 single-ledger architecture). PWA v0.10 with cache v13. All 26 review items addressed except 2 confirmed false positives (C2, partially A1) and 1 manual test deferred (C3 log rotation stress). |
| Where am I going? | System is stable and well-reviewed. Open paths: (a) Phase 15 auto-categorization — merchant→category mapping; (b) Phase 16 deferred audit — 5 of 8 items still open (income formula simplification, retry logic, rebuildBudgetInternal_ silent clear, etc.); (c) ZBB report deferred features (Goals, Transfers, Sparklines). User chooses. |
| What's the goal? | Budget sheet + mobile transaction categorizer system, with code quality high enough to be confidently maintained. |
| What have I learned? | Multi-source code review with merged tier-ranked plan is high-leverage. External reviews catch breadth issues my deep-dive misses, and vice versa. **Don't trust review claims without verifying against current code** — A1's "perf regression" was a false positive because the reviewer misread the loop structure. **Bump cache version on every PWA release** — the 4-release stale-cache window meant returning users had been running outdated code. **Loud-fail beats silent corruption** — every "this should never happen" branch should throw with a descriptive error, not silently no-op. |
| What have I done? | 4-phase integrated review: 16 commits, 4 deploys (v11.3-v11.6), 4 PWA cache bumps. Touched ~7 files across Apps Script + PWA + ops. Closed 23 of 26 review items (3 = false positives or non-actionable). Established LockService-everywhere pattern, unique-suffix Timestamps, loud-fail row-1000 ceiling, scoped named-range management, single APP_VERSION source for PWA. Rotated leaked API key + added pre-commit guard. |

## Session: 2026-04-19 (later) — PWA Period Filter (v0.11)

### Setup
User wants to scope the uncategorized list to a single pay period. Use case: "I fell behind on April 1-14 categorization, but Apr 15 starts soon and I want to keep current. Let me hit the new period first; circle back to the old stuff later."

User explicitly preferred a PWA-only solution: "may be worth just editing the PWA code and not adding more complexity to the appscript."

### Design analysis (3 options weighed)
1. **Backend-driven filter (period param on parseAndFetch)** — backend complexity grows; needs period list endpoint; unnecessary network filtering for ~50-item lists.
2. **PWA-only with backend period source** — one extra round-trip on PWA load to fetch period definitions.
3. **Pure PWA — derive periods from a constant anchor** — zero backend changes, zero new round-trips, periods are deterministic so client-side computation is trivial.

Picked option 3. Periods are bi-weekly anchored at a known start date — pure arithmetic, no data to fetch.

### Period derivation cleverness
Naive approach: enumerate all 26 periods in an array. Mirror data between PWA and Code.js, ~30 lines.

Better approach: one anchor + one special case. After re-reading Code.js's `payDateArrays` and the period-build loop:
- Period 0: Dec 25, 2025 - Jan 20, 2026 (special long start, 27 days)
- Periods 1-25: bi-weekly cycle from Jan 21, 2026 (14 days each)

So just `PERIOD_REGULAR_ANCHOR_MS = Date.UTC(2026, 0, 21)` + `PERIOD_0` constants → can compute any period from any date with `floor((ts - anchor) / 14d)` for the regular case. ~30 lines including helpers + label formatter. Annual rollover touches 2 constants instead of 26 array entries.

### Implementation
- **`js/periods.js` (new, 90 lines):** `periodForDate(date)`, `currentPeriod()`, `periodForTimestamp(ts)` (slices first 10 chars for locale-independent date parsing), `formatLabel(start, end)` (matches the Sheet's "MMM D - D" / "MMM D - MMM D" label format).
- **`index.html`:** new `<div id="period-filter-bar">` with dropdown + label, plus `<div id="period-empty-state">` for the (defensive) "no txns in this period" case.
- **`css/style.css`:** filter bar styling (gray background, single-row layout, 14px text), period-empty-state styling.
- **`js/app.js`:**
  - Module state `selectedPeriodFilter` (null = use default, 'all', or numeric idx)
  - `populatePeriodFilter()` rebuilds dropdown options from current txn set; periods sorted newest first; current period suffixed with "current"; counts inline; default selection rule: keep user's choice if still valid → current period if it has txns → 'all'
  - `filterTxnsByPeriod(txns)` filters by current selection
  - `renderTransactions()` calls populatePeriodFilter then filters before rendering
  - Change handler in `bindEvents()` updates state + re-renders
- **`sw.js`:** cache v13 → v14, added `js/periods.js` to APP_SHELL.
- **`js/config.js`:** APP_VERSION v0.10 → v0.11.

### Sanity testing
Wrote a 13-case unit test as a one-off node script — covered: first/last days of period 0, 1, 7, 24, 25; cross-month boundaries; out-of-budget dates (before Dec 25, 2025 and after Jan 5, 2027); hash-suffixed timestamps. All 13 passed. Today (Apr 19, 2026) correctly resolved to period 7 = "Apr 15 - 28" — exactly what the user expects.

### Status
- PWA v0.11 deployed via GitHub Pages on `git push` (commit `ab3bf7f`)
- No Apps Script changes
- One new file: `js/periods.js`

## Session: 2026-04-19 (later 2) — Gas Rollover Investigation + Slicer Crash Fix (v11.7)

### Setup
User reported two bugs from a PWA categorization session:
1. **Bigger:** Budget tab row 72 (Apr 15-28 / Gas) showing -$280 Available with $100 budgeted, $40 spent. Flagged as "the second miscalculation" — user wanted formula tightening or full redesign.
2. **Smaller:** PWA `addCategory` crashed when adding "Dates" category.

User explicitly framed this as a bigger pattern: "we need to tighten up the formulas or think of a re-design that is simpler and less buggy."

### Investigation flow
- Used `dumpSheet` to inspect Budget rows 65-80 with both values and formulas, plus Setup categories and Logs tab.
- Traced Gas across all periods (rows 9, 18, 27, 36, 45, 54, 63, 72, 81). Apr 1-14 had $0 budgeted but $340 spent (Apr 1 ESSO $40 + **Apr 7 SHELL $250** + Apr 7 ESSO $30 + Apr 10 PETRO $20). The -$340 carryover from Apr 1-14 + Apr 15-28's ($100 - $40) = -$280. **Math is correct.** The Available column is a cumulative rollover; not a per-period figure.
- Logs showed the addCategory crash trace: `TypeError: newSlicer.setColumnPosition is not a function at rebuildBudgetInternal_ (Code:2546:13)`. Apps Script Slicer API change — Google deprecated/removed the method.

### Discussion outcome
Presented four budget redesign options (independent periods / positive-only rollover / current full rollover / two-column display) plus the meta-option of moving calculations to Apps Script values. User decided to **leave the formula as-is** ("still works, even though brittle"). The SHELL $250 was an erroneous charge — user manually uncategorized it, which heals the chain.

Documented the non-bug in `findings.md` so future-Claude doesn't re-investigate. Added a `> ⚠️` callout in CLAUDE.md "Things that will trip you up" so the rollover semantics are visible up-front.

### Slicer fix (v11.7) — implementation
Refactored the slicer block in `rebuildBudgetInternal_`:

```js
try {
  var slicerRange = budget.getRange(7, 1, totalRows + 1, 6);
  var existingSlicers = budget.getSlicers();

  if (existingSlicers.length > 0) {
    // PREFERRED PATH: update existing slicer's range. Preserves the
    // filter column from initial creation. No setColumnPosition call.
    existingSlicers[0].setRange(slicerRange);
    for (var sx = 1; sx < existingSlicers.length; sx++) existingSlicers[sx].remove();
  } else {
    // FALLBACK: no slicer exists, create one. Guard setColumnPosition
    // because Google has changed the API and it may not exist.
    var newSlicer = budget.insertSlicer(slicerRange, 1, 8);
    try {
      if (typeof newSlicer.setColumnPosition === 'function') {
        newSlicer.setColumnPosition(1);
      } else {
        console.warn('Slicer.setColumnPosition unavailable; ...');
      }
    } catch (slicerColErr) { /* logged, non-fatal */ }
  }
} catch (slicerErr) {
  // TOP-LEVEL: slicer is a UI widget. Its failure must not crash the
  // parent operation (addCategory was failing because of this).
  console.warn('Slicer rebuild skipped (non-fatal):', slicerErr.toString());
}
```

User impact: addCategory works again. The user's existing slicer is in the broken-no-column state from the prior crash — one-time manual fix needed (right-click slicer → Set Column → Period). Future addCategory calls only resize the existing slicer, so the manual fix sticks.

### Lessons
- **UI-widget code paths should never crash data operations.** Slicer manipulation, formatting calls, named-range tweaks — all decoration. Wrap in try/catch with non-fatal logging. The data write should always succeed.
- **Google's API contract isn't stable for newer features like Slicer.** Defensive `typeof` guards before calling potentially-missing methods is cheap insurance.
- **Before assuming "miscalculation": trace the rollover chain.** Available column is cumulative; a negative value usually points to a real prior overspend, not a formula bug. Documented in CLAUDE.md so future-Claude (or future-me) doesn't re-investigate.
- **Some "bugs" are data bugs, not code bugs.** The Gas issue was triggered entirely by the SHELL $250 erroneous charge. No code change needed — user fixed the data and the formulas resolved themselves.

### Status
- v11.7 deployed @27 (commit `90d7bf0`)
- Budget formula model unchanged (deferred per user)
- Slicer crash fix landed; user needs one-time manual slicer column setup

## Session: 2026-04-19 (later 3) — Saving Tab for One-Time Goals (v11.8)

### Setup
User wanted to track one-time savings goals (e.g., "Europe trip $5,000 by Oct 2026") with auto-computed per-period contribution targets. Originally surfaced earlier this same day but tabled when the Budget miscalculation/Slicer issues took priority. Resumed after those landed.

### Design recap (questions + answers)
1. **Goal/category mapping?** → 1:1 (one Setup category per goal).
2. **After goal achieved?** → Manual archive (just stop budgeting; row stays).
3. **"Currently Saved" period reference?** → Period containing today (TODAY()-driven).
4. **On-track formula?** → Pace-based: `target × (current_idx / target_idx)`; thresholds at 100% (green) and 80% (yellow).
5. **Dashboard?** → Yes — total per-period need, currently saved, target.

### Key insight: no new data model needed
The Available column on Budget already accumulates over time when nothing is spent against a category. That IS savings progress — same machinery, different temporal pattern (regular categories oscillate near zero, savings categories grow). Saving tab is purely a goal-tracking layer that pulls from existing Budget data.

This avoids:
- New named ranges
- Changes to the categorize/sync pipeline
- PWA changes
- Apps Script handler changes (no new API endpoints)

### Implementation
Two helpers added in Code.js:
- `buildSavingTab_(saving, ss)` — destructive full build. Sets column widths, calls applySavingStructure_, freezes 5 rows.
- `refreshSavingTab_(saving, ss)` — non-destructive refresh. Preserves user data in cols A,B,C,D,I; rewrites only structural pieces. Used by Update Script.
- `applySavingStructure_(saving, ss)` — shared. Rebuilds title bar, dashboard formulas, header row, computed-column formulas, validations, conditional formatting.

Wired into:
- `buildWorkbook` tabNames list (now 6 tabs: Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Saving)
- `buildWorkbook` calls `buildSavingTab_(sheets['Saving'], ss)` after other tab builds; alert message updated to mention "6 tabs created"
- `updateWorkbook` checks `ss.getSheetByName('Saving')`; calls `buildSavingTab_` if missing, `refreshSavingTab_` if exists
- Instructions tab: TABS list updated (added Saving line), new "SAVING GOALS (one-time purchases)" section explains the workflow

### Tab structure
```
Row 1: SAVING GOALS — 2026 BUDGET YEAR  (merged title bar)
Row 2: Today | Current Period | Total Goals | Per-Period Need | Currently Saved | Target Total
Row 3: <date> | <XLOOKUP curr period> | =COUNTA | =SUM(G) | =SUM(E) | =SUM(C)
Row 4: separator
Row 5: Goal Name | Linked Category | Target | Target Period | Currently Saved | Periods Left | Per-Period Need | On Track? | Notes
Row 6+: user-entered goals (up to 100)
```

The B3 cell holds the "current period" XLOOKUP that all per-row formulas reference — it's the linchpin.

### Per-row formulas
- E (Currently Saved): `=IF(B="","",IFERROR(SUMIFS(Budget_Available,Budget_Category,B,Budget_Period,$B$3),0))`
- F (Periods Remaining): `=IF(D="","",MATCH(D,PayPeriods_Label,0)-MATCH($B$3,PayPeriods_Label,0))` — negative means overdue
- G (Per-Period Need): `=IF(any-blank,"",IF(F<=0,0,MAX(0,(C-E)/F)))`
- H (On Track?): IFS chain — DONE / OVERDUE / JUST STARTING / ON PACE / CLOSE / BEHIND, with conditional formatting on each text value

### User next steps
1. **Open the budget sheet → Budget Tools → 3. Update Script (safe).** This creates the Saving tab automatically since it doesn't exist yet.
2. Add a savings sub-category via PWA: e.g., Add Category → Main: "Savings", Sub: "Europe trip". This makes "Europe trip" available in the Saving tab's Linked Category dropdown AND adds Budget rows for it.
3. Open Saving tab, fill row 6: Goal Name="Europe trip", Linked Category="Europe trip", Target=5000, Target Period="Oct 14 - 27", Notes="Flights + hotel".
4. Computed columns (E-H) auto-fill. Status color shows pace.
5. Each pay period, set Budget tab Budgeted column for that category to the Per-Period Need shown. Available accumulates until you spend.

### Lessons
- **The cleanest features build on existing infrastructure.** Saving goals could've been a brand-new data model with its own pipeline; instead it reuses Budget's Available column. Result: ~290 lines of new code, all in the sheet-building path, zero changes to the data flow.
- **Dashboard formulas via XLOOKUP elegantly handle "what's the current period?"** without needing to enumerate or hardcode anything. Single helper cell ($B$3) referenced by all per-row formulas keeps the chain auditable.
- **Conditional formatting via Apps Script is verbose but worth it.** Six status values × six rules = 30 lines, but the user gets immediate visual feedback on goal pace without manual color-management.

### Status
- v11.8 deployed @28 (commit `5b00dc0`)
- User needs to run Update Script to create the Saving tab in their existing sheet
- No PWA changes; no API contract changes

## Session: 2026-04-20 — Saving Tab Bring-Up Bugs (v11.9 + v11.10)

### Setup
User ran Budget Tools → Update Script to create the Saving tab from v11.8 deploy. Tab was created successfully (dimensions correct, light-blue color, title bar present, headers right). But **every formula on the tab was broken**. This session covers both bugs found during bring-up and their fixes.

### Bug 1: `#REF!` everywhere (v11.8 → v11.9)

- **Symptom:** `dumpSheet(Saving, A1:I7, includeFormulas=true)` showed literal `#REF!` replacing every named-range reference:
  ```
  Row 3 B3: =IFERROR(XLOOKUP(1,(#REF!<=TODAY())*(#REF!>=TODAY()),#REF!),"(out of range)")
  Row 6 E6: =IF(B6="","",IFERROR(SUMIFS(#REF!,#REF!,B6,#REF!,$B$3),0))
  ```
  `PayPeriods_Start`, `PayPeriods_End`, `PayPeriods_Label`, `Budget_Available`, `Budget_Category`, `Budget_Period` — all replaced with `#REF!`.

- **Diagnosis:** the Saving tab block in `updateWorkbook` ran BEFORE `setNamedRanges_`:
  ```
  updateWorkbook (v11.8 order — BUG):
    1. cleanup whitespace
    2. add Timestamp col if missing
    3. build/refresh Saving tab   ← setFormula with PayPeriods_*, Budget_*
    4. update Instructions
    5. update Transactions formulas
    6. update data validation
    7. setNamedRanges_             ← deletes-and-recreates owned ranges
    8. refresh Budget dashboard
  ```
  At step 3, the named ranges existed (from prior runs) so `setFormula` stored the formulas with valid refs. At step 7, `setNamedRanges_` removed each owned-prefix named range and immediately recreated it. **Sheets converts every formula referencing a being-deleted named range to a `#REF!` literal — and that conversion is one-way.** Recreating the same name with the same definition does not heal those broken formulas.

  `buildWorkbook` was unaffected because there `setNamedRanges_` runs first and Saving builds last.

- **Fix (v11.9):** moved the Saving tab block in `updateWorkbook` to immediately AFTER `setNamedRanges_`. Added a defensive comment at the moved location:
  ```js
  // ⚠️ MUST come AFTER setNamedRanges_. The Saving tab's formulas reference
  // PayPeriods_*, Budget_*, etc. setNamedRanges_ deletes-and-recreates those
  // names; Sheets converts any formula referencing a being-deleted named range
  // to #REF! and DOES NOT heal it when the same name is recreated. Bug found
  // in v11.8 first deploy; fix landed in v11.9.
  ```

### Bug 2: B3 returns "(out of range)" even when today is inside a period (v11.9 → v11.10)

- **Symptom:** user ran Update Script again (to pick up v11.9 fix). Formulas now had correct named-range references. But B3 (Current Period dashboard cell) still showed `(out of range)` even though today was Apr 20, 2026 — clearly inside period 7 ("Apr 15 - 28"). User reported "per period need has an error":
  ```
  Row 3: ['Apr 20, 2026', '(out of range)', '1', '#DIV/0!', '$0.00', '$4,000.00', ...]
  Row 6 (Europe trip goal, $4000 target, Dec 23 - Jan 5):
         [..., 'Dec 23 - Jan 5', '$0.00', '', '#DIV/0!', 'JUST STARTING', ...]
  ```

- **Diagnosis (cascade from a single broken cell):**
  - B3 returned `(out of range)` string
  - F6 `=MATCH($B$3, PayPeriods_Label, 0) - MATCH(D6, PayPeriods_Label, 0)` → `#N/A - N` → `#N/A` → IFERROR caught → `""`
  - G6 `=IF(F6<=0, 0, MAX(0, (C6-E6)/F6))` → `(4000-0)/""` → **`#DIV/0!`** (user-visible)
  - H6 evaluated `MATCH($B$3, ...)` → `#N/A` → IFERROR caught in IFS branch → 0 → 0 ≤ 0.04 → returned `JUST STARTING` (misleadingly green for $0 saved)

- **Root cause:** B3's original formula used
  ```
  XLOOKUP(1, (PayPeriods_Start<=TODAY())*(PayPeriods_End>=TODAY()), PayPeriods_Label)
  ```
  Relies on Google Sheets to auto-broadcast the element-wise multiplication of two boolean arrays as XLOOKUP's lookup vector. In practice Sheets does NOT reliably treat that multiplied expression as a lookup vector — XLOOKUP returned no-match and IFERROR returned the fallback string.

- **Fix (v11.10):** swapped to INDEX+MATCH with `match_type=1`:
  ```
  =IFERROR(
    IF(TODAY()>INDEX(PayPeriods_End, ROWS(PayPeriods_End)), "(out of range)",
       INDEX(PayPeriods_Label, MATCH(TODAY(), PayPeriods_Start, 1))),
    "(out of range)")
  ```
  Since `PayPeriods_Start` is ascending-sorted by design, `MATCH(TODAY(), PayPeriods_Start, 1)` finds the largest start date ≤ today — that's exactly the current period's row. IFERROR catches "today is earlier than all periods". The outer IF catches "today is later than period 25's end". Reliable and portable.

  Also added defense-in-depth IFERROR on the G (Per-Period Need) formula, so any future malformed F never produces `#DIV/0!`:
  ```
  =IF(OR(B="",C="",D=""), "", IFERROR(IF(F<=0, 0, MAX(0, (C-E)/F)), ""))
  ```

### Lessons
- **Named-range deletion is destructive to referencing formulas — even if the same name is recreated immediately after.** New code that sets formulas referencing named ranges MUST run AFTER `setNamedRanges_` in `updateWorkbook`. Now an ordering invariant. Added to CLAUDE.md trip-up #10.
- **XLOOKUP in Sheets is unreliable with multiplied-boolean lookup vectors.** Not an obvious failure mode — the formula parses and executes without throwing, just returns no-match. Prefer `INDEX(labelRange, MATCH(target, sortedKeyRange, 1))` for the "find the row whose range contains the target" pattern when the key range is ascending-sorted. Added to CLAUDE.md trip-up #11.
- **`dumpSheet?...&includeFormulas=true` is the verification tool of choice for sheet-building changes.** Values can look fine when formulas are broken (here: `$0.00` from IFERROR swallowing errors). Always diff the formula cells against intended syntax right after a Build/Update Script run.
- **One broken cell can cascade into many user-visible errors.** B3 is the shared helper cell for the entire Saving tab. When it returned an invalid string, F/G/H all produced downstream errors. Defense-in-depth IFERROR on leaf formulas limits the blast radius.

### Status
- v11.9 deployed @29 (commit `58d3312`) — #REF! ordering fix
- v11.10 deployed @30 (commit `dbb010d`) — B3 XLOOKUP replacement + G IFERROR defense
- User needs to run Update Script ONE MORE TIME to overwrite broken formulas in their existing Saving tab with v11.10 versions
- Budget model formulas unchanged (still brittle — user explicitly deferred redesign)

## Session: 2026-04-20 (later) — Saving Schema Refactor (v11.11)

### Setup
User ran v11.10 Update Script and verified the core formulas worked (B3 resolved to "Apr 15 - 28" correctly). They then budgeted exactly the suggested $222.22 for the current period's Europe trip category. Came back to the Saving tab and the Per-Period Need showed **$209.88** instead of staying at $222.22.

User's feedback was two-pronged:
1. "On Track?" column (text with DONE/ON PACE/CLOSE/BEHIND/OVERDUE coloring) doesn't provide information beyond the numeric columns. Remove it.
2. The Per-Period Need drift is confusing — they expected "if I budgetted the correct amount this calculation should stay the same."

Proposed schema change: remove On Track?, add "Allocated This Period" (visible current-period budgeting), rename "Per-Period Need" → "Needed Future Periods" (adaptive based on current allocation).

### Diagnosis of the $222 → $209 drift
- Target: $4000, Target Period: Dec 23-Jan 5 (pos 26)
- Current Period: Apr 15-28 (pos 8)
- Periods Remaining (old formula `MATCH(target) - MATCH(current)`): 18
- Before allocation: (4000 - 0) / 18 = $222.22
- After allocating $222.22: CurrentlySaved = $222.22 (Budget Available = prior 0 + Budgeted 222.22 - Spent 0)
  - Formula: (4000 - 222.22) / 18 = $209.88 — what the user saw

Mathematically correct but semantically surprising. The formula's divisor (18) treated the 18 positions from current-exclusive to target-inclusive as "future periods to distribute over" — but `CurrentlySaved` already included the current period's allocation. So the math was: "$3777.78 remaining, needs to come from 18 future periods, therefore $209.88/period going forward." The user's mental model: "I allocated the amount you told me to; the amount shouldn't change."

### Fix design
Add an "Allocated This Period" column to make the per-period commitment visible, and adapt the Needed Future formula based on whether current is allocated:
- If F (Allocated This Period) > 0: `(Target - CurrentlySaved) / (G - 1)` — "current already counted, split remainder over future-excluding-current"
- If F = 0: `(Target - CurrentlySaved) / G` — "assume user will budget the shown amount each period INCLUDING this one"

Verification the fix preserves "stays constant" behavior:
- Before allocation: 4000 / 18 = $222.22
- After allocating $222.22: (4000 - 222.22) / (18 - 1) = $222.22 ✓
- Over-budget $400: (4000 - 400) / 17 = $211.76 (less needed future)
- Under-budget $100: (4000 - 100) / 17 = $229.41 (more needed future)

### Changes in v11.11
**Schema (9 columns, positions unchanged but cells F/G/H reworked):**
```
OLD: ... | Periods Left (F) | Per-Period Need (G) | On Track? (H) | Notes (I)
NEW: ... | Allocated This Period (F) | Periods Remaining (G) | Needed Future Periods (H) | Notes (I)
```

**Formulas:**
- E (Currently Saved) — unchanged: `SUMIFS(Budget_Available, ..., $B$3)`
- F (Allocated This Period) — NEW: `SUMIFS(Budget_Budgeted, ..., $B$3)`
- G (Periods Remaining) — moved from F, formula unchanged
- H (Needed Future Periods) — replaces Per-Period Need + On Track?:
  ```
  =IF(OR(B="",C="",D=""),"",IFERROR(
    IF(G<=0, 0,
      IF(E>=C, 0,
        IF(F>0, MAX(0, (C-E)/MAX(1, G-1)),
               MAX(0, (C-E)/G)))),""))
  ```

**Number formats:**
- C, E, F, H: currency
- G: integer (was previously F)

**Dashboard (row 2 labels + row 3 formulas):**
```
OLD: Today | Current Period | Total Goals | Per-Period Need | Currently Saved | Target Total
NEW: Today | Current Period | Total Goals | Currently Saved | Needed Future | Target Total
```
D3 now sums E (Currently Saved total); E3 now sums H (Needed Future total).

**Conditional formatting:**
Old On Track? text-based CF rules (DONE/ON PACE/CLOSE/BEHIND/OVERDUE) stripped. Column H is now currency, not text — rules would never match. No replacement CF for v11.11.

**Instructions tab:** SAVING section's "Step 3" updated to describe the new columns.

### User next
Run Budget Tools → 3. Update Script ONE MORE TIME. `refreshSavingTab_` will:
- Overwrite formulas in E, F, G, H with v11.11 versions
- Update dashboard labels and formulas
- Strip old CF rules
- Leave user data in A, B, C, D, I intact

Expected result for existing Europe trip goal ($4000, Dec 23-Jan 5, with $222.22 budgeted in current period):
- E (Currently Saved): $222.22
- F (Allocated This Period): $222.22
- G (Periods Remaining): 18
- H (Needed Future Periods): **$222.22** ← stays constant ✓

### Lessons
- **Cumulative-vs-flow confusion:** the original formula mixed a cumulative metric (Currently Saved includes current period) with a flow denominator (Periods Remaining excludes current). Arithmetic worked but semantics surprised the user. Making the state visible (new column) + adapting the formula resolved it.
- **User-directed refactors beat preemptive "I think this should be different" refactors.** The user's proposed column layout was directly what they wanted — no need to second-guess. Implement their design, document the trade-offs.
- **Removing features is part of good design.** The On Track? status column had six CF rules and a 7-branch IFS formula. It looked useful at design time; the user didn't actually need it. Dropping it reduced code by ~40 lines and gave room for two more-useful columns.

### Status
- v11.11 deployed @31 (commit `5043293`)
- User needs to run Update Script to apply the schema change to their existing Saving tab
- No data loss — user-entered columns (A, B, C, D, I) preserved by refreshSavingTab_
