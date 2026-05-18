# Progress Log

> ## 📍 Current State (read this first)
>
> **Apps Script:** v11.25 — at `apps-script/Code.js`, deployed via `deploy "vNN — ..."` (one-word shortcut). NEVER use plain `clasp deploy` (creates a new URL, breaks PWA). v11.25 (Phase 33) removes the Reports tab and its plumbing (~500 LOC); user adopted native Sheets slicers (Category + Period) on Transactions tab as a simpler replacement. The v11.24 blank-dd guard in `buildFixedExpensesFormula_` is preserved since it benefits the Budget tab independently. v11.24 (Phase 32 bug-fix pass) fixed Fixed Expenses formula + added Uncategorized row to Reports. v11.23 (Phase 32) added the short-lived **Reports** tab: spending breakdown by category for any time frame (Today / This Week / Last 7 Days / This Month / Last Month / This Period / Last Period / YTD / Last Year / All Time / Custom) with drill-down to per-category transaction list. v11.22 (Phase 31) refreshed the in-sheet Instructions tab content — adds missing menu items (Archive Goal, Setup Email Trigger, Dedupe + Normalize), ClientMetrics tab, hourly auto-parse workflow, multi-select rail; no behavioral change. v11.21 (Phase 30) fixes two critical bugs discovered via Gmail-vs-sheet cross-reference: (1) duplicate parser-written rows from Gmail thread re-iteration (~$435 of phantom over-counted spending across 15 timestamp-duplicate groups) — fix is write-time timestamp dedup in `processInfoAlerts_` + widened `shortHash_` 4→8 hex chars; (2) last-day-of-period transactions silently lost to "Unassigned" period (~$165 stranded from Budget totals) — fix is parser normalizes Date to midnight + Period formula wraps in `INT()`. New `Dedupe + Normalize Transactions (rescue)` menu item for one-shot cleanup of existing data. v11.20 added the `bootstrap` action: returns categories + parseAndFetch in one call. v11.19 added the Rolled Over column. v11.18 added `Archive Goal...` / `Unarchive Goal...` menu items. v11.17 made `handleParseAndFetch_` read-only by default. v11.16 added Phase 1 of time-driven parsing. v11.15 made Budget B1 auto-snap. v11.14 added archive endpoints. v11.13 added `_elapsedMs` + `logClientMetrics` + `ClientMetrics` tab.
>
> **PWA:** v0.19.8 (cache v38) on `main` — Phase 29.2 uses the new `bootstrap` action (with transparent fallback to v0.15.4 dual fetch on any failure). v0.19.7 added preconnect hints to script.google.com + cache-first paint on Dashboard. Pixel UI is the canonical theme as of 2026-05-09 (graduated from `pwa/pixel-ui-redesign` via merge commit; that branch is preserved on remote as a snapshot but not active). Force-pixel via early `<head>` script. `.nojekyll` at repo root is required — don't delete.
>
> **Workflow tooling:** project-level `.claude/settings.json` (permissions + SessionStart hook), `.claude/state-check.sh` (state snapshot), `.claude/statusline.sh` (persistent display), three slash-command skills (`/state`, `/lint`, `/deploy`). On main, also merged into pixel branch.
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

## Session: 2026-04-20 (even later) — Budget Tab #REF! Cascade (v11.12)

### Setup
User ran Update Script after v11.11 to apply the Saving tab schema refactor. Saving tab structure looked correct (v11.11 schema confirmed via dumpSheet). But user noted that the Europe goal in Saving tab still showed $0 Currently Saved even though they had budgeted $222.22 for it.

### Diagnostic dumpSheet reveals
Pulled Budget tab rows 8 (Groceries Dec 25-Jan 20), 77 (Europe Apr 1-14, where user had actually budgeted the $222.22), 87 (Europe Apr 15-28, the current period). ALL three rows — across different categories and periods — had broken formulas:
- E (Spent): `=-SUMIFS(#REF!,#REF!,A<row>,#REF!,C<row>)`
- F (Available): `=IF(MATCH(A<row>,#REF!,0)>1,IFERROR(SUMIFS(#REF!,#REF!,INDEX(#REF!,MATCH(A<row>,#REF!,0)-1),#REF!,C<row>),0),0)+D<row>-E<row>`

But Budget tab DASHBOARD formulas (rows 1, 4) were fine — `PayPeriods_Start`, `PayPeriods_Label`, `Transactions_Amount`, `Budget_Budgeted` all resolved correctly. So named ranges exist; the per-row refresh in `updateWorkbook` wasn't actually committing.

Also observed: user had budgeted $222.22 in period "Apr 1 - 14" (row 77), not "Apr 15 - 28" (row 87, the actual current period). That alone explains why Saving tab's Currently Saved column showed $0 for the current period — but it doesn't explain the #REF! on every Budget row.

### Root-cause investigation
Looked at updateWorkbook order:
1. cleanup whitespace, add Timestamp col
2. Instructions, setTransactionFormulas, data validation
3. setNamedRanges_ — deletes then recreates every owned-prefix named range (PayPeriods_*, Budget_*, etc.)
4. Saving tab refresh — sets formulas referencing the freshly-created names → works
5. Budget dashboard refresh — sets formulas referencing names → works
6. **Budget per-row refresh loop — supposed to setFormula for every data row → fails silently**
7. ui.alert

Step 3 breaks all existing Budget per-row formulas to `#REF!` (the known Sheets one-way conversion). Step 6 is supposed to overwrite them with valid references. Dashboard in step 5 works with the same approach, but per-row step 6 doesn't. No obvious reason why — tested that col A values are plain strings (not errors), `validPeriods` lookup should match, formula text is identical to what works elsewhere.

### Fix strategy
Rather than continue hunting the in-place loop's quirk, swap in the proven path. `rebuildBudgetInternal_('refresh', ss)` is the same code that:
- Runs inside `handleAddCategoryInner_` (PWA addCategory) — and produces correctly-resolved formulas
- Runs inside `initializeBudget` (menu)
- Preserves user-entered Budgeted amounts via `existingBudgetedMap`

Replacement in `updateWorkbook`:
```js
SpreadsheetApp.flush(); // commit setNamedRanges_ state
var rebuildResult = rebuildBudgetInternal_('refresh', ss);
if (rebuildResult && rebuildResult.error) {
  console.error('updateWorkbook: Budget rebuild failed:', rebuildResult.error);
}
```

Also removed the old `buildBudgetDashboard_` + header-refresh blocks that ran before the per-row loop — `rebuildBudgetInternal_` does dashboard + header + all data rows as part of its rebuild.

### Note on blast radius
This bug was present in every Update Script run since v11.8 (approximately 4 separate user-visible runs). Until now it went unnoticed because:
- The Budget dashboard (which worked) was the most visible thing in the tab
- The per-row Available/Spent columns showed `#REF!` only in cells the user hadn't recently edited
- The Saving tab was newly added, so its Currently Saved = 0 looked like "new empty goal" rather than "the Budget formula it depends on is broken"

The user's report of the Europe tracking issue was actually TWO bugs:
1. User mis-filed $222.22 in period Apr 1-14 (row 77) instead of Apr 15-28 (row 87) — user error, not a code bug
2. Budget per-row formulas stuck on #REF! — actual code bug

Fixing (2) via rebuildBudgetInternal_ in v11.12. Telling user about (1) so they can move the budget to the right period.

### Lessons
- **When an in-place refresh doesn't match a known-working rebuild path, stop debugging the in-place version and use the rebuild path.** Hours of investigation vs minutes of swapping in a proven code path.
- **`dumpSheet` with `includeFormulas=true` on MULTIPLE representative rows is the verification tool of choice.** Values alone hide the #REF! cascade because IFERROR swallows errors downstream. Always diff formula text post-update.
- **Document blast radius for regression bugs.** Knowing this Budget #REF! was present across 4 updates helps the user understand why things seemed off.

### Status — VERIFIED WORKING
- v11.12 deployed @32 (commit `612f5e4`) + docs `8bf653b`
- User ran Update Script. Post-run `dumpSheet` verification:
  - **Zero `#REF!` cells across the entire Budget tab** (267 rows scanned)
  - Budget row 8 (Groceries control) formulas resolve to `Transactions_Amount`, `Budget_Available`, `PayPeriods_Label` — all clean
  - Budget row 77 (Europe / Apr 1-14) = $0 — user correctly moved their budget out
  - Budget row 87 (Europe / Apr 15-28 current) = Budgeted $222.00, Available $222.00 — user moved the allocation here
  - Saving tab row 6 (Europe goal): Currently Saved $222.00 · Allocated This Period $222.00 · Periods Remaining 18 · Needed Future Periods $222.24
  - Saving dashboard: Currently Saved total $222.00, Needed Future total $222.24

### Validation of the adaptive formula
User budgeted $222.00 (rounded from the exact $222.22 initial suggestion). The Needed Future Periods formula correctly detected the $0.22 shortfall and shifted the future-period target to $222.24: `(4000 - 222) / (18 - 1) = $222.24`. If the user had budgeted the exact $222.22, the formula would have stayed at $222.22. This is the "stays constant when correct, adjusts when over/under" behavior we designed for — working exactly as intended with real user data.

The two-bug situation that started this session is now fully resolved:
- User error (budget in wrong period) — user fixed manually
- Code bug (#REF! cascade across Budget tab) — fixed in v11.12 via rebuildBudgetInternal_

---

## Session: 2026-04-23 — PWA v0.12.2 + v0.13 + v0.14 shipped

Completed all three deploys of the PWA restructure (Phase 18 in `docs/task_plan.md`) in one session, plus diagnosed a GitHub Pages deployment timeout. All work on branch `claude/read-markdown-context-v1c5T`; `main` still at v0.11.

### v0.12.2 — scope chrome to the view that owns it (commit `0fecc70`)

v0.12.1 left Refresh + Sync in the shell header with a `setHeaderActions({refresh, sync, settings})` helper each view called on mount. The helper required per-view bookkeeping plus a "Done" relabel on Setup because the entire header/tab-bar was hidden on `#/setup`. User observed this was overcomplicated for chrome that's only meaningful in one view.

Deleted `setHeaderActions` entirely. Header is now title + version + Settings only. Refresh is an inline `⟳` icon inside `#period-filter-bar` (next to the period dropdown). Sync is a sticky bar (`#sync-bar`) above the tab-bar, hidden when `store.syncQueue.length === 0`. When the undo-bar is also visible, `.above-undo` on the sync-bar bumps it up 48px to stack.

The Categorize tab-bar label gained a pending-count badge: `Categorize (N)` when a queue exists, maintained by `router.updateCategorizeBadge()` — called on every route change and from `categorize.js` after any mutation. No pub/sub needed.

Tab-bar no longer hidden on `#/setup` — the Done-button hack goes away entirely; the tab-bar is the exit.

Files: `index.html` (header stripped), `js/ui.js` (helper deleted), `js/router.js` (badge helper added, setup-hide removed), `js/views/setup.js` + `dashboard.js` + `categorize.js` (setHeaderActions calls removed), CSS restructured.

### v0.13 — real dashboard content (commit `c19c836`)

Key design decision: **no new Apps Script endpoint.** The spreadsheet already computes every value we need via SUMIFS. Two parallel `dumpSheet` calls — Budget `A1:F215` (1,290 cells) and Saving `A1:I105` (945 cells) — pull all 26 periods × 8 categories + all 100 goals in one round-trip. Period switching is pure client-side filtering of the cached array, zero network cost.

New `js/lib/budget.js` (~180 LOC) owns fetch + parse + cache:

- `getDashboardData({ forceRefresh })` — 10-min TTL in localStorage; returns cached with a `stale` flag if fetch fails but cache exists.
- `parseCurrency(raw)` — tolerant of `$`, commas, whitespace, paren-negatives, blanks, null. 11 edge cases unit-tested via `node --input-type=module` before commit.
- `formatCurrency(n)` — uses `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. All display runs through this; future locale changes happen once.
- `invalidateDashboardCache()` — called from `categorize.js sync()` after successful `batchCategorize`. One direct call, two callers total; no pub/sub.

View layout: Ready-to-Assign hero card (purple gradient, large number, sheet-period hint if the dropdown diverges from sheet `Budget!B1`) + Income / Fixed / Budgeted summary strip + per-period category cards with green/amber/red progress bars (80% and 100% thresholds) + saving-goal cards with tap-to-expand details (allocated-this-period, periods remaining, needed-future, notes).

Known scope limit (documented in plan non-goals): summary block reflects sheet `Budget!B1`, not the PWA's selected period. Replicating Net Income / Fixed Expenses client-side would need three more `dumpSheet` calls (Transactions for Paycheck SUMIFS, FixedMonthlyExpenses, Setup). Deferred.

New `api.dumpSheet(tab, range)` wrapper (6 LOC). New `periods.allPeriods()` enumerator (15 LOC) for the full 26-period dropdown.

### v0.14 — auto-suggest sub-tab with per-row swipe (commit `4af0227`)

User direction shaped the UX: split the Categorize view into Manual | Auto sub-tabs (not a sub-route — they share period filter + refresh + sync bar + picker), and make the Auto tab a **list-with-per-row-swipe** rather than a one-card-at-a-time deck. Two-line rows: merchant + amount on top, `↗ suggested category` below. Swipe right = accept (queue for sync), swipe left = hide this session only (txn stays in Manual). Tap without swipe still opens the picker.

New `js/lib/suggest.js` (~160 LOC): `ensureIndexReady` does one `dumpSheet('Transactions', 'A2:H1000')`, parses into `{normalizedMerchant: {category: count}}`, caches 1 hour. `suggest(merchant, {threshold = 0.70})` returns `{category, confidence, count}` or null. `invalidateSuggestIndex()` wired into `categorize.js sync()` alongside `invalidateDashboardCache()`.

**Normalizer iteration:** initial rules failed the core test (`AMAZON.COM*MT12345 SEATTLE WA` vs `AMAZON.COM*XY98765 SEATTLE WA` produced different keys because `\b\d{4,}\b` stripped digits but left `*mt` / `*xy` behind). Tightened to `\s*\*[a-z0-9]+` global (strip card/txn tokens anywhere), then `\b\w*\d+\w*\b` (strip words with digits). Next failure: `Starbucks #4321` left stray `#`. Added `\s*#\w+` (strip store IDs). Next failure: `TARGET T-0384` because `\b` breaks on hyphens. Changed to `\S*\d+\S*` (strip any whitespace-bounded token with a digit). Final suite: 17 cases, all pass.

New `js/lib/swipe.js` (~95 LOC): `attachSwipe(translateEl, { revealEl, onLeft, onRight, threshold = 0.40 })`. The `translateEl` / `revealEl` split is critical — pseudo-elements transform with their parent, so the action-background `::before` / `::after` must live on an outer static shell while only the inner content translates. Auto-row DOM: `.auto-row` outer + `.auto-row-inner` inner.

Vertical-scroll preservation: on first meaningful move, if `|dy| > |dx| * 1.5` the swipe aborts and the browser gets scroll control. Short taps (dx < 5 px, t < 300 ms) fall through to the click handler.

`rejectedThisSession` is an in-memory module Set in `categorize.js`. Intentionally not persisted — next session's richer index deserves another shot at suggestions that were below threshold today.

### GitHub Pages failure + fix (`ef80142` + `211d764`)

After pushing v0.14, user reported "last deployment failed." Log:

```
Current status: updating_pages
...
Error: Timeout reached, aborting!
Canceling Pages deployment...
Canceled deployment with ID 4af022731feaa2cb5e75878edace71ee3f27a024
```

Critical clue: **build step succeeded, deploy step hung at `updating_pages`.** Not a content problem — an orchestration problem. Root cause: GitHub Pages runs Jekyll by default when no `.nojekyll` marker exists. The static PWA shouldn't be Jekyll-processed; the marker was missing.

Fix: empty `.nojekyll` at repo root (commit `ef80142`). Follow-up empty-commit retrigger (commit `211d764`: `git commit --allow-empty -m "Retrigger Pages deploy"`). The next Pages run succeeded and the branch is now live.

Rules captured in `CLAUDE.md` (trip-up #16) and `docs/findings.md` ("GitHub Pages `.nojekyll` failure mode"):

- Keep `.nojekyll` on every branch Pages deploys from.
- Pages build "success" doesn't imply deploy success — check the deploy step specifically.
- Empty-commit retrigger is a safe diagnostic for transient failures.

### Design decisions worth preserving

- **Prefer client-side aggregation over new endpoints** when the sheet has already done the math. v0.13's dashboard would have cost a `dashboardData` Apps Script endpoint + deploy cycle for strictly no user-visible benefit; two `dumpSheet` calls cover it.
- **Avoid pub/sub until two direct calls feel like three.** `categorize.js sync()` → `invalidateDashboardCache()` + `invalidateSuggestIndex()` is fine. Revisit when a fourth caller appears.
- **Normalizer consistency is more important than normalizer cleverness.** Two variants of the same merchant producing the same key matters more than the key being humanly elegant. Unit-test coverage on the normalizer is non-negotiable.
- **Outer/inner DOM split for swipe-reveal.** Whenever a fixed-background element needs to stay put while a sibling translates, they can't share a pseudo-element parent. Document this pattern (in `lib/swipe.js` header) so the next swipe UI doesn't relearn it.
- **Keep `.nojekyll` committed.** Zero downside, avoids a failure mode that presents as "deployment flakiness."

### Status — VERIFIED WORKING
- All 14 JS modules pass `node --check`.
- `parseCurrency` 11/11 cases pass.
- `normalizeMerchant` 17/17 cases pass.
- `http.server` asset check — every new file serves 200.
- GitHub Pages deployment succeeded after `.nojekyll` + retrigger; user confirmed "everything works."
- Branch `claude/read-markdown-context-v1c5T` at commit `211d764`, 9 commits ahead of `main`.

---

## Session: 2026-04-24 — PWA v0.15 redesign, safe-area fix, dedup, metrics pipeline

Forked a new refinement branch `pwa/v0.15-refinement` off `claude/read-markdown-context-v1c5T` to iterate on the visual design without destabilizing the v0.14 parent. Four shipped increments.

### Redesign: Minimal Monochrome (commit `e2b769a`, v0.15.0)

User pointed at a design handoff bundle from Claude Design: `/v1/design/h/Gq2GUSFxrOJQWkT4ISX2yg`. Fetched via WebFetch — came back as a 32KB gzipped tarball. Extracted to `/tmp/design-fetch/budget-pwa/`. README insisted on reading the chat transcript first; the transcript showed the user had iterated through three variations (A Minimal Monochrome, B Paper Ledger, C High-Contrast Editorial) and explicitly deleted B and C. Final = Variation A.

Translated from the React-in-HTML prototype (`variations/variationA.jsx`) to our vanilla JS/CSS. Pulled out CSS custom properties for the palette (`--ink`, `--bg`, `--bg-period`, etc.) and rebuilt three views:

- **Categorize:** calendar period bar at top (`‹ · Apr 17 — 30 ▾ · ›`), Parse/Sync pill in right slot, Manual/Auto segmented control, list rows with merchant + uppercase date + amount.
- **Dashboard:** 4-col summary strip, collapsible `+`/`−` main-category groups, sub-rows with color-coded `left/over` + muted `spent/budgeted` + 1px progress bar, Saving Goals section with tap-to-expand.
- **Setup:** underline-style API-key input + solid-black Save button + flat version list.

Added Settings as a third tab in the bottom bar (previously a header button); kept `<header>` in DOM but hid it via CSS. Bumped to v0.15 / cache v20.

### Safe-area fix (commit `1d1829b`, v0.15.1)

User reported a white strip above the period bar on iPhone 16 Pro. Traced: the design prototype used a fixed 390×844 iPhone 14 frame with a 54px notch block, and I'd literally translated that as `<header>{ height: 54px; background: var(--bg); }`. On iPhone 16 Pro the actual `safe-area-inset-top` is ~62px AND the color was wrong (near-white `#FAFAF9` vs. the period bar's tan `#EFEDE8`).

Three coordinated fixes:

1. `viewport-fit=cover` in the viewport meta → unlocks `env(safe-area-inset-*)` on iOS.
2. Deleted the fixed-height `<header>` spacer.
3. `.period-bar { padding-top: calc(env(safe-area-inset-top, 0px) + 10px); }` — the tan background fills whatever inset the OS reports.

Also made `#category-picker top: 100px` and `#error-toast top: 64px` safe-area-aware via the same `calc()` pattern. Bumped to v0.15.1 / cache v21.

### Savings/Goals dedup (commit `49073a2`, v0.15.2)

User noticed the Savings main group showed Europe + NDEB subs that ALSO render below as Saving Goal cards — same data in two places. In `views/dashboard.js renderBody()`:

```js
const linkedSubs = new Set(goals.map(g => g.linkedCategory).filter(Boolean));
const cats = allCats.filter(c => !linkedSubs.has(c.sub));
```

Chose data-driven filter (match on `goal.linkedCategory`) over hardcoding `main === 'Savings'` so future goals under different mains still dedup correctly. Goal cards already carry strictly more info (target, periods remaining, needed-per-period), so nothing is lost by suppressing the category row. Bumped to v0.15.2 / cache v22.

### Pause for diagnostics: client metrics pipeline (commit `6110a74`, v0.15.3 + Apps Script v11.13)

User asked to go back to the cold-start performance issue and pasted an activity log snippet. Analysis: the Logs tab shows `parseAndFetch ~1.8s` and `dumpSheet Transactions ~2.5s` cold, but doesn't capture TLS/DNS/redirect cost, cold-container queue wait, or duplicate-call patterns. Gap between the logged 3-6s server execution and the user-reported ~20s wall clock lives in network + cold-container + serialization time.

Before shipping any fixes, user explicitly requested rich client-side metrics — "make the logs sheet a rich source of data not only for error monitoring but also for optimization." Built a pipeline that writes to a new `ClientMetrics` tab (intentionally separate from `Logs`).

**Client side** (`js/lib/metrics.js`, new):

- Session id + mount counter (so each metric is scoped to one cold-open of the PWA, with view-mount-level granularity).
- `recordStart(action)` / `recordComplete(ticket, {ok, serverMs, bytes, cached, errorMsg})` wrapping every call in `api.js`. `inFlightAtStart` captures concurrency; `msSincePrev` captures cold/warm state; per-action `lastStartByAction` flags duplicates within 2s.
- `recordEvent(kind, data)` for non-API events: `mount:<route>` (with import-time vs mount-time note), `cache-hit:dashboard`, `cache-miss:dashboard`, `cache-hit:suggest` (with source), `cache-miss:suggest`.
- 50-entry buffer flushed on `visibilitychange: hidden` + `pagehide` via `navigator.sendBeacon` (fire-and-forget). Text/plain Blob to skip CORS preflight. Keepalive-fetch fallback.
- **Self-exclusion**: the `logClientMetrics` action is skipped in the instrumentation wrapper (otherwise flushing generates logs about flushing, recursively).
- Exposes `window.__apiStats`, `window.__apiStats_session`, `window.__apiStatsFlush()` for Safari remote DevTools.

**Apps Script side** (v11.13, bumped `APP_SCRIPT_VERSION` in Code.js + `VERSION.txt`):

- `doGet` / `doPost` inject `_elapsedMs` into every response body (success and error paths). Client reads it to compute `networkMs = clientTotalMs - serverMs`.
- `handleLogClientMetrics_` accepts batched records, appends to `ClientMetrics` tab in one `setValues` call. Tab auto-creates on first write with 18 columns: `ReceivedAt, SessionId, MountN, AppVersion, Connection, Action, ClientStartMs, ClientTotalMs, ServerMs, NetworkMs, InFlightAtStart, MsSincePrev, Duplicate, Cached, Ok, ErrorMsg, Bytes, Note`.
- 500-row batch cap (defense-in-depth; client buffer is 50).

Apps Script deploy must run on the user's machine (`clasp` unavailable in this sandbox). The PWA ships independently — until v11.13 is live, flushes silently fail with "Unknown action" but metrics still accumulate in memory and are inspectable via `window.__apiStats`.

Bumped to v0.15.3 / cache v23.

### Lessons captured

- **Pixel-hardcoded "device chrome" assumptions from design prototypes are bugs waiting for the next device generation.** When translating a design, map every fixed device-frame offset to `env(safe-area-inset-*)` with `viewport-fit=cover` opt-in.
- **CORS preflight + Apps Script = silent fetch failures.** iOS Safari sends OPTIONS for any POST with `Content-Type: application/json`; Apps Script responds with 302 redirects that break preflight. Using `text/plain` Blobs with `sendBeacon` keeps the request in the CORS "simple" lane.
- **Any logger that depends on the transport it's measuring must self-exclude**, or it logs about logging until the buffer fills with recursive noise. One line in the wrapper prevents the whole bug class.
- **Diagnose before fixing**, especially for cold-start class bugs where four plausible optimizations exist and only one probably actually helps. The metrics tab pays for itself the first time it shows a fix was wasted effort.
- **Keep ops logs and perf logs in separate tabs.** `Logs` is for error monitoring (one row per API call). `ClientMetrics` can grow hundreds of rows per session without polluting the ops view.

### Status — PWA verified; Apps Script pending user deploy

- All 14 JS modules (now 15 with metrics.js) pass `node --check`.
- `parseCurrency` 11/11 + `normalizeMerchant` 17/17 still passing.
- Safari remote DevTools connection confirmed `window.__apiStats` exposes live buffer.
- Branch `pwa/v0.15-refinement` at commit `6110a74`, 4 commits ahead of parent `claude/read-markdown-context-v1c5T`.
- **Action required:** ~~`cd apps-script && ./deploy.sh "v11.13 — ..."` on the user's machine to activate the `logClientMetrics` endpoint server-side.~~ **RESOLVED 2026-04-24.** User ran deploy.sh (twice — first run was on a stale branch and pushed v11.12; second run after `git checkout pwa/v0.15-refinement` succeeded). Apps Script v11.13 deployed @35. ClientMetrics tab populated with real session data — see next session entry below.

---

## Session: 2026-04-24 (later) — Cold-start fixes confirmed by ClientMetrics (v0.15.4)

### Setup
User ran v11.13 + backgrounded the PWA a few times. First ClientMetrics rows landed in the sheet. User pasted two sessions' worth of data (`5y2p0s2l5f`, `6w29253t3v`) and asked me to "review your previous optimization assumptions with it and create a plan." Goal: validate the four candidate fixes from Phase 21 against real measurements before touching code.

### Diagnosis
Parsed both sessions' rows. Key columns: `ClientTotalMs`, `ServerMs`, `NetworkMs = clientTotal − serverMs`, `InFlightAtStart`, `MsSincePrev`, `Duplicate`, `Cached`.

**Confirmed hypotheses:**
- Duplicate `categories` on every mount: two rows per `mount:categorize`, one flagged `Duplicate=Y`, costing ~3 s together.
- Eager suggest-index warmup: `dumpSheet:Transactions ClientTotal=3136 ms` on cold mount, fires unconditionally even for Manual-only users.
- Re-mounts pay the full tax: `mount:categorize` cold=7763 ms, re-mount=6864 ms, third re-mount=**9198 ms** (not improving — sometimes worse under contention).

**Contradicted assumption:**
- Network overhead is NOT front-loaded to the first call. `version ClientTotal=2571 ms, Server=46 ms, Network=2525 ms, MsSincePrev=340 ms` proved every call pays ~2.5 s regardless of warmth. This is the Apps Script 302 redirect (`script.google.com` → `script.googleusercontent.com`) + TLS handshake per logical fetch. Parallel fetches serialize on the single-threaded container anyway — `dumpSheet:Budget` (2634 ms) and `dumpSheet:Saving` (3838 ms) fired concurrently but Saving waited behind Budget before running.

Reprioritization: re-mount throttle moved up in importance because the 2.5 s network tax applies on EVERY re-mount call, not just the first cold open.

### Fix
Four coordinated PWA-only fixes landed as v0.15.4 (commit `3ff46c0`, cache v24). No Apps Script changes.

Before implementing, I walked through a full regression trace per fix against existing flows (categorize/undo/sync/Auto-swipe/re-mount/force-refresh) to confirm no functional loss.

- **Fix 1 — share categoriesPromise** in `js/views/categorize.js`. `mount()` stores its fetch promise in a module variable; `refresh()` awaits it instead of firing a second. User-initiated refreshes (Parse pill, empty-state button) pass `force: true` to re-fetch fresh so sheet-side additions propagate.
- **Fix 2 — defer `ensureIndexReady()`**: `mount()` only warms if `activeSubtab === 'auto'` (restored from localStorage). `setSubtab('auto')` warms on first Auto tap; internally idempotent so flipping back-and-forth is free.
- **Fix 3 — persist `store.transactions`** to localStorage. New `saveTransactions()` + `setTransactions(list)` methods; all mutators call save. `refresh()` uses `setTransactions(fresh.filter(notQueued))` — replaces rather than merges, correctly evicting stale-cached items.
- **Fix 4 — throttle `refresh()`** to 60 s. Silent re-mounts within the window return immediately. Parse pill + empty-state Refresh always bypass.
- **Bonus fix — `version` cache** in `js/views/setup.js`. Module-level `versionCache`; first Setup mount fetches, subsequent mounts paint instantly.

Module imports + file changes:
- `js/store.js` — 36 insertions (persist + replace semantics)
- `js/views/categorize.js` — 114 insertions (shared promise, throttle, lazy suggest, `force` parameter plumbing)
- `js/views/setup.js` — 46 insertions (version cache + extracted render helper)
- `js/config.js`, `sw.js` — version bumps (v0.15.4, cache v24)

### Status — VERIFIED WORKING (measured 2026-04-24)
- v0.15.4 deployed via GitHub Pages (commit `3ff46c0`) on `pwa/v0.15-refinement`.
- All 15 JS modules pass `node --check`; every asset serves 200 locally.
- No regression: walked through 14 user scenarios (cold open, warm re-open, navigate tabs, force refresh, categorize, undo, sync, Auto swipe, Auto toggle persistence, corrupted localStorage, race conditions, invalidation after sync, setTransactions quota, filter correctness) — all clean.
- **Measured outcome:** five of six perf targets hit per real ClientMetrics rows. See `docs/findings.md` "Cold-Start Perf Findings + Fix (v0.15.4)" Verification block for the full before/after table. Sixth target (first cold `mount:categorize` < 3 s) bounded by per-call 2.5 s network tax — out of scope without a consolidated server endpoint, but the localStorage paint cache makes the user-perceived cold open materially faster regardless.

---

## Session: 2026-04-24 (later 2) — Docs sync for v0.15.4

### Setup
User asked "update .md files" after v0.15.4 shipped, and also asked whether I use any skills when updating docs — they recently added one and wanted to verify it works.

### Diagnosis
No `user-invocable skills` list appeared in this session's system reminders (skills are auto-discovered at session start from `.claude/skills/`, and this one was merged from `main` into `pwa/v0.15-refinement` mid-session so it isn't auto-registered). The skill's SKILL.md + templates + lint.sh are however present in the working tree after the merge. Followed the skill's 8-step workflow manually: classify → sync versions via lint.sh → consult templates → apply → re-lint → commit with the skill's required message format.

### Fix
Updated all four doc files per the skill's guidance.
- **CLAUDE.md**: bumped Current versions to v0.15.4/cache v24; extended Deploy sequence history; added trip-ups #25 (shared-promise pattern for duplicate API calls) and #26 (re-mount refresh throttle). Renumbered three pre-existing duplicate-numbered trip-ups (16/17/18 → 22/23/24) to fix a drift I introduced in an earlier session.
- **docs/task_plan.md**: bumped Current State; appended Phase 22 (Cold-Start Optimization) in ascending order after Phase 21. Also marked Phase 21 Status complete + verified working.
- **docs/findings.md**: updated header pointer to name v11.13 Apps Script + v0.15.4 PWA (fixes lint warning). Appended "Cold-Start Perf Findings + Fix (v0.15.4)" postmortem using the skill's Symptom/Verification/Root cause/Why it cascaded/Blast radius/Fix/Lesson structure.
- **docs/progress.md**: closed out the stale v0.15.3 "Action required" line with RESOLVED marker per the session-entry-template's stale-state cleanup pattern. Appended v0.15.4 session entry above.

### Status — VERIFIED WORKING
- Lint re-ran clean after fixes (0 blocking, 0 warnings on version pointers, phase ordering warning is pre-existing historical drift untouched by this change).
- Docs commit follows the skill's `Docs: [vX.Y / Phase N / topic] — ...` format.
- Skill usage reported to user: the skill file is in the repo (`.claude/skills/update-budget-docs/`) but was merged mid-session so it isn't auto-registered for inline `Skill` tool invocation this session. Next session started in this repo will have it auto-discovered. The 8-step workflow was followed manually with identical end result.

---

## Session: 2026-04-24 (later 3) — v0.15.4 verification + skill close-the-loop

### Setup
User shared v0.15.4-tagged ClientMetrics rows from three real sessions (`2e6604343r`, `3h0s4b3g18`, `4j2w0v1w6k`) covering cold opens, re-mounts, dashboard navigation, and sync flows. Asked whether the v0.15.4 fixes actually sped things up.

### Diagnosis
Compared post-deploy rows against the v0.15.3 baseline columns (`ClientTotalMs`, `ServerMs`, `NetworkMs`, `Duplicate`, `Cached`). Five of six targets hit decisively; sixth (first-cold `mount:categorize` < 3 s) missed at 7348 / 9038 ms because the per-call ~2.5 s network tax + serialized cold-container processing keeps the awaited critical path long. localStorage cache makes user-perceived paint <200 ms regardless. Two anomalies in the data — a service-worker transition window (5× auth_fail + 1× HTTP 404 in session `2e6604343r`) and a 20 s `categories` call (iOS Safari mid-fetch suspension in `4j2w0v1w6k`) — neither a v0.15.4 bug.

### Outcome
Closed the v0.15.4 session entry from MEASUREMENT PENDING → VERIFIED WORKING. Added a Verification block with the before/after table to `findings.md` "Cold-Start Perf Findings + Fix (v0.15.4)". Bumped Phase 22 Status from `complete` to `complete + verified working`. Added a sixth Lesson to the postmortem: mount latency alone is a misleading number — pair it with cache-hit ratio + perceived-paint reasoning.

Skill behavior change worth noting: this session the user re-merged the branch with skill updates (`b21c8be Skill: bake in dogfood learnings + pre-commit hook + Phase reorder`) and Claude Code's skill list refreshed mid-session — `update-budget-docs` showed up in the available skills, and the `Skill()` tool successfully invoked it. The earlier (later 2) session followed the skill manually because it merged in mid-session; this one used the inline invocation. End result identical, but confirms the skill's "Known limitation — mid-session discovery" section is accurate (and that the workaround works).

### Status — VERIFIED WORKING
- No code change.
- Docs updated for verification per skill Example 3.
- Lint clean.
- Branch `pwa/v0.15-refinement` ready for next iteration. Open question for next session: do we want to start a Phase 23 to tackle the first-cold `mount:categorize` via a consolidated `dashboardData`-style endpoint, or accept the current floor + move to other work?

---

## Session: 2026-04-28 — Time-driven email parsing (v11.16 + v11.17 + PWA v0.17.0)

### Setup
User shared a critique pasted from another model that argued the dominant pain in this codebase was "using Apps Script as a synchronous HTTPS proxy in front of the Sheet" — every refresh paying the ~2.5 s network tax PLUS a Gmail scan, plus a long tail of trip-ups (302 / POST-body loss, deployment-ID coupling, observability via in-sheet Logs tab, CORS preflight workarounds) that all trace back to that one decision. The critique recommended Option 1 (minimum viable rebuild): keep the sheet, demote Apps Script to a time-driven background worker, eventually move PWA reads to the Sheets API directly. User asked me to plan the time-driven email parsing piece first ("planning and reviewing phase. Do not make changes").

### Design
Reviewed current state via direct file reads (no agent, since I had conversation context):
- `processInfoAlerts_` already trigger-safe: LockService-protected since v11.3, idempotent via Gmail's `Budget/Processed` label + `uniqueSuffix_` hash on timestamps, batches reads/writes/labels.
- `handleParseAndFetch_` does parse + read; PWA `js/api.js` `parseAndFetch()` is the only caller. PWA categorize `refresh()` doesn't read `data.parsed` or `data.parseErrors`, so removing those from the response is contract-safe.
- No `ScriptApp.newTrigger` anywhere. Existing only entry point is the menu item "Parse Emails" + the inline call from `handleParseAndFetch_`.

Wrote a planning doc covering goal, current state, two-phase architecture, edge cases (concurrency, trigger health, quota, PWA contract, backward compat in both directions), what could break, rollout sequence, and three open questions for the user. User chose:
1. **Hourly** (vs 15-min) — being behind ≤1 hr is acceptable for personal use; less Logs noise.
2. **Explicit menu item only** (no auto-install from `updateWorkbook`) — owner controls when the trigger goes live.
3. **Phase 1 first, verify, then Phase 2** — staged rollout.

### Implementation — Phase 1 (v11.16)
Three new functions appended to `Code.js`:
- `processInfoAlertsTrigger()` — wraps `processInfoAlerts_()` in try/catch, writes `LAST_TRIGGER_RUN` script property, and logs only "interesting" runs (parsed > 0 OR errors > 0) to keep 24 entries/day from drowning the Logs tab.
- `installEmailTrigger()` — idempotent: deletes any existing trigger for the same handler before creating `ScriptApp.newTrigger(...).timeBased().everyHours(1).create()`. UI alert confirms install + tells user where to find the menu items.
- `uninstallEmailTrigger()` — removes all triggers for `processInfoAlertsTrigger`. UI alert confirms removal count.

Two new menu items added under Budget Tools (between "Parse Emails" and "Set API Key"). VERSION bumped Code.js → v11.16 + matching pointer bumps in CLAUDE.md / task_plan.md / progress.md / findings.md (lint required for the commit). Lint clean (0 blocking, 0 warnings). Deployed via `./deploy.sh "v11.16 — time-driven email parsing trigger"` → revision `@41`.

### Phase 1 verification
User reported back: row appeared in Logs sheet but Triggers panel was empty in editor. Diagnosed in two paths:
- If the Logs row's Action was `installEmailTrigger`, it's a stale editor panel (programmatic `.create()` doesn't refresh the open Triggers panel) — hard-reload fixes.
- If the Action was `triggerParseEmails`, user had run the *handler* via editor Run button (which only executes the function once for a permissions check, doesn't install a trigger). Need to use the menu.

User confirmed working after the diagnostic. Both gotchas added as CLAUDE.md trip-ups #27 and #28.

### Implementation — Phase 2 (v11.17 + PWA v0.17.0)
Smaller change than expected once I read the categorize.js source: a "↻ Parse" outline pill already exists in the period bar's right slot (visible whenever the sync queue is empty), wired to `refresh({ force: true })`. So no new UI work — just plumb a `withParse` param through the existing `force` flag.

- `Code.js handleParseAndFetch_`: skip `processInfoAlerts_()` unless `params.withParse` is `'1'`/`'true'`/`true`. Returns `{ parsed: 0 }` on the read-only path. Backward compat: old PWA never sends `withParse` → server reads as undefined → server skips parse → returns just-read uncategorized rows. Hourly trigger keeps the sheet fresh.
- `js/api.js`: `parseAndFetch({ withParse = false })` appends `?withParse=1` only when caller asks.
- `js/views/categorize.js`: `refresh({ force })` derives `withParse: force` for the `parseAndFetch` call. So:
  - mount-time auto-refresh (force:false) → read-only (~200 ms server)
  - "↻ Parse" pill (force:true) → with parse (~1–3 s server)
  - empty-state Refresh button (force:true) → with parse

Bumped APP_VERSION → v0.17.0, CACHE_VERSION → v26, APP_SCRIPT_VERSION → v11.17, VERSION.txt + doc pointers. Lint clean. Deployed @42.

### Status — PHASE 1 VERIFIED, PHASE 2 PENDING USER VERIFICATION
- v11.16 + Phase 1: confirmed by user — hourly trigger fires, parses Scotiabank emails into Transactions without PWA involvement. Two trip-ups documented (#27, #28).
- v11.17 + PWA v0.17.0 + Phase 2: deployed @42, commits `cda57b1` (code+docs) + `65cea43` (post-deploy timestamp). Backward-compatible both directions, so rollback path is "redeploy v11.16" if anything misbehaves. On-device confirmation pending — user needs to force-reload the PWA so the v26 service worker activates, then verify the Setup tab shows v0.17.0 / v11.17 and the Categorize tab still functions normally.
- Trigger-health detection (PWA reads `LAST_TRIGGER_RUN`, warns if stale) deliberately deferred — manual Parse pill is a sufficient escape hatch and we have no real evidence the trigger silently fails.

---

## Session: 2026-04-29 — Goal archive flow (v11.18)

### Setup
User reported: *"the savings tab / setup tab is not working as intended, I finished the savings goal Banff, and I clicked archive in setup but it is still present in budget sheet."* The Banff savings goal was achieved (trip booked / spent the money), the user manually checked Setup col F (Archived?) for the linked sub-category, and expected the Banff row to disappear from the Budget tab. It didn't.

### Diagnosis
Direct file read of `apps-script/Code.js` showed three uncoupled concerns:
1. `handleCategories_` (Code.js:262+) — already filters Setup col F since v11.14. PWA dropdown was correctly hiding Banff.
2. `rebuildBudgetInternal_` (Code.js:3109+) — reads Setup `D2:E100`, ignores col F. Comment at line 1885–1887 documented the design intent: *"Archived rows are filtered from PWA dropdown but kept in Setup so historical Budget rebuilds preserve their data."* That decision was the source of the user's surprise.
3. `handleArchiveGoal_` / `handleUnarchiveGoal_` (Code.js:1095+, v11.14) — DO atomically set Saving col J + flip Setup col F + return result. But: registered in `routeAction_` and otherwise dormant. No PWA caller, no menu wrapper. The "right" archive flow was unreachable from any UI.

So three separate paths existed, each doing one slice of "archive" — none of them tied together for the user.

### Design
Three options offered to user:
1. Minimal — just filter `rebuildBudgetInternal_` by Setup col F. ~10 min. Required user to also remember to manually update Saving col J + run Update Script.
2. Proper — add `Archive Goal...` / `Unarchive Goal...` menu items that wrap the existing endpoint internals + force a Budget rebuild. ~30 min. Atomic.
3. Best UX — PWA-side archive button. 1–2 hours. Defers a working sheet-side action.

User chose Option 2 with these specific decisions:
- **Drop Cancelled status** — single menu defaulting to Achieved. User can edit Saving col J manually if they ever want the Cancelled label.
- **Disclose data loss in confirmation prompt** — opt-in to the destructive rebuild via YES/NO.
- **Pre-fill goal name from active Saving selection** — small UX win for the common "looking at the Banff row, archive this one" case.
- **Drop the "hide from PWA only" semantic** — archived = gone from Budget too. Symmetric.

### Implementation
v11.18 changes in `apps-script/Code.js`:
1. **Refactored** `handleArchiveGoal_` / `handleUnarchiveGoal_` into lockless internals (`archiveGoalInternal_` / `unarchiveGoalInternal_`) plus thin web-handler wrappers that take the lock + serialize JSON. Same pattern as `processInfoAlerts` / `processInfoAlerts_`. Lets the menu hold one lock across mutate + rebuild.
2. **Added duplicate-name detection** in `archiveGoalInternal_` — scans all Saving rows; if the goal name matches >1 row, fails with row numbers. Pre-v11.18 silently took the first match.
3. **`rebuildBudgetInternal_` filter** — read range `D2:E100` → `D2:F100`; emit-list adds `&& catRaw[c][2] !== true`. Symmetric to `handleCategories_`'s existing filter.
4. **`archiveGoalMenu` / `unarchiveGoalMenu`** — UI wrappers. Prompt for goal name (with pre-fill from active Saving selection + capped list of candidates), confirm with YES/NO disclosing data loss, take script lock, call internal, force `rebuildBudgetInternal_('rebuild', ss)`, log to Logs tab, show result. Rebuild failure is caught and surfaces a "rebuild failed; run Update Script to retry" message rather than crashing.
5. **`promptForGoalName_(ui, verb)`** — shared helper. Filters by verb ('archive' shows Active goals; 'unarchive' shows Achieved/Cancelled). Pre-fills if user has a Saving-tab row 6+ selected and that row's name is in the candidate list.
6. **Two new menu items** under Budget Tools, placed between "Add Category" and "Parse Emails": "Archive Goal..." and "Unarchive Goal...".
7. **Bumped APP_SCRIPT_VERSION** → v11.18 + matching version pointers in CLAUDE.md / task_plan.md / progress.md / findings.md.

### Status — VERIFIED WORKING
- v11.18 deployed @43 (commits `74018cd` code+docs, `eeaf637` post-deploy timestamp).
- User confirmed 2026-04-29: Archive Goal flow works end-to-end. Banff archive removed the row from Budget tab; menu items appeared after sheet reload.
- Trip-up #29 added covering the new flow + the still-possible manual-col-F failure mode where Saving and Setup tabs disagree.
- Rollback path (unused): revert the `rebuildBudgetInternal_` filter line. That alone restores Budget behavior; the new menu items become harmless no-ops.

---

## Session: 2026-04-30 — PWA pixel UI redesign (v0.18.0 → v0.19.1) + Claude Code workflow tooling

### Setup
Two parallel work streams from the same multi-day session:

1. **Pixel UI redesign**: user shared a Claude Design "PWA V2" handoff bundle proposing a terminal/pixel UI aesthetic (dark surfaces, JetBrains Mono everywhere, stepped progress bars, multi-select category rail). Asked to implement cautiously as suggestions, not must-haves; branch-only deploy with theme toggle so mono stays available. Wanted phased rollout with each phase rollback-able.
2. **Claude Code workflow tooling**: after the pixel UI work, user asked whether Claude Code features (settings, hooks, slash commands, status line) could improve daily workflow + help future Claude sessions ramp faster. Their existing setup was already strong (extensive CLAUDE.md, working skill, pre-commit hook, deploy alias) but project-level Claude Code features were unused.

### Design (pixel UI)
Read the Claude Design handoff bundle (HTML/CSS/JSX prototypes + chat transcript at `pwa-v2/chats/chat1.md`). Key insight from the chat: "Pick a category → assign matching transactions" is the receipt-sorting metaphor; old flow ("pick transaction → pick category") is for "what is this?" while new flow is for "what belongs here?". Both have value — multi-select rail wins on backlog clearance, picker wins for one-off categorization. Decision: ship rail as primary, picker as fallback when no chip is armed.

For all visual phases, designed as a CSS overlay: `css/pixel.css` scoped via `:root[data-theme="pixel"]` so all rules are inert until the attribute flips. Same DOM, same JS-flow. Backward-compat with mono CSS preserved via the same CSS-variable layer.

### Implementation (pixel UI — five sub-phases on `pwa/pixel-ui-redesign`)

**v0.18.0 (Phase A+B+C):** Theme infrastructure (early `<head>` script, `data-theme` attribute, two-stylesheet load, Settings toggle UI). Color palette flip + JetBrains Mono. Stepped progress bars. Single amber accent stripe on dashboard cards.

**v0.18.1 (Phase D):** Period bar today chip ("[27]" amber-bracket day-of-month, hidden in mono). Calendar dropdown restyled (dashed border, amber numerals, outlined cursor box for today). Touched both `categorize.js` and `dashboard.js` `renderPeriodBar` (~6 lines each, kept in sync via comments).

**v0.18.2 (Phase C+):** Two real bugs fixed from Phase C — `.cat-bar` was 1px tall in mono so the stepped gradient was invisible (bumped to 4px); `.cat-group-header` had `bg-selected` background that painted over the new accent stripe (switched to transparent + indented 22px). Plus polish: sticky summary strip, dotted within-group borders, green toggle glyph.

**v0.19.0 (Phase G):** Multi-select category rail. State machine: IDLE → ARMED → ARMED+SEL with explicit clear on chip-switch (overriding mockup's footgun keep-selection-on-switch). Backend untouched (`handleBatchCategorize_` already supports many items). Picker stays as fallback for no-chip-armed quick-categorize. Mono theme also gets the rail with simpler styling.

**v0.19.1 (branch fixes after on-device testing):** User reported (a) summary strip values wrapping (`−$1,948.00` broke onto two lines on iPhone), (b) tab bar felt frozen on tap (no visual feedback during lazy-mount window), (c) pixel theme defaulted to mono on cold start. Fixes: pixel summary 18px → 14px + `white-space: nowrap`; new `#tab-bar .tab:active` rule paints pressed tab immediately; early script hardcodes `data-theme="pixel"` on this branch + theme toggle UI removed from Settings. Mono CSS preserved as structural foundation; rollback is single-commit revert.

### Implementation (workflow tooling — two commits on `main`)

**`.claude/settings.json` + `.claude/state-check.sh` (commit 59ec80d):**
- Permission allow-list: ~18 read-only diagnostic Bash commands no longer prompt.
- Deny-list: 9 destructive operations blocked outright.
- SessionStart hook runs `state-check.sh` (~305 ms): outputs branch + sync state vs origin + uncommitted count + last 5 commits + version pointers with DRIFT warning if Code.js ≠ VERSION.txt.

**Slash commands + status line (commit 8214e65):**
- `/state`, `/lint`, `/deploy "<desc>"` as skills under `.claude/skills/`.
- `.claude/statusline.sh` (~176 ms): persistent display `<branch>[ *<dirty>] · <as-version>[⚠]`.

Both commits merged into pixel branch via `git merge main`. Tooling lives on main as the canonical home; pixel branch inherits via merge.

### Status — VERIFIED WORKING
- **Pixel UI:** v0.19.1 on `pwa/pixel-ui-redesign` deployed via GitHub Pages branch source. User confirmed on-device that summary strip no longer wraps, tab bar gives instant tap feedback, and pixel is the default theme on cold start. Multi-select rail works as designed. NOT merged to main pending broader confirmation; main stays at v0.17.0 / cache v26.
- **Workflow tooling:** on main + merged into pixel branch. Will activate at next session start (skills register at session start, not mid-session — see trip-up #30).
- **Two new trip-ups added:** #30 (skills mid-session) + #31 (pixel branch defaults).
- **Rollback paths preserved everywhere:**
  - Pixel UI: don't merge to main, OR switch GitHub Pages source back to main, OR revert v0.19.1 commit to bring the toggle back.
  - Tooling: revert the two tooling commits on main.
  - Mono CSS in `style.css` is structurally complete and untouched; pixel.css is purely additive.
- **Open from this arc (deferred):** Phase E (pixel SVG tab icons), Phase H (animated sync stage). Phase F (goal expand-on-tap) was already implemented in v0.15 — only needed CSS polish, which Phase C+ handled.

---

## Session: 2026-05-04 — Budget tab Rolled Over column (v11.19) + paired PWA parser fix queued

### Setup
User flagged a real confusion case from the dashboard: Groceries showing "$0.00 LEFT" with "$0 spent / $98 budget" beneath. Mathematically this looked wrong — budgeted $98 minus spent $0 should leave $98, not $0. The actual reason: $98 of overspend from the prior period rolls forward and reduces this period's Available to $0. The math has always been correct; the user just couldn't see the rollover term because it was buried inside the Available formula's compound expression.

User asked to add an explicit Rolled Over column to the Budget tab between Spent and Available, with paired PWA work for the new column position. Stated preference: sheet first, verify, then PWA.

### Design
Decisions made via planning conversation (5 open questions answered):
1. **Column placement**: between Spent (E) and Available (G). Reading left-to-right tells the story: planned in (Budgeted) → out (Spent) → carried in (Rolled Over) → result (Available).
2. **Column name**: "Rolled Over".
3. **PWA cat-sub label enhancement** (showing rolled in the existing label): defer for follow-up.
4. **Deploy timing**: sheet first, verify, then PWA.
5. **Named range**: add `Budget_RolledOver` mirroring the existing `Budget_Available` / `Budget_Budgeted` naming.

Key insight: the SUMIFS recursive lookup that used to live inside `buildAvailableFormula_` extracts cleanly to a new helper. Available simplifies to pure arithmetic (`F + D - E`); the carryover chain runs through Rolled Over instead. No circular reference because Sheets evaluates rows in dependency order — period 1 (Rolled Over = 0 by the MATCH > 1 guard) → period 2 (Rolled Over depends on period 1's Available, which is now resolved) → ... and so on.

### Implementation (v11.19)
`apps-script/Code.js`:
- New `buildRolledOverFormula_(row)` — the SUMIFS-on-prior-period-Available lookup, with the MATCH > 1 guard against the period-1 INDEX-with-row-0 circular-reference bug (preserved from v10.4).
- Simplified `buildAvailableFormula_(row)` — now `=F + D - E`.
- `rebuildBudgetInternal_` — header writes 7 cols (was 6) with "Rolled Over" between Spent and Available. Data rows extended to 7 cols. New `formulasEFG` block writes E (Spent SUMIFS), F (Rolled Over), G (Available) in one `setFormulas` call. Currency format extended to cols D-G (4 cols, was 3). `autoResizeColumns(1, 7)`. Slicer range covers 7 cols.
- `setNamedRanges_` — added `Budget_RolledOver` = F8:F500. `Budget_Available` shifted from F8:F500 → G8:G500. Saving tab + dashboard formulas reference by name; the column shift is transparent.
- `APP_SCRIPT_VERSION` v11.18 → v11.19. VERSION.txt + 4 doc version pointers updated.

Deployed @44. Two commits on main: `5b76c1b` (code + minimum doc sync) + `8313d30` (post-deploy timestamp).

### User verification (2026-05-04)
User ran `Budget Tools → Update Script` in their sheet, confirmed:
- New Rolled Over column appeared between Spent and Available.
- Existing user-entered Budgeted values preserved across the wipe-and-rebuild (via `budgetedMap`).
- Sensible values throughout: period 1 = $0 (no prior to roll from); subsequent periods = prior period's Available for the same sub-category.
- Available column still computes to the same numbers as before — math unchanged, just decomposed into two columns.
- Groceries case now self-explanatory: Rolled Over = −$98 (prior overspend), Budgeted = $98, Spent = $0, Available = $0. The reason "$0 LEFT" is no longer mysterious.

### Status — VERIFIED WORKING (sheet + PWA both shipped)
- Apps Script v11.19 deployed @44; user confirmed working.
- PWA paired fix v0.17.1 shipped on main (commit `ff46930`): `parseDashboard` now reads `row[6]` as available + `row[5]` as new `rolledOver` field. Cache key bumped to `budget_dashboard_cache_v2` to invalidate pre-v11.19 cached data.
- Pixel branch merged main + bumped to v0.19.3 / cache v33 with the same parser fix.
- Trip-up #32 added to CLAUDE.md covering the schema-change-breaks-PWA pattern (with #30 and #31 from the pixel branch already in place).
- Phase 27 entry in task_plan.md.
- Findings architecture section "Budget Tab Schema Evolution (v11.19)" added.
- Rollback path (unused): revert commits `5b76c1b` + `8313d30` (Apps Script) + `ff46930` (PWA parser) and run Update Script again. budgetedMap survives; user data preserved.

---

## Session: 2026-05-09 — Pixel UI graduates to main + FIXED accordion polish (v0.19.4 → v0.19.6)

### Setup
After living with pixel UI on the `pwa/pixel-ui-redesign` branch for ~10 days (v0.18.0 → v0.19.3), user shipped three more refinements via the FIXED accordion arc and then asked to make pixel branch the canonical main.

### FIXED accordion arc (three commits)

**v0.19.4 — accordion infrastructure.** Tap the FIXED summary cell on Dashboard to expand a panel between summary strip and category groups. Implementation per WAI-ARIA APG accordion pattern + a research brief on iOS Safari edge cases (avoid `<details>`/`<summary>` in grid contexts; use custom `<button>` + aria-expanded + aria-controls; `hidden` attr toggles; no animation). New `dueDatesInPeriod` helper in `periods.js` mirrors sheet's `buildFixedExpensesFormula_` so client-side total reconciles to Budget!B4. Cache key bumped to invalidate pre-v0.19.4 cached data shape.

**v0.19.5 — sticky containment fix.** User reported period bar not sticking on long scrolls. Root cause: `.period-bar` was sticky but its containing block (`#period-bar-host`) was shrink-to-fit, so sticky could only act within ~60 px. Fix: promote sticky to the host element, which spans the full dashboard scroll range. CSS-only one-rule addition.

**v0.19.6 — sticky FIXED panel + drop header + highlight cell when open.** User principle: anything toggleable from a sticky element should remain reachable. Made `.fixed-panel` sticky at `top: env-inset + 108px` (z-index: 6, just below summary strip's 7). Removed the in-panel "Fixed expenses · <period> · <total>" header (the total was already in the summary cell above; the period was already in the period bar). Added highlight on `.summary-cell-toggle[aria-expanded="true"]` — amber label + chevron + slight bg tint, matching period bar's "armed" treatment. Two commits because the dashboard.js header-removal edit raced with a file refresh (`6d9650e` shipped CSS + version bumps; `ed7da6e` actually removed the head element).

### Pixel UI graduation to main

User asked to make pixel branch the canonical main. Plan + 5 open questions answered: --no-ff merge (preserves history), keep pixel branch around as snapshot, user handles GitHub Pages source switch.

Steps executed:
1. Tagged main as `main-pre-pixel-merge` (PWA v0.17.2 / cache v28); pushed tag to origin.
2. Switched to main; merged `pwa/pixel-ui-redesign --no-ff`.
3. Three conflicts (config.js, sw.js, dashboard.js's panel-head removal). All resolved to pixel's version (the desired state).
4. Doc files auto-merged cleanly (pixel branch's docs were ahead).
5. Doc cleanup: dropped "branch is force-pixel; NOT yet merged" framing across CLAUDE.md / task_plan.md / progress.md / findings.md. Trip-up #31 rewritten — now reads "main is force-pixel" (was "the pwa/pixel-ui-redesign branch is force-pixel"). Phase 25 status updated to "merged to main 2026-05-09 (commit `<sha>`)".
6. Lint clean.
7. Pushed main to origin (single non-force push — the `--no-ff` merge commit did the work).

### Status — VERIFIED WORKING (merge complete; pending Pages source switch)
- main now at PWA v0.19.6 / cache v36 (was v0.17.2 / cache v28).
- All pixel branch content lives on main: pixel.css, force-pixel `<head>` script, multi-select rail, today chip, terminal calendar, sticky period bar, sticky FIXED panel, accordion + highlight.
- The `pwa/pixel-ui-redesign` branch is preserved on remote as a snapshot (per user request — keep around) but no longer active for development.
- `main-pre-pixel-merge` tag is the rollback handle (PWA v0.17.2 / cache v28).
- **User next step:** switch GitHub Pages source from `pwa/pixel-ui-redesign` back to `main` in repo Settings → Pages (if it was previously pointed at the pixel branch for preview).
- No Apps Script change in this session (still v11.19 @44).
- Rollback path (unused): `git checkout main && git reset --hard main-pre-pixel-merge && git push origin main --force` (force-push needs explicit user permission since it's denied by `.claude/settings.json`).

---

## Session: 2026-05-13 — Cold-Start Round 2 (Apps Script v11.20 + PWA v0.19.7 → v0.19.8)

### Setup
After the rulepop architecture comparison surfaced "what could we borrow?", user asked which of the three perf proposals were actually worth implementing. Re-verified each against measured data before writing any code:
- Pulled Phase 22 ClientMetrics findings: cold Categorize mount = 7,348-9,038 ms; per-call network tax = ~2,500 ms; period switch = pure client-side, no measured complaint.
- Counted commits touching `sw.js`: 38 — most are CACHE_VERSION bumps. Real workflow tax but each is one line.
- Audited bytes: total JS = 131 KB uncompressed, ~50 KB gzipped already.

Outcome: build step rejected (workflow change disguised as perf), CSS period filter rejected (pre-rendering 26 periods would regress cold mount), bootstrap endpoint validated (~2.5 s saved per cold mount on documented network tax). One bonus emerged from inspection: cache-first paint on Dashboard cold open. Plus a free preconnect hint.

### What shipped

**Phase 29.1 (PWA v0.19.7, no Apps Script changes):**
- `index.html`: two `<link rel="preconnect">` tags for `script.google.com` + `script.googleusercontent.com`. Browser warms TLS while HTML parses; first call after cold open finds the connection ready (~100-500 ms saved).
- `js/views/dashboard.js mount()`: synchronous `peekDashboardCache()` (already exists since v0.19.0) → paint immediately if cache exists → `load()` runs in background. Same pattern `store.transactions` got in v0.15.4 Fix #3. Cold open with stale cache: 5-7 s spinner → <50 ms paint.
- Bumped APP_VERSION v0.19.6 → v0.19.7, CACHE_VERSION v36 → v37.

**Phase 29.2 (Apps Script v11.20 + PWA v0.19.8):**
- `apps-script/Code.js`: new `handleBootstrap_(params)` wrapping `handleCategories_()` + `handleParseAndFetch_()` and returning merged JSON with per-section error fields. Wired into `routeAction_` as `'bootstrap'`. Honors `withParse`. Echoes `_bootstrapMs`. Both underlying handlers are lock-free and read different tabs — combining is purely additive on the server.
- `js/api.js`: new `bootstrap({withParse})` function.
- `js/views/categorize.js`: `categoriesPromise` → `bootstrapPromise`. New `startBootstrap_({withParse})` helper tries `api.bootstrap` first; on any failure (including old Apps Script returning "Unknown action: bootstrap" during a deploy gap, partial server failure, network error) falls back to the v0.15.4 `Promise.all([fetchCategories, parseAndFetch])` pattern transparently. Categories side-effect (`store.setCategories` + render) applied inside the helper so cold mount's chip rail populates before refresh completes.
- Bumped APP_SCRIPT_VERSION v11.19 → v11.20, APP_VERSION v0.19.7 → v0.19.8, CACHE_VERSION v37 → v38.

### Backward compat verified
- Old PWA + new Apps Script: PWA never calls bootstrap. Works.
- New PWA + old Apps Script: bootstrap fails with "Unknown action", `request()` throws, fallback fires. ~2.5 s wasted on first cold mount during deploy window only — mitigation is to deploy Apps Script BEFORE pushing PWA.
- New PWA + new Apps Script: bootstrap path used, ~2.5 s saved per cold mount.

### Status — code complete + syntax-clean, awaiting deploy
- Apps Script v11.20 must deploy from user's laptop FIRST: `cd apps-script && ./deploy.sh "v11.20 — bootstrap endpoint for cold-mount perf"`. The `clasp` workflow constraint hasn't changed.
- PWA v0.19.7 + v0.19.8 changes auto-deploy when pushed to main.
- Verification post-deploy (real ClientMetrics): `bootstrap` rows with `Ok=true`, `mount:categorize ClientTotalMs` ≈ 4,800 ms ± 1 s on cold sessions (down from 7,300+), Dashboard cold-open with stale cache paints in <200 ms.
- Phase 29 entry in task_plan.md.
- Findings architecture section "Cold-Start Round 2" added — covers all three fixes, validation methodology, edge cases, rollback handles, and 5 lessons.
- No new trip-up added (the lessons here are validation methodology + perf-vs-workflow distinction; both belong in findings, not in the bug-trap list).

### Rollback handles
- PWA v0.19.7: `git revert <v0.19.7-commit>` (touches index.html, dashboard.js, config.js, sw.js).
- PWA v0.19.8: `git revert <v0.19.8-commit>` (touches api.js, categorize.js, config.js, sw.js). Apps Script unchanged.
- Apps Script v11.20: not needed (additive). To roll back: redeploy v11.19, bootstrap becomes "Unknown action", PWAs fall back to dual fetch.

---

## Session: 2026-05-14 — Duplicate Parsing + Period Bug Investigation + Fix (Apps Script v11.21)

### Setup
User noticed duplicate transactions in the PWA, asked to diagnose by comparing Gmail (source of truth, via newly-added Gmail connector) against sheet against PWA. After initial investigation found duplicates from Gmail thread re-iteration, user instructed "re-analyse the problem with no assumptions, there may be other issues we are missing." Second pass discovered a SECOND critical bug: silent data loss on last-day-of-period transactions.

### What I investigated

1. Pulled Scotiabank info-alert emails from Gmail using parser's exact filter (`from:infoalerts@scotiabank.com subject:"Authorization on your"`).
2. Got API key from user, pulled Transactions tab via dumpSheet (133 data rows).
3. Pulled PayPeriods config (Setup A:C), Logs tab (500 rows), ClientMetrics tab.
4. Read parser implementation (`processInfoAlerts_`, `shortHash_`, `uniqueSuffix_`, `buildTimestamp_`, `findNextEmptyRow_`, `setTransactionFormulas_`, `consolidateTransactionsRescue`).
5. Cross-referenced Gmail emails (67) against sheet rows (114 unique txns) → **0 missing transactions** confirmed.
6. Found 15 timestamp-duplicate groups (19 phantom rows, ~$435 over-count) → root cause was Gmail thread re-iteration (ladder pattern: oldest message in thread had most dupes).
7. Found 8 last-day-of-period transactions stuck at `period='Unassigned'` (~$165 stranded from Budget totals) → root cause was Date col having time portion vs PayPeriods End at midnight.

### What shipped (v11.21, single Apps Script deploy)

**Layer 1 — `shortHash_` widened 4→8 hex chars** (Bug 3 mitigation):
- 16-bit hash had birthday collision risk at ~256 distinct (merchant, amount) pairs.
- Widened to 32-bit (4.3B values) → essentially zero collision risk at personal-budget scale.
- Backward compatible — existing 4-char-hash rows still match by string equality.

**Layer 2 — Write-time timestamp dedup in `processInfoAlerts_` Step 3.5** (Bug 1 fix):
- Reads existing Timestamps from col H before write, filters newRows to drop any timestamp already in sheet.
- Logs `dedup_skip` count — becomes permanent tripwire for monitoring Gmail thread re-iteration.
- LockService already in place — no race window between read and write.

**Layer 3a — Parser normalizes Date col to midnight** (Bug 2 fix, parser side):
- `new Date(emailDate.getFullYear(), emailDate.getMonth(), emailDate.getDate())` — strips time portion.
- Timestamp col (H) still preserves full time for ordering.

**Layer 3b — Period formula wraps Date cell in `INT()`** (Bug 2 fix, formula side):
- `setTransactionFormulas_` now generates `Setup!$A$2:$A$27<=INT(A{tr})` (and `>=` similarly).
- Setup A/B values already midnight Dates — no INT() needed on Setup side.
- Defense in depth: parser change AND formula change. Either alone would fix it.

**Layer 4 — New `dedupeAndNormalizeTransactionsRescue` menu item**:
- One-shot cleanup for existing data: dedups 15 groups, normalizes Date col.
- LockService-protected, confirmation prompt, atomic write via consolidate-pattern.
- Idempotent — safe to re-run.

### Status — code complete + syntax-clean, awaiting deploy + cleanup run on user's laptop

Three steps in order:
1. `cd apps-script && ./deploy.sh "v11.21 — dup parsing + period bug fix"` (deploys Apps Script)
2. Open sheet → `Budget Tools → 3. Update Script (safe)` (installs new Period formula across all 999 rows)
3. Open sheet → `Budget Tools → Dedupe + Normalize Transactions (rescue)` (cleans existing data — confirmation prompt before destructive write)

Then verify: Budget tab Spent + Available totals look right, ClientMetrics shows no new `dedup_skip > 0` entries (or if it does, that's the fix actively rescuing — both are OK).

No PWA changes — backend-only fix preserves existing contract.

### Rollback handles
- Apps Script: `clasp deploy -i ... -d "v11.20"` (redeploy prior version). Cleanup script becomes dangling menu reference (won't crash, just unfound).
- Cleanup script run: no auto-rollback. Google Sheets revision history is the safety net.

### Patterns added to CLAUDE.md
- Trip-up #34: "Gmail's -label:X search has consistency lag — never rely on label exclusion alone for dedup."
- Trip-up #35: "Apps Script Date written to a sheet col keeps its time portion — formulas comparing against midnight Dates break on period boundaries."

### Phase 30 entry in task_plan.md; full architecture section in findings.md.

---

## Session: 2026-05-17 — Phase 30 deploy + cleanup verification + statement cross-reference

### What ran
- `./apps-script/deploy.sh "v11.21 — dup parsing + period bug fix"` — deployed to `@46` (still 7 total deployments — no accidental new URL). Production endpoint returned `{version: "v11.21", _elapsedMs: 374}`.
- Auto-commit of post-deploy timestamp bump (`667499e`).
- Pushed `81d6f74` + `667499e` to origin/main. GitHub raw VERSION.txt confirmed `v11.21`.
- User ran `Budget Tools → 3. Update Script (safe)` (installs new INT() Period formula across all 999 rows).
- User ran `Budget Tools → Dedupe + Normalize Transactions (rescue)` (cleanup of 19 phantom rows + 8 stranded 'Unassigned').
- User attached Scotiabank statement xlsx (`Scene_Visa_card_9017_051726.xlsx`) covering Apr 7-30 billing cycle as a third source of truth.

### Cleanup verification (sheet re-pulled via dumpSheet post-cleanup)
| Check | Before | After | Expected |
|---|---|---|---|
| Sheet rows | 133 | **114** | 114 (−19 phantom rows) ✓ |
| Duplicate timestamps | 15 groups | **0** | 0 ✓ |
| 'Unassigned' period rows | 8 | **0** | 0 ✓ |
| Date column time portions | All rows | **0** | 0 ✓ |

Phase 30 worked exactly as designed. Both Bug 1 (duplicate parsing) and Bug 2 (last-day silent loss) are resolved in existing data + the parser is defended against future re-occurrence.

### Statement cross-reference findings (NEW issue surfaced, not Phase 30)
Cross-referenced 93 statement debits against the post-cleanup sheet rows in the same date window:
- **61 exact matches** (same date + amount)
- **3 date-offset matches** (auth date ±1-2 days from post date — normal credit card behavior; the matching code was overly strict on date equality)
- **29 statement entries with no Gmail info-alert ever fired** = $1,627 of spending invisible to PWA
- **9 sheet entries with no matching statement line** — mix of: (a) other card (`4537*****606****` is a different card from the statement's `9017`), (b) gas/hotel pre-auths that settled for lower amounts, (c) txns from older billing cycle

The 29-entry coverage gap is **upstream** of the project — Scotiabank info-alerts predominantly fire for in-person card-present transactions (chip/tap) but skip many online merchants (Amazon, Apple Bill, ChatGPT, Zotero, ClickUp, etc.), recurring subscriptions, and some transit/parking apps. Documented as "Statement vs PWA Coverage Gap" observation in findings.md.

### Status — VERIFIED WORKING (Phase 30 fully complete)
- Apps Script v11.21 live at deployment `@46`.
- All Phase 30 commits pushed to origin/main.
- Phase 30 status in task_plan.md updated from "awaiting deploy" → "complete + verified working".
- New "Statement vs PWA Coverage Gap" observation added to findings.md covering the 29-txn upstream gap + pre-auth-vs-settled + two-card setup nuances.
- No follow-up coding work needed. If user wants to close the upstream coverage gap, options (statement import, manual entry, third-party data source) are noted but explicitly NOT in Phase 30 scope.

### Rollback (unused)
- Apps Script: redeploy v11.20 via clasp (cleanup function becomes dangling menu reference, no other effect).
- Cleanup script run: Google Sheets revision history (`File → Version history → See version history` → restore to a point before 2026-05-17).

---

## Session: 2026-05-17 (later) — Instructions tab refresh (Apps Script v11.22)

### Setup
User: "the instructions sheet on the google sheet needs to be updated." Last comprehensive rewrite was Phase 13b (v10.3) — 11 Apps Script versions ago. Drift catalog:
- Missing menu items: `Archive Goal...`, `Unarchive Goal...` (v11.18), `Setup Email Trigger`, `Remove Email Trigger` (v11.16), `Dedupe + Normalize Transactions (rescue)` (v11.21)
- Missing tab: `ClientMetrics` (v11.13)
- DAILY USE step "Tap Refresh — pulls new uncategorized transactions" obsolete since v11.17 made parseAndFetch read-only (hourly trigger handles parsing)
- SAVING GOALS "When goal is achieved: just stop budgeting" — outdated; v11.18 added the atomic `Archive Goal...` menu
- DO NOT formula-cols warning "B, E, F" missed Budget col G (Rolled Over added v11.19)
- FOR DEVELOPERS deploy command was the long form; `deploy "vXX"` shell alias is shorter and now standard

### What shipped (v11.22, content-only — no behavioral change)
Targeted refresh of 7 sections in `buildInstructionsTab_` rows[] array. No function structure changes; just content updates.

### Status — awaiting deploy + Update Script
Same pattern as Phase 30:
1. `./apps-script/deploy.sh "v11.22 — instructions refresh"`
2. User runs `Budget Tools → 3. Update Script (safe)` to re-render the Instructions tab.

After Step 2, eyeball the Instructions tab to confirm new menu entries appear.

### Rollback
Trivial — redeploy any prior version. No data side effects. Tab protection is warning-only, so user can also edit individual lines manually if a single entry is wrong.

---

## Session: 2026-05-17 (later) — Reports tab (Apps Script v11.23)

### Setup
User: "I want to start including reports in the google sheet. For now the information I want to know is how much spending is being done in each category (including savings and fixed) across a time frame (daily, weekly, per period, monthly, yearly etc). I also want the option to get a detailed look at each category (list of all transactions assigned). Thoroughly plan the best way to do this."

### Process (planning-first per user direction)
1. **Compared 4 approaches**: A (single formula-driven tab) vs B (Apps Script generation on menu) vs C (multi-tab per time-frame) vs D (formula summary + native Pivot Table). Recommended A for live updates + custom date range support + consistency with existing patterns.
2. **User picked Option A** + answered design questions (Q1a/Q2a/Q3b + defaults for Q4-Q10).
3. **HTML mockup built first** using real Apr 29 - May 12 data from user's sheet, rendered via Claude Preview, screenshotted, user confirmed "thats perfect" before any code changes.
4. **Implementation**: ~450 LOC across 5 new functions in Code.js. Wired into buildWorkbook + updateWorkbook + Instructions tab. Single deploy + single Update Script run = ready.

### What shipped (v11.23 — single deploy)
- New `buildReportsTab_(reports, ss)` — tab setup (color #5c6bc0, widths, freeze rows 1-5, hide cols past F)
- New `applyReportsStructure_(reports, ss)` — all formulas + formatting (~400 LOC)
- New `buildReportsFromFormula_()` / `buildReportsToFormula_()` — date-range formula generators using IFS switch on Time-frame dropdown
- New `buildFixedExpensesFormulaByRange_(fromCellRef, toCellRef)` — variant of `buildFixedExpensesFormula_` accepting raw From/To cell refs instead of a PayPeriods_Label
- Wired `buildReportsTab_` into `buildWorkbook` (creates Reports tab on initial build) + `updateWorkbook` (rebuilds on Update Script)
- Instructions tab TABS section updated to list Reports

### Status — awaiting deploy + Update Script run on user's laptop
Same pattern as prior phases:
1. `./apps-script/deploy.sh "v11.23 — reports tab"` (deploys Apps Script)
2. Sheet → `Budget Tools → 3. Update Script (safe)` (creates / refreshes Reports tab)
3. Open the new Reports tab → defaults to "This Period" → verify formulas render correctly.

### Verification post-deploy
Open the Reports tab. Should show:
- Indigo tab accent (#5c6bc0)
- B2 dropdown defaults to "This Period"; From/To populate to current period dates
- Income section with paycheck row (green)
- Spending section sorted desc by Spent; zero-spend categories filtered out
- Fixed Expenses row showing ~$2,334 (sum of all 14 fixed monthly entries due in range)
- TOTAL row at row 51 = Total spent from F7
- Drill-down: pick "Groceries" → should show 9 transactions with $200.47 total

### HTML mockup workflow (new pattern for future feature work)
For visually-significant features, mockup-then-build worked well: built `reports-mockup.html` with real data, rendered via `mcp__Claude_Preview__*` tools + Python http.server, screenshotted via `preview_screenshot`, user confirmed before any Apps Script changes. Temp files (`reports-mockup.html` at project root, `.claude/launch.json` preview-server config) cleaned up at commit time.

### Rollback
Apps Script: redeploy v11.22. Reports tab will stop being rebuilt by Update Script; can be deleted manually if user wants it gone entirely. No data side effects elsewhere — the Reports tab is purely a READ view over Transactions/Setup/Fixed Monthly Expenses.

---

## Session: 2026-05-17 (later) — Reports bug-fix pass (Apps Script v11.24)

### Setup
User tested v11.23 Reports tab with "Last Period" dropdown. Two issues surfaced:
1. **Fixed Expenses showed $0.00** (should be $2,333.99 for Apr 29 - May 12 since all 14 fixed monthly entries are due day 1 and May 1 falls in range).
2. **Total Spent $630.87 didn't match the per-category breakdown** which summed to $485.48 — gap of $145.39 (3 uncategorized transactions).

### Diagnosis
1. **Fixed Expenses bug**: dumpSheet'd the Budget tab dashboard B4 (Fixed Expenses for current "May 13 - 26" period) — also shows $0.00. Confirmed bug is in the SHARED formula structure used by both `buildFixedExpensesFormula_` (Budget tab) and `buildFixedExpensesFormulaByRange_` (Reports tab). Root cause: `FixedExpenses_DueDay` named range covers C2:C50 (49 rows) but user has only ~14 entries; rows 16-50 are blank. `DATE(year, m, "")` for blank cells returns `#VALUE!`, propagates through SUMPRODUCT, caught by outer IFERROR → silent $0. **Bug had been latent in Budget tab since the formula was introduced** — invisible because most pay periods don't contain a day-1, so $0 was correct by accident.

2. **Uncategorized bug**: dumpSheet'd Transactions in Apr 29 - May 12 period grouped by category. Found 3 rows with empty Category column totaling -$145.39. Total Spent formula sums all negative-amount transactions in range, including uncategorized. But the per-category breakdown uses `BYROW(CategoryList, LAMBDA(cat, SUMIFS(...)))` which only iterates configured Setup categories — uncategorized txns invisible in the breakdown table.

### What shipped (v11.24)

1. **Fixed Expenses formula fix** (applied to BOTH `buildFixedExpensesFormula_` and `buildFixedExpensesFormulaByRange_`):
   ```js
   ddRaw, FixedExpenses_DueDay,
   dd, IF(ddRaw="", 1, IFERROR(ddRaw*1, 1)),  // safe number, blanks → 1
   valid, (amt<>"") * (ddRaw<>""),             // blank rows still contribute 0
   ```

2. **Uncategorized row** added at Reports row 50:
   - Amber color treatment (`#b45309`) + italic for visual differentiation
   - Always shown (even when $0 — passive reminder)
   - Sparkline only renders if amount > 0
   - Fixed Expenses shifted to row 51, TOTAL to row 52
   - CF rule for Fixed updated from C50 → C51
   - F7 (Total Spent) formula updated: `+ $C$50` → `+ $C$51`

3. **No PWA changes.** No data migration needed.

### Status — awaiting deploy
- Run `./apps-script/deploy.sh "v11.24 — reports fixed-expenses + uncategorized fixes"`.
- Sheet → `Budget Tools → 3. Update Script (safe)` to re-render Reports tab.
- Verify: Reports tab "Last Period" → Fixed Expenses shows ~$2,334; Uncategorized row appears at row 50 showing 3 txns / $145.39 (or whatever the current count is); breakdown sums to Total Spent visibly.

### Bonus side-effect
Budget tab's Fixed Expenses dashboard cell (B4) now also computes correctly for periods containing day-1 — was silently $0 before for those periods (user wouldn't have noticed because Budget B1 auto-snaps to current period which typically doesn't contain day-1).

### Rollback
Redeploy v11.23 (or earlier). Bug reverts but no data damage.

---

## Session: 2026-05-18 — Reports tab removed; slicers adopted (Apps Script v11.25)

### Setup
User: "I added slicers to the transactions tab (for period and category) and it seems to provide much of the information that the reports section did. I may remove the reports page and use the slicers instead. Why do some merchants have the same # still (row 97 and 98)? I want to stick with the slicer function. I deleted the reports tab. Can you update the app script and the .md files to reflect these changes."

User had been live for ~24 hours with the Reports tab from v11.23/v11.24. Then discovered native Sheets slicers (the green chip dropdowns on the Transactions tab) covered the same use case more simply. Decided to remove Reports and asked for the Apps Script to be cleaned up so future `Update Script` runs wouldn't recreate the tab.

Also: question about why two rows (97 and 98 — both SHOPPERS DRUG MART #0387 on May 9) have the same store number. Answer: the `#0387` is the store identifier in Scotiabank's merchant string. The same physical Shoppers location issues the same store number for every transaction; rows 97 and 98 are TWO distinct purchases at the SAME store on the same day (3 minutes apart, different amounts $16.79 and $10.96). Not a duplicate.

### What shipped (v11.25, single deploy)
Removed ~500 LOC of Reports plumbing:

- `buildReportsTab_(reports, ss)` (tab setup) — deleted
- `applyReportsStructure_(reports, ss)` (~400 LOC of formulas + formatting + CF) — deleted
- `buildReportsFromFormula_()` / `buildReportsToFormula_()` (date-range formula generators) — deleted
- `buildFixedExpensesFormulaByRange_(fromCellRef, toCellRef)` (only used by Reports — dead code) — deleted
- `buildWorkbook`: `'Reports'` removed from `tabNames` array; `buildReportsTab_` call site removed; alert text 7→6 tabs
- `updateWorkbook`: entire Reports rebuild block removed (was at lines ~2627-2633)
- `buildInstructionsTab_`: "Reports — Spending by category for any time frame + drill-down (v11.23)" line removed from TABS section

### What was kept
- `buildFixedExpensesFormula_` with the v11.24 blank-`FixedExpenses_DueDay` guard — used by Budget tab dashboard (B4). The guard was a real bug fix independent of Reports; reverting it would re-introduce silent $0 for periods that contain a day-1.
- Two historical-context comments in `buildWorkbook` and the `buildFixedExpensesFormula_` docstring referencing Reports — left as breadcrumbs so future Claude sessions understand why the helper exists in its current shape.

### Status — awaiting deploy + Update Script
1. `./apps-script/deploy.sh "v11.25 — remove reports tab; slicers adopted"`
2. Sheet → `Budget Tools → 3. Update Script (safe)` to re-run the build path (no Reports tab will be created)
3. Verify: Reports tab does NOT reappear after Update Script

### Rollback
- Redeploy v11.24 + Update Script → Reports tab gets recreated.
- Slicers stay on Transactions tab regardless of which version is deployed (they're sheet-level, not Apps Script-managed).

### Insight: build, ship, learn, kill
Reports tab existed for ~24 hours and was deleted because a native Sheets feature covered the same use case more simply. Three takeaways:
1. **Shipping the simplest viable version got us the feedback loop.** Without v11.23 deployed, the slicer pivot wouldn't have happened — the user only realized slicers worked when they had something tangible to compare against.
2. **Removing code is a feature.** ~500 LOC of formulas + formatting + heat-map CF + sparkline plumbing went away. The remaining system is smaller and easier to reason about than before Phase 32 started.
3. **Keep the bug fixes; lose the experiment.** v11.24's blank-dd guard in `buildFixedExpensesFormula_` was discovered while building Reports but is independent of it. Preserved.
