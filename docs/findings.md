# Findings & Decisions

> Reference document. Sections describe the system as it currently exists: **v11.22 Apps Script** (Phase 31 — Instructions tab content refresh: brought 7 sections of in-sheet Instructions in sync with current state after 11 versions of drift since Phase 13b — no behavioral change; v11.21 Phase 30 — duplicate-parsing fix + period-boundary fix: write-time timestamp dedup in `processInfoAlerts_` + widened `shortHash_` (4→8 hex) + parser normalizes Date col to midnight + Period formula wraps in `INT()` + `dedupeAndNormalizeTransactionsRescue` menu item for one-shot cleanup of 15 duplicate-timestamp groups + 8 stranded "Unassigned" rows; v11.20 Phase 29 — new `bootstrap` action returning categories + parseAndFetch in one round-trip, halves cold-mount network cost in the PWA; v11.19 Phase 27 Budget tab Rolled Over column; v11.18 Goal archive flow + Setup col F filter; v11.17 read-only `handleParseAndFetch_`; v11.16 hourly `processInfoAlertsTrigger`; v11.15 Budget B1 auto-snap; v11.14 archive endpoints; v11.13 `_elapsedMs` + `logClientMetrics` + ClientMetrics tab) + **v0.19.8 PWA on `main`** (cache v38; Phase 29.2 — Categorize cold mount uses bootstrap with transparent fallback to v0.15.4 dual fetch; Phase 29.1 — preconnect to script.google.com + cache-first Dashboard paint; pixel UI graduated to canonical on 2026-05-09 — multi-select category rail, FIXED summary-cell accordion with sticky panel; v0.19.3 paired with v11.19 — `parseDashboard` reads `row[6]` as available). v0.16.0 introduced persistent views; v0.15.4 was the original cold-start optimization. Single-ledger architecture + Saving tab with adaptive per-period formula. Bug-fix sub-sections are historical postmortems — the bugs are fixed, but the lessons are kept for future debugging. **v0.12 → v0.15.4 PWA restructure + redesign + metrics + cold-start optimization is documented below in "PWA Restructure (v0.12 → v0.14)", "Minimal Monochrome Redesign", "Client Metrics Pipeline", and "Cold-Start Optimization (v0.15.4)". Pixel UI overlay (v0.18.0 → v0.19.6) is documented under "Pixel UI Theme System", "Multi-Select Category Rail", and "FIXED Summary-Cell Accordion". Workflow tooling under "Claude Code Workflow Tooling". Budget tab Rolled Over column (v11.19) under "Budget Tab Schema Evolution". Cold-Start Round 2 (Phase 29) under "Cold-Start Round 2".**
>
> For current state and workflow: see `CLAUDE.md` (root) and `docs/task_plan.md`.
> For the integrated review work that produced v11.3-v11.6: see `docs/progress.md` 2026-04-19 entry.
> For deployment: see "⚠️ CRITICAL: Always update the existing deployment" below.

## Requirements — Budget Workbook
- 6-tab Google Sheet: Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Pending
- 26 bi-weekly pay periods covering all of 2026
- Net Income = Gross Pay - Fixed Expenses due within period (computed inline in Budget)
- Budget rollover: Available = Prior Available + Budgeted - Spent
- _income header row per period showing net income & unallocated
- Slicer on Budget tab for per-period filtering
- Apps Script functions: buildWorkbook, initializeBudget, updateWorkbook, addCategory, processInfoAlerts
- 15 named ranges total
- Data validation dropdown for Category in Transactions

## Requirements — Transaction Categorizer
- Parse Scotiabank infoalert emails from Gmail
- Write parsed transactions to Pending tab as queue
- Mobile PWA (GitHub Pages) for categorizing on phone
- Apps Script serves as backend API (doGet/doPost)
- Manual trigger — user controls when emails are parsed
- Dedup via timestamp (date+time from email)
- Credit card alerts only (debit TBD)

## Column Layouts (v6)

### Instructions Tab
- Single wide column (600px) with formatted guidance
- Blue tab color, protected with warning
- Color-coded: red (danger), yellow (caution), green (safe)

### Setup Tab (cols A–E; A–B hidden)
| Col | Header | Visible? | Type |
|-----|--------|----------|------|
| A | Period Start | **Hidden** | Date (= pay date; period 1 = Dec 25, 2025) |
| B | Period End | **Hidden** | Date (day before next pay date; period 26 = Jan 5, 2027) |
| C | Period Label | Yes | Formula: TEXT from A & B |
| D | Main Category | Yes | Text |
| E | Sub Category | Yes | Text |

### Fixed Monthly Expenses Tab (cols A–C)
| Col | Header | Type |
|-----|--------|------|
| A | Name | Text (user-editable) |
| B | Monthly Amount | Currency (user-editable) |
| C | Due Day | Number 1–31 (user-editable) |

**One row per expense.** No expanded date rows. Budget formulas auto-calculate which months' due dates fall in each period using SUMPRODUCT. Adding/removing expenses is instant — no script needed.

### Budget Tab (cols A–F, v10.5)
**Rows 1-6: dashboard (display-only, frozen)**
| Cell | Content |
|------|---------|
| A1 | "PERIOD:" label |
| B1 | Dropdown (data validation from PayPeriods_Label) — drives all dashboard formulas |
| E1 | "PROGRESS:" label |
| F1 | Formula: "Day X of Y (Z% elapsed)" using TODAY() and selected period start/end |
| A3:C3,F3 | Metric labels (Net Income / Fixed Expenses / Total Budgeted / READY TO ASSIGN) |
| A4 | `buildPaycheckFormula_($B$1)` — sum of Paycheck transactions in selected period |
| B4 | `buildFixedExpensesFormula_($B$1)` — SUMPRODUCT of fixed expenses due in selected period |
| C4 | `=IFERROR(SUMIFS(Budget_Budgeted, Budget_Period, $B$1), 0)` — sum of Budgeted across all categories for the period |
| F4 | `=A4 - B4 - C4` — Ready to Assign (color-coded: red <0, green =0, yellow >0) |

**Row 7: header** (Period | Main Category | Category | Budgeted | Spent | Available) — frozen with row 7

**Rows 8+: data** (no more `_income` rows; 8 sub-categories × 26 periods = 208 rows)

| Col | Header | Type |
|-----|--------|------|
| A | Period | Text (period label value) |
| B | Main Category | Formula: INDEX/MATCH from Setup |
| C | Category | Text (sub category name) |
| D | Budgeted | Manual entry (preserved across rebuilds via existingBudgetedMap) |
| E | Spent | Formula: -SUMIFS from Transactions |
| F | Available | Formula: rollover + budgeted - spent (with IF(MATCH>1, ..., 0) guard from v10.4) |

**Slicer:** anchored at (row 1, col 8). Filters by column 1 (Period). Created with `setColumnPosition(1)` after insertion — without that explicit call, the slicer has no filter column and breaks UX.

### Transactions Tab (cols A–H, v11.0+)
**The single ledger.** Holds all transactions, categorized or not. Empty Category = "needs categorization".

| Col | Header | Type |
|-----|--------|------|
| A | Date | Date (manual or from email) |
| B | Merchant | Text (manual or from email) |
| C | Amount | Currency (negative=purchase, positive=income) |
| D | Category | Dropdown from CategoryList (empty = uncategorized) |
| E | Main Category | Formula: `=IF(D="","",INDEX(Setup!D,MATCH(D,Setup!E,0)))` |
| F | Transaction # | Text (manual reference) |
| G | Period | Formula: `=IF(A="","",FILTER(PayPeriods_Label,...))` |
| H | Timestamp | Date/time (NEW v11.0; blank for manual entries; precise datetime from email parser; **PWA dedup key**) |

PWA flow: reads rows where `Category=""` AND `Timestamp` is set → user categorizes → backend writes Category cell of existing row (no copy/move).

### Pending Tab — REMOVED in v11.0
The Pending tab was eliminated in the v11.0 single-ledger redesign. Email-parsed transactions now write directly to Transactions tab with empty Category. Categorize updates the same row's Category cell.

Pre-v11.0 architecture (kept here for historical reference):
- Pending was a 7-col inbox with Timestamp + Date + Merchant + Amount + Email Subject + Status + Category
- Categorize moved row from Pending → Transactions (copy operation, prone to orphan-row bugs)
- v8 `findNextEmptyRow_` bug caused 8 rows to land at row 1001+ (invisible to Budget)

After migration: backed up to `Pending_Archive_<timestamp>` tab, then deleted.

## Named Ranges (15 total)
| Name | Tab | Range |
|------|-----|-------|
| PayPeriods | Setup | A2:C27 |
| PayPeriods_Label | Setup | C2:C27 |
| PayPeriods_Start | Setup | A2:A27 |
| PayPeriods_End | Setup | B2:B27 |
| CategoryList | Setup | E2:E100 |
| CategoryMain | Setup | D2:D100 |
| FixedExpenses_Amount | Fixed Monthly Expenses | B2:B50 |
| FixedExpenses_DueDay | Fixed Monthly Expenses | C2:C50 |
| Budget_Period | Budget | A8:A500 (v10.5: shifted to skip dashboard rows) |
| Budget_Category | Budget | C8:C500 |
| Budget_Budgeted | Budget | D8:D500 |
| Budget_Available | Budget | F8:F500 |
| Transactions_Amount | Transactions | C2:C1000 |
| Transactions_Category | Transactions | D2:D1000 |
| Transactions_Period | Transactions | G2:G1000 |
| Transactions_Timestamp | Transactions | H2:H1000 (added v11.0 for PWA dedup matching) |

## Formula Inventory (v6)
| Formula | Location | Purpose |
|---------|----------|---------|
| `=TEXT(A2,"MMM D")&" - "&IF(MONTH(A2)=MONTH(B2),TEXT(B2,"D"),TEXT(B2,"MMM D"))` | Setup C | Period Label |
| `=IFERROR(SUMIFS(...,"Paycheck"),0) - IFERROR(LET(s,start,e,end,amt,...,dd,...,valid,..., SUMPRODUCT(valid*amt*(13-month-check))),0)` | Budget D (_income) | Net Income: Paycheck minus fixed expenses in period |
| `=SUMIFS(Budget_Budgeted,Budget_Period,A2,Budget_Category,"<>_income")` | Budget E (_income) | Total Allocated |
| `=D2-E2` | Budget F (_income) | Unallocated |
| `=IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(C2,Setup!$E$2:$E$100,0)),"")` | Budget B (cat) | Main Category lookup |
| `=-SUMIFS(Transactions_Amount,Transactions_Period,A2,Transactions_Category,C2)` | Budget E (cat) | Spent (negated) |
| `=IFERROR(SUMIFS(Budget_Available,...,MATCH-1,...),0)+D2-E2` | Budget F (cat) | Available w/ rollover |
| `=IF(D2="","",IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(D2,Setup!$E$2:$E$100,0)),""))` | Txn E | Main Category lookup |
| `=IF(A2="","",IFERROR(FILTER(Setup!$C$2:$C$27,Setup!$A$2:$A$27<=A2,Setup!$B$2:$B$27>=A2),"Unassigned"))` | Txn G | Period auto-assign |

### SUMPRODUCT Fixed Expense Formula (detailed)
The Budget _income formula uses `LET` + `SUMPRODUCT` to calculate fixed deductions from the compact master list:

```
LET(
  s, INDEX(PayPeriods_Start, MATCH(period_label, PayPeriods_Label, 0)),
  e, INDEX(PayPeriods_End, MATCH(period_label, PayPeriods_Label, 0)),
  amt, FixedExpenses_Amount,
  dd, FixedExpenses_DueDay,
  valid, (amt<>"") * (dd<>""),
  SUMPRODUCT(valid * amt * (
    (DATE(2026,1,dd)>=s)*(DATE(2026,1,dd)<=e) +
    (DATE(2026,2,dd)>=s)*(DATE(2026,2,dd)<=e) +
    ... (months 3–12) ...
    (DATE(2026,13,dd)>=s)*(DATE(2026,13,dd)<=e)   ← DATE(2026,13,x) = DATE(2027,1,x)
  ))
)
```

Checks 13 months (Jan 2026 – Jan 2027). For each expense, generates `DATE(year, month, due_day)` and tests if it falls within [period_start, period_end]. The `valid` guard skips empty rows. Fully self-updating.

## Apps Script Functions (v9)
| Function | Menu Label | Safe? | Purpose |
|----------|-----------|-------|---------|
| `buildWorkbook()` | 1. Build Workbook (first time) | **NO** — clears all data | Creates 6 tabs, populates data, sets named ranges |
| `initializeBudget()` | 2. Initialize Budget | **CAUTION** — clears Budget | Builds Budget rows, preserves Budgeted amounts |
| `updateWorkbook()` | 3. Update Script (safe) | **YES** | Refreshes formulas/ranges/validation, no data loss |
| `addCategory()` | Add Category | **YES** | Adds new category rows to Budget for all periods |
| `processInfoAlerts()` | Parse Emails | **YES** | Menu wrapper — calls internal parser, shows UI alerts |
| `setApiKey()` | Set API Key | **YES** | Prompts for API key, saves to Script Properties |
| `doGet(e)` | *(web app)* | **YES** | Routes ALL requests (GET): `parseAndFetch`, `categories`, `batchCategorize`, `categorize`, `uncategorize`, `addCategory` |
| `doPost(e)` | *(web app)* | **YES** | Routes POST requests (backward compat): `categorize`, `uncategorize`, `addCategory` |

### Helper Functions
| Function | Purpose |
|----------|---------|
| `buildIncomeFormula_(row)` | Generates SUMPRODUCT+LET formula for _income rows |
| `buildTimestamp_(emailDate, timeStr)` | Combines email date + parsed time → "yyyy-mm-dd hh:mm:ss" |
| `buildInstructionsTab_(sheet)` | Writes formatted instructions content |
| `setTransactionFormulas_(txn)` | Sets formulas for Transactions cols E and G |
| `setNamedRanges_(ss, setup, fixed, budget, txn)` | Sets all 15 named ranges |
| `rebuildBudget_(mode)` | Core Budget row builder (used by initialize + addCategory) |
| `processInfoAlerts_()` | Internal email parser — no UI calls, returns result object |
| `handleParseAndFetch_(params)` | API handler: parse emails + return new pending transactions |
| `handleCategories_()` | API handler: return category list from Setup |
| `handleCategorize_(body)` | API handler: write to Transactions, mark Pending as categorized |
| `validateApiKey_(key)` | Checks request API key against Script Properties |
| `jsonResponse_(data)` | Creates JSON ContentService response |
| `formatDate_(date)` | Formats JS Date as "yyyy-mm-dd" |
| `findNextEmptyRow_(sheet)` | Finds first empty row in a sheet |
| `handleUncategorize_(body)` | API handler: reverse categorization — delete Txn row, restore Pending |
| `handleAddCategory_(body)` | API handler: LockService → handleAddCategoryInner_. Expects { mainCategory, subCategory } |
| `handleAddCategoryInner_(main, sub)` | Inner (locked): adds to Setup D:E, rebuilds Budget rows |
| `handleBatchCategorize_(params)` | API handler: LockService → validates categories → finds Pending rows → writes Transactions (single setValues) → verifies write → batched Pending updates. Per-item results |
| `rebuildBudgetInternal_(mode, ss)` | Internal budget rebuild — no UI calls, returns result object |
| `routeAction_(action, params)` | Pure dispatch: routes action string to appropriate handler. No try/catch (handled by doGet/doPost wrapper) |
| `getOrCreateLogsSheet_()` | Returns Logs tab; creates with headers + formatting on first call |
| `logActivity_(action, duration, status, details, error)` | Inserts log row at top of Logs tab; mirrors to console.log/warn/error |
| `rotateLogsIfNeeded_(sheet)` | Archives Logs to Logs_Archive_<timestamp> when > 5000 rows |
| `summarizeResult_(action, parsed)` | Human-readable one-line summary of API response for Details column |
| `showLogsTab()` | Menu function: opens Logs tab (creates if missing) |

## Email Parser Details

### Scotiabank InfoAlert Format
- **From:** `Scotia InfoAlerts <infoalerts@scotiabank.com>`
- **Subject:** `Authorization on your credit account`
- **Body pattern:** `There was an authorization for $AMOUNT at MERCHANT on account XXXX at TIME pm ET.`

### Parser Implementation
- **Gmail query:** `from:infoalerts@scotiabank.com subject:"Authorization on your" -label:Budget-Processed`
- **Regex:** `for \$([\d,]+\.\d{2}) at (.+?) on account .+? at\s+(\d{1,2}:\d{2}\s*[ap]m)`
- **Captures:** amount (group 1), merchant (group 2), time (group 3)
- **Date source:** `message.getDate()` from email header
- **Timestamp:** email date + parsed time → "2026-04-12 14:13:00" (dedup key)
- **Amount:** negated (purchases are negative in budget)

### Parser Bug: getPlainBody() fails on HTML-only emails (v6 → v6.1)
- **Error:** 0 transactions parsed from 12 threads (31 messages). All reported as parse failures.
- **Cause:** Scotiabank infoalert emails are `Content-Type: text/html` with no plain text alternative. `getPlainBody()` returned empty/garbled text, so the regex never matched.
- **Fix (v6.1):** Switched to `getBody()` (raw HTML) with post-processing:
  - Strip HTML tags: `.replace(/<[^>]+>/g, ' ')`
  - Decode HTML entities: `&#39;` → `'`, `&amp;` → `&`, `&nbsp;` → space, etc.
  - Collapse whitespace: `.replace(/\s+/g, ' ')`
- **Lesson:** Always use `getBody()` with HTML stripping for emails that may lack a plain text part. `getPlainBody()` is unreliable for HTML-only senders.

### Performance — Batched API Calls
| Step | API Call | What |
|------|----------|------|
| 1 | `GmailApp.search(query)` | Find unprocessed emails |
| 2 | `GmailApp.getMessagesForThreads(threads)` | Batch fetch all messages |
| 3 | `sheet.setValues(allRows)` | Batch write to Pending |
| 4 | `label.addToThreads(threads)` | Batch label as processed |

**Total: 4 API calls** regardless of email count. Expected: 2–4 seconds for 1–10 emails.

### Duplicate Prevention
- Gmail label `Budget/Processed` prevents re-parsing same email
- Search query excludes labeled emails: `-label:Budget-Processed`
- Timestamp in Pending tab serves as secondary dedup key for PWA

## Transaction Categorizer Architecture (v9 — Batch Sync + Hardening)

```
┌─────────────────────────┐
│   GOOGLE SHEET (Data)   │
│  Setup D:E → categories │
│  Pending → email queue  │
│  Transactions → final   │
│  Budget → formulas      │
└──────────┬──────────────┘
           │ SpreadsheetApp
┌──────────▼──────────────┐
│  APPS SCRIPT WEB APP    │
│  doGet() routes ALL     │
│  5 actions:             │
│  ├─ categories          │
│  ├─ parseAndFetch       │
│  ├─ batchCategorize     │  ← NEW: batch of [{ts,cat}]
│  ├─ categorize (legacy) │
│  └─ addCategory         │
└──────────┬──────────────┘
           │ HTTPS GET
┌──────────▼──────────────┐
│  PWA (GitHub Pages)     │
│  Local categorize/undo  │
│  Sync queue → one call  │
│  3 API calls per session│
└─────────────────────────┘
```

**Flow:**
1. User opens PWA → Refresh → fetches categories + parses emails (2 API calls)
2. User taps transactions → categories locally (0 API calls, instant)
3. User taps Sync → one `batchCategorize` API call sends all at once
4. Total: 3 API calls per session regardless of transaction count

**No external server.** Apps Script = backend, GitHub Pages = free static hosting for PWA.
**Manual trigger only** — user controls when emails are parsed via the app.

## PWA Architecture (v0.7 — Batch Sync + URL Hardcoded)

### Tech Stack
- Vanilla HTML/CSS/JS with ES modules (`type="module"`)
- No framework, no build step — serves directly from GitHub Pages
- Mobile-first CSS, 48px+ tap targets

### File Structure
| File | Purpose |
|------|---------|
| `index.html` | Single page app shell (config/app/undo sections) |
| `css/style.css` | Minimal mobile-first styles |
| `js/config.js` | API URL (hardcoded default, optional override) + key management (localStorage) |
| `js/api.js` | HTTP layer: fetchCategories, parseAndFetch, batchCategorize, addCategory |
| `js/store.js` | In-memory state + localStorage cache (categories + syncQueue) |
| `js/app.js` | Main logic: init, refresh, local categorize/undo, batch sync, DOM rendering |
| `manifest.json` | PWA manifest (standalone, installable) |
| `sw.js` | Service worker (cache-first app shell, network-only API) |

### Key Design Decisions
| Decision | Choice | Why |
|----------|--------|-----|
| Sync model | Batch (local-first) | Categorize/undo instant (0 API calls), sync sends all at once (1 call) |
| Sync queue | localStorage | Persists across page close/refresh; ~30-50 items max, tiny payload |
| State storage | localStorage | ~30-50 txns at a time, IndexedDB overkill |
| Undo pattern | Single `lastCategorized` object | User wants 1-level undo only; undo is local before sync |
| UI updates | Local-first | No rollback needed — categorize/undo are local. Only sync can fail. |
| HTTP method | GET for everything | POST body is lost on Apps Script 302 redirect; GET with URL params works reliably |
| SW strategy | Cache-first app shell, network-only API | App loads offline, data always fresh |
| Txn cache | NOT in localStorage | Always fresh from API — avoids stale data |
| beforeunload | Warn if syncQueue not empty | Prevents accidental data loss |
| Setup form | API key only (URL hardcoded) | Single deployment means URL never changes; friction reduction on new-device setup |
| DEFAULT_API_URL in config.js | Hardcoded production URL | Safe — URL is public anyway (visible in every network request). Key stays private in localStorage |
| URL override via `<details>` | Optional advanced override | Keeps flexibility for staging/test deployments without cluttering the default UX |

### Categorize Flow (Local — No API Call)
1. User taps transaction → taps category
2. `store.removeTransaction()` → re-render (instant disappear)
3. `store.addToSyncQueue()` → saved to localStorage
4. `store.setLastCategorized()` → show undo bar
5. `renderSyncButton()` → shows count badge (e.g. "Sync (3)")
6. **No API call** — zero latency

### Undo Flow (Local — No API Call)
1. User taps UNDO (only available for last categorized)
2. `store.removeFromSyncQueue()` → removes from queue
3. `store.restoreTransaction()` → re-render (instant reappear)
4. `store.clearLastCategorized()` → hide undo bar
5. `renderSyncButton()` → updates count
6. **No API call** — zero latency

### Sync Flow (One Batch API Call)
1. User taps Sync → button shows "Syncing..."
2. `api.batchCategorize(store.syncQueue)` → sends all items as JSON in GET param
3. Server reads Pending once, writes Transactions in single `setValues()`, updates Pending rows
4. Returns per-item `{timestamp, success, error}` results
5. On success: `store.clearSyncedItems()` → queue cleared
6. On partial failure: failed items stay in queue, user sees count + retry message
7. On network error: "Data saved locally" — queue unchanged, retry later

### Deployment
- Repo: `fahyad/gsheetbudget2026-categorizerApp`
- URL: https://fahyad.github.io/gsheetbudget2026-categorizerApp/
- GitHub Pages source: main branch, root directory

### Configuration (v0.7)

**API URL** — hardcoded in `js/config.js` as `DEFAULT_API_URL`:
```
https://script.google.com/macros/s/AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ/exec
```
- Same deployment ID the `apps-script/deploy.sh` script targets
- Safe to hardcode: already public (visible in network traffic)
- Optional override: user can set a different URL via Settings → Advanced → custom URL (persists in localStorage only)

**API Key** — never hardcoded; stored only in localStorage per device.
- Set once per device via Settings → API Key
- Rotation procedure:
  1. Generate a new key: `openssl rand -base64 36 | tr -d '=+/' | cut -c1-40`
  2. Set in Apps Script via menu: Budget Tools → Set API Key
  3. Update each device's PWA via Settings → API Key
- If leaked: rotate. Old key stops working the instant a new one is saved in Script Properties.

### Setup UX
- Before v0.7: 2 fields (URL + Key) on every new device
- v0.7+: 1 field (Key only). URL auto-configured
- Optional `<details>` "Advanced" section exposes URL input for staging/test deployments

## Activity Log & Observability (v9)

### Logs Tab Structure
| Col | Header | Type |
|-----|--------|------|
| A | Timestamp | Date (yyyy-mm-dd HH:mm:ss) |
| B | Action | Text (e.g. batchCategorize, parseAndFetch) |
| C | Duration (ms) | Number |
| D | Status | Text: success / fail / auth_fail / crash / write_verify_fail |
| E | Details | Text (human-readable summary) |
| F | Error | Text (error message + stack trace for crashes) |

Auto-created on first log write. Tab color: gray. Newest entries at row 2 (top).

### Two-Layer Logging
1. **Sheet-based Logs tab** — user-visible, sortable, filterable. Survives across sessions and deployments
2. **console.log/warn/error** — mirrored to Cloud Logging (Apps Script → Executions → View log). Useful for stack traces and cross-execution debugging
3. **Rotation:** Logs tab archives to `Logs_Archive_<timestamp>` when > 5000 rows

### What Gets Logged
- **Every web API request** — action, duration, status, summary, error
- **Auth failures** — with method (GET/POST) in details
- **Crashes** — full stack trace in Error column
- **Write verification failures** — with expected vs actual values
- **Per-action summaries** in Details column:
  - `parseAndFetch` → `"parsed 3, returned 12 pending"`
  - `categories` → `"returned 8 categories"`
  - `batchCategorize` → `"5/5 succeeded"` or `"3/5 succeeded | failed: <ts>:<err>;..."`
  - `addCategory` → `"Living > Dining Out, +26 budget rows"`
  - `categorize` → `"Merchant → Category"`

### LockService Pattern
All mutating handlers wrap their body with `LockService.getScriptLock()`:
```javascript
var lock = LockService.getScriptLock();
if (!lock.tryLock(10000)) {
  return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
}
try {
  // ... handler logic ...
} finally {
  lock.releaseLock();
}
```
Prevents concurrent requests from racing (e.g., double-tap Sync, or Sync + Refresh).
Timeout: 10s for categorize/uncategorize/batchCategorize; 30s for addCategory (triggers rebuildBudget).

### Write Verification Pattern
After any `setValues()` to Transactions, read back and verify:
```javascript
txn.getRange(start, 1, n, 4).setValues(rows);
SpreadsheetApp.flush();
var verify = txn.getRange(start, 1, 1, 4).getValues()[0];
if (String(verify[1]) !== String(rows[0][1])) {
  logActivity_('xxx_verify', 0, 'write_verify_fail', '...', '');
  return jsonResponse_({ success: false, error: '...' });
}
// Only proceed with Pending update if Transactions write verified
```
This catches silent write failures (protected ranges, data validation rejects, quota hiccups, row-placement bugs).

## Single-Ledger Architecture (v11.0+)

**Before (v10.x and earlier):** Two-tab design with Pending → Transactions copy operation.
**After (v11.0+):** Single Transactions ledger. Empty Category = "needs categorization".

### Why the change
- Eliminates entire class of "find next empty row → orphan" bugs (no more copying)
- Removes ~60 lines of Apps Script (handler simplification)
- Single source of truth — no Pending/Transactions desync risk
- Matches "Pattern A" from ZBB research report
- PWA contract unchanged — same `parseAndFetch`/`batchCategorize` API signatures

### How handlers changed
| Handler | Before (two-tab) | After (single-ledger) |
|---|---|---|
| `processInfoAlerts_` | Wrote 7 cols to Pending tab | Writes A:D + H to Transactions, empty Category |
| `handleParseAndFetch_` | Read Pending where status='pending' | Reads Transactions where Category="" AND Timestamp set |
| `handleBatchCategorize_` | Find Pending row → write to Transactions → verify → mark Pending categorized (~150 lines) | Find Transactions row by Timestamp → update Category cell → verify (~50 lines) |
| `handleCategorize_` | Same complex flow | Update single Category cell |
| `handleUncategorize_` | Delete Transactions row + restore Pending status | Clear Category cell of existing row |

### One-shot migration (v11.0)
- `migratePendingToTransactions()` — moved 30 pending + 8 categorized + 8 orphans
- `consolidateTransactionsRescue()` (renamed in v11.6 from `consolidateTransactions`) — fixed an order-of-operations bug (initial migration appended past row 1000; consolidate compacts data to top). Now flagged as DESTRUCTIVE — only run from Apps Script editor, never via menu.
- Backed up Pending tab to `Pending_Archive_<timestamp>` before deletion
- Both menu items removed in v11.1 once migration verified

## Integrated Code Review (v11.3 → v11.6 + PWA v0.10)

Three independent reviews merged into a 26-item plan, executed in 4 phases. Detailed phase breakdown lives in `docs/progress.md`'s 2026-04-19 entry; this section captures the durable architectural patterns those changes established.

### Concurrency
- **All Apps Script writers wrap in `LockService.getScriptLock()` with `tryLock(timeout)`.** Previously only request-driven handlers were protected; the Gmail trigger `processInfoAlerts_` was not. Lock failure is logged via `logActivity_('lock_timeout', ...)` and the operation is skipped (emails retry on next trigger).

### Identity / dedup
- **Email-parsed Timestamps now have a uniqueness suffix.** Format: `YYYY-MM-DD HH:MM:SS#<hex>` where `<hex>` is a 4-char MD5 of `merchant|amount`. In-batch collisions (same timestamp + suffix) get `-1`, `-2` appended. Old rows without suffix still match by string equality — backward compatible. Generated by `uniqueSuffix_()` helper in Code.js.

### Failure surfaces
- **Loud errors over silent corruption.** `findNextEmptyRow_` throws on past-row-1000 (was silent orphan write). `handleAddCategoryInner_` returns capacity error on full Setup tab (was silent overflow to row 101). `handleUncategorize_` returns no-match error (was silent success). Pattern: prefer `{success: false, error: 'specific reason'}` over no-op success.

### Validation consistency
- `setAllowInvalid(false)` everywhere (was inconsistent: `false` in updateWorkbook, `true` in buildWorkbook). Strict by default.
- `setNamedRanges_` only removes ranges matching owned prefixes (`PayPeriods`, `CategoryList`, `CategoryMain`, `FixedExpenses_`, `Budget_`, `Transactions_`). User-defined ranges survive.

### PWA UI guards
- `refreshInFlight` and `syncInFlight` module flags prevent duplicate operations and undo-during-sync races. `localStorage.setItem` wrapped in `safeSetItem_` with QuotaExceededError detection across browsers; syncQueue gets one recovery attempt (drop categories cache, retry) before setting `store.persistFailed`.
- `showSuccess()` helper (green toast via `.success` CSS class on shared `#error-toast` element). Sync success no longer uses red error styling.

### Build / deploy
- `deploy.sh` now uses portable `sed -i.bak ... && rm -f` instead of BSD-only `sed -i ''`.
- `BUDGET_YEAR` constant at top of Code.js. `buildFixedExpensesFormula_` reads it instead of hardcoded 2026. Annual rollover touches BUDGET_YEAR + the PayPeriods array.
- `buildAvailableFormula_(row)` helper centralizes the Available formula. Was duplicated in `rebuildBudgetInternal_` and updateWorkbook's formula-refresh loop.

### Security hygiene
- API key was leaked in `CLAUDE.md` and `docs/progress.md` (committed plaintext in a public repo). Rotated server-side; scrubbed from current files; `.git/hooks/pre-commit` (local-only) blocks future commits matching the pattern. Old key remains in git history — must rely on rotation, not history-rewrite, for security.
- `sw.js` `CACHE_VERSION` is now bumped on every PWA-affecting release (was stuck at v9 across multiple releases — returning users were running stale code).

## Web App API (v11.2)

### Endpoints
| Method | Action | URL Params | Returns |
|--------|--------|------------|---------|
| GET | `parseAndFetch` | `?action=parseAndFetch&apiKey=KEY` | `{ success, parsed, transactions: [{timestamp, date, merchant, amount}] }` |
| GET | `categories` | `?action=categories&apiKey=KEY` | `{ success, categories: [{main, sub}] }` |
| GET | `batchCategorize` | `?action=batchCategorize&apiKey=KEY&items=[{"ts":"...","cat":"..."},...]` | `{ success, results: [{timestamp, success, error?}], summary: {total, succeeded, failed} }` |
| GET | `addCategory` | `?action=addCategory&apiKey=KEY&mainCategory=X&subCategory=Y` | `{ success, category: {main, sub}, budgetRowsAdded }` |
| GET | `dumpSheet` | `?action=dumpSheet&apiKey=KEY&metadata=true` *or* `&tab=X&range=A1:F10[&includeFormulas=true]` | `{ success, spreadsheetName?, sheets?, tab?, range?, rows?, cols?, values? }` |
| GET | `version` | `?action=version&apiKey=KEY` | `{ success, appsScript: { version, lastEdited, latestVersion, latestLastEdited, updateNeeded, lastChecked, error? } }` |
| GET | `categorize` | `?action=categorize&apiKey=KEY&timestamp=X&category=Y` | `{ success, transaction: {...} }` *(legacy — PWA no longer uses)* |
| GET | `uncategorize` | `?action=uncategorize&apiKey=KEY&timestamp=X&merchant=X&amount=X&category=X` | `{ success, transaction: {...} }` *(legacy — PWA no longer uses)* |

### dumpSheet — read-only inspection (added v10)

Lets Claude (or any API-key holder) inspect the spreadsheet without OAuth. Modes:

- `metadata=true` → returns list of all tabs with name, rows, cols, maxRows/maxCols, hidden, tabColor (no `tab` needed)
- `tab=X` → returns display values (formatted strings) of the whole tab
- `tab=X&range=A1:F10` → values of the specified A1 range
- `tab=X&range=...&includeFormulas=true` → returns formulas where present, values otherwise (mixed)

**Caps response at 10000 cells.** API-key gated. Read-only — no writes possible.

Example calls:
```bash
URL="https://script.google.com/macros/s/AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ/exec"
KEY="<your api key>"
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&metadata=true"
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Setup&range=A1:E27"
curl -sL "${URL}?action=dumpSheet&apiKey=${KEY}&tab=Budget&range=D2:D10&includeFormulas=true"
```

### Why dumpSheet exists
Drive MCP server disconnected. gcloud OAuth blocked for personal Gmail accounts ("This app is blocked"). Community MCP servers (mcp-google-sheets, etc.) hit the same OAuth wall. Path of least resistance: an endpoint on the Apps Script we already own + the API key we already have. Permanent, no OAuth verification dance, no new dependencies.

### Version Display Architecture (added v10.2)

**Problem:** User had multiple sheets in Drive (some old). Opened one and didn't realize it was bound to OLD Apps Script code. Wanted in-sheet version display + "is this stale?" check.

**Source of truth:** `apps-script/VERSION.txt` in this repo (2 lines: version + timestamp). Publicly readable via `https://raw.githubusercontent.com/fahyad/gsheetbudget2026-categorizerApp/main/apps-script/VERSION.txt`. No auth needed (public repo).

**Per-sheet awareness:** Each Apps Script deployment carries its own `APP_SCRIPT_VERSION` and `APP_SCRIPT_LAST_EDITED` constants (set at push time). At runtime it fetches `VERSION.txt` from GitHub via `UrlFetchApp.fetch()` to know what the LATEST version is, and compares to its own. If different → "Update needed: YES".

**Caching:** GitHub fetch result cached in `PropertiesService.getScriptProperties()` for 1 hour to avoid hammering GitHub on every `onOpen()`. `refreshVersionInfo()` clears the cache to force a fresh check.

**Auto-refresh on sheet open:** `onOpen()` calls `refreshVersionInfo()` (wrapped in try/catch so it doesn't break menu rendering if fetch fails).

**deploy.sh auto-bump:** Updates `APP_SCRIPT_LAST_EDITED` constant in Code.js to current time, reads `APP_SCRIPT_VERSION` constant, writes both to `VERSION.txt`. Single command keeps everything in sync.

**OAuth scope:** UrlFetchApp requires `script.external_request` scope. Added explicit `oauthScopes` array to `appsscript.json` (also covers existing scopes: `spreadsheets.currentonly`, `script.container.ui`, `gmail.modify`, `userinfo.email`, `script.scriptapp`). Web app deployed as USER_DEPLOYING runs with owner's auth — owner must re-authorize when scopes change by running `requestPermissions()` from the editor. (Can't trigger auth dialog from a function with try/catch around the new API call — it swallows the error before Google can prompt.)

**Display locations:**
- Sheet → Instructions tab rows 1-6 (color-coded: blue header, green/red/yellow update status row)
- PWA → Setup screen `#version-info` block (PWA version, AS version, update status with color)
- API → `?action=version` returns full JSON

### Authentication
- API key stored in Apps Script **Script Properties** (not hardcoded)
- Set via menu: Budget Tools → Set API Key
- Validated on every request via `validateApiKey_()`
- PWA stores key in localStorage after first entry

### Deployment

**Initial setup (already done — for reference only):**
1. Apps Script editor → Deploy → New deployment → Web app
2. Execute as: Me | Who has access: Anyone
3. Copy deployment URL → hardcoded into PWA `js/config.js` as `DEFAULT_API_URL`
4. Copy deployment ID → hardcoded into `apps-script/deploy.sh` as `PROD_DEPLOYMENT_ID`

**Ongoing updates:**
Use `cd apps-script && ./deploy.sh "description"` (see "Daily loop" below).
**Never** use plain `clasp deploy` — it creates a new deployment with a new URL and breaks the PWA.

### Saving Tab #REF! After Update Script (v11.9)

- **Symptom:** User ran Update Script to create the Saving tab from v11.8 deploy. Tab appeared with correct dimensions (105 rows × 9 cols, light blue) and the right header text, but every formula stored as `#REF!`. The dashboard cell B3 (Current Period) showed `(out of range)` and dashboard sums all showed `$0.00 / 0` even though the tab structure was visually correct.
- **Verification:** `dumpSheet?tab=Saving&range=A1:I7&includeFormulas=true` showed row 3 B3 as:
  ```
  =IFERROR(XLOOKUP(1,(#REF!<=TODAY())*(#REF!>=TODAY()),#REF!),"(out of range)")
  ```
  and row 6 col E as:
  ```
  =IF(B6="","",IFERROR(SUMIFS(#REF!,#REF!,B6,#REF!,$B$3),0))
  ```
  — all named-range references (PayPeriods_Start, PayPeriods_End, PayPeriods_Label, Budget_Available, Budget_Category, Budget_Period) replaced with literal `#REF!` tokens.
- **Root cause:** order-of-operations in `updateWorkbook`. The Saving-tab block was calling `setFormula(...)` with formulas referencing named ranges, and it ran BEFORE `setNamedRanges_`. `setNamedRanges_` deletes-then-recreates every owned-prefix named range. **When Google Sheets deletes a named range, it silently rewrites every formula referencing that name to a `#REF!` literal. That conversion is one-way — recreating the same name with the same definition does NOT heal the broken formulas.**
  ```
  updateWorkbook execution order (v11.8 — BUG):
    1. ... other refreshes ...
    2. Saving tab build/refresh (setFormula PayPeriods_*, Budget_*)  ← names exist here
    3. ... more refreshes ...
    4. setNamedRanges_                                                ← deletes the names
    5. (recreates names — too late, formulas already broken)
  ```
  `buildWorkbook` was unaffected because there `setNamedRanges_` runs first and Saving builds after.
- **Fix (v11.9):** moved the Saving-tab block in `updateWorkbook` to immediately after `setNamedRanges_`. Added a defensive comment block at the moved section. Subsequent Update Script runs invoke `refreshSavingTab_` which overwrites the broken formulas with correctly-resolved ones.
- **Lesson:** **Named-range deletion is destructive to referencing formulas — even if the same name is recreated milliseconds later.** Any new code that writes formulas referencing named ranges in `updateWorkbook` MUST come after `setNamedRanges_`. This is now an ordering invariant. Added to CLAUDE.md trip-up list so future-Claude doesn't repeat this.

### Budget #REF! After updateWorkbook (v11.12) — CRITICAL

- **Symptom:** After the user ran Update Script to pull v11.11, `dumpSheet` revealed that EVERY Budget per-row formula (rows 8-267, across all categories) stored as `#REF!`:
  ```
  Row 8 (Groceries, Dec 25 - Jan 20):
    Col E (Spent)     = =-SUMIFS(#REF!,#REF!,A8,#REF!,C8)
    Col F (Available) = =IF(MATCH(A8,#REF!,0)>1,IFERROR(SUMIFS(#REF!,#REF!,...)))+D8-E8
  Row 77 (Europe, Apr 1 - 14):   [same #REF! pattern]
  ...
  ```
  But the Budget DASHBOARD formulas in the SAME tab were fine:
  ```
  Row 1 F1: =IFERROR(LET(s,INDEX(PayPeriods_Start,MATCH($B$1,PayPeriods_Label,0)),...
  Row 4 A4: =IFERROR(SUMIFS(Transactions_Amount,Transactions_Period,$B$1,...),0)
  ```
  — resolving named ranges correctly. So the named ranges DO exist; the per-row refresh was simply not updating the broken formulas.

- **Diagnosis:** The in-place per-row refresh loop in `updateWorkbook`:
  ```js
  for (var i = 0; i < budgetData.length; i++) {
    // ... filter to valid data rows ...
    budget.getRange(row, 2).setFormula(...);
    budget.getRange(row, 5).setFormula(...);
    budget.getRange(row, 6).setFormula(buildAvailableFormula_(row));
  }
  ```
  …was apparently executing but not committing changes. The identical code path in `rebuildBudgetInternal_` (used by `handleAddCategoryInner_` and `initializeBudget`) works correctly. Unknown root cause — suspected Apps Script state-commit quirk between `setNamedRanges_` (which deletes-then-recreates named ranges, breaking every referencing formula to `#REF!`) and the subsequent per-row `setFormula` calls in the same execution. Individual `setFormula` calls in a tight loop may not be flushing state before the next iteration, possibly leaving the cell in a state where the formula text is "accepted" but the parse/resolve step loses the reference.

- **Fix (v11.12):** replaced the in-place per-row refresh loop with a call to `rebuildBudgetInternal_('refresh', ss)`. This is the same code path that `handleAddCategoryInner_` uses — and that definitely works because `addCategory` via PWA produces correctly-resolved formulas. `rebuildBudgetInternal_` preserves user-entered Budgeted amounts via `existingBudgetedMap` before wiping and rebuilding the Budget tab. Added `SpreadsheetApp.flush()` before the call to guarantee `setNamedRanges_` state is committed. Removed the now-redundant `buildBudgetDashboard_` and header-refresh blocks from `updateWorkbook` since `rebuildBudgetInternal_` does both.

- **Blast radius:** the bug affected every Saving-tab Update Script run since v11.8 (approximately 4 user-visible runs). The user reported it when the Saving tab's "Currently Saved" column showed $0 for the Europe goal even though they had budgeted $222.22 — the Saving formula looks up Budget_Available via SUMIFS, and Budget_Available referenced broken `#REF!` formulas so returned 0. User had also mis-filed the $222.22 in period "Apr 1-14" instead of "Apr 15-28" (the current period), which explained why the dashboard showed $0 for the current period regardless.

- **Lesson:** **when an in-place refresh doesn't match a known-working rebuild path, stop debugging the in-place version and use the rebuild path.** I spent significant time trying to understand why the per-row refresh loop didn't commit its setFormula calls; the answer was "we don't know, but `rebuildBudgetInternal_` works, so use that." Don't debug bugs that have available workarounds. Also: `dumpSheet` with `includeFormulas=true` on multiple representative rows is the verification tool for this bug class — values alone can look deceptively OK (zeros, errors swallowed by IFERROR).

### Saving Tab Per-Period Drift + Schema Refactor (v11.11)

- **Symptom:** User set up a goal (Target $4000 by Dec 23-Jan 5 = period 25). Initial dashboard showed "Per-Period Need = $222.22". User budgeted exactly that $222.22 in the current period (Apr 15-28). Re-checking the Saving tab, Per-Period Need had dropped to **$209.88**. User expected it to stay constant: "if I budgetted the correct amount this calculation should stay the same."
- **Root cause:** the old Per-Period Need formula was:
  ```
  =IF(F<=0, 0, MAX(0, (Target - CurrentlySaved) / F))
  ```
  where F = Periods Remaining = `MATCH(target, PayPeriods_Label, 0) - MATCH(current, PayPeriods_Label, 0)` = 18. `CurrentlySaved` is the cumulative Budget Available for the category at the current period — it INCLUDES the current period's allocation (because Budget Available = prior + Budgeted - Spent).
  So after allocating $222.22: `(4000 - 222.22) / 18 = $209.88`. Mathematically the formula was asking "given you've saved $222.22 toward $4000, how much should each of the 18 future periods cover?" But the semantic the user expected was "what should I budget each period (including this one)?"
- **User-directed redesign:** the user proposed removing the "On Track?" status column (redundant given the numeric columns) and adding a new "Allocated This Period" column to make the per-period budgeting visible and to let "Needed Future Periods" adapt. Implementation:
  - Dropped column H "On Track?" — text status with CF (DONE / ON PACE / CLOSE / BEHIND / OVERDUE). Can return as a dashboard feature later.
  - Added column F "Allocated This Period" = `SUMIFS(Budget_Budgeted, Budget_Category, B, Budget_Period, $B$3)`. Distinct from Currently Saved (which includes prior-period rollover) — this is ONLY what the user has budgeted in the current period for this category.
  - Renamed Per-Period Need → "Needed Future Periods" (column H). Adaptive formula:
    ```
    If F > 0: (Target - CurrentlySaved) / (G - 1)   // future only, G-1 because current is already covered
    If F = 0: (Target - CurrentlySaved) / G         // assume user will budget same amount this period too
    ```
    With this formula the per-period value **stays constant** when the user budgets the previously-suggested amount:
      - Before allocation: 4000 / 18 = $222.22
      - After allocating $222.22: (4000 - 222.22) / (18 - 1) = $222.22 ✓
      - Over-budget $400: (4000 - 400) / 17 = $211.76
      - Under-budget $100: (4000 - 100) / 17 = $229.41
- **Dashboard adjustments (row 2 labels + row 3 totals):** swapped "Per-Period Need" and "Currently Saved" metrics; added "Needed Future" total (sum of column H). Label row is now: Today | Current Period | Total Goals | Currently Saved | Needed Future | Target Total.
- **CF cleanup:** old On Track? CF rules (text-based DONE/ON PACE/etc.) stripped. Column H now holds currency, not text — old rules would never match anyway. No replacement CF for v11.11.
- **Lesson:** when a formula combines a cumulative number (Currently Saved includes current period) with a denominator that treats "remaining" differently (Periods Remaining doesn't account for current being already-budgeted), the math can be arithmetically correct but semantically surprising. Making the state visible to the user (new Allocated This Period column) + making the formula adapt to that state (G vs G-1 divisor) resolves the confusion without changing the underlying math.

### Saving B3 XLOOKUP Out-of-Range (v11.10)

- **Symptom:** After v11.9 fixed the `#REF!` issue, Update Script was re-run. Formulas now had correct named-range references, but B3 (Current Period dashboard cell) still displayed `(out of range)` even though today (2026-04-20) was clearly inside period 7 (Apr 15 - 28). This cascaded:
  - B3 = `(out of range)` (string, not a valid period label)
  - F6 (Periods Remaining) formula: `MATCH($B$3, PayPeriods_Label, 0) - MATCH(D6, ...)` → `#N/A - N` → `#N/A` → IFERROR caught → returned `""`
  - G6 (Per-Period Need): `IF(F6<=0, 0, MAX(0, (C6-E6)/F6))` → `(C6-E6)/""` → **`#DIV/0!`** ← user-visible bug
  - H6 (On Track?): `MATCH($B$3, PayPeriods_Label, 0)` → `#N/A` → IFERROR returned 0 → 0 ≤ 0.04 matched `JUST STARTING` (misleadingly green for a goal with $0 saved)
- **Root cause:** the B3 formula was:
  ```
  =IFERROR(XLOOKUP(1, (PayPeriods_Start<=TODAY())*(PayPeriods_End>=TODAY()), PayPeriods_Label), "(out of range)")
  ```
  This relies on Google Sheets to auto-broadcast the element-wise multiplication of two boolean arrays (`{TRUE,FALSE,...} * {FALSE,TRUE,...}` → `{0,0,...,1,0,...}`) into XLOOKUP's lookup vector. In practice Google Sheets does not reliably broadcast that expression as a usable lookup vector for XLOOKUP — the function returned "no match" even when a match objectively existed in the array.
- **Fix (v11.10):** replaced with INDEX+MATCH(match_type=1). Since `PayPeriods_Start` is ascending-sorted by design, `MATCH(TODAY(), PayPeriods_Start, 1)` returns the position of the largest start date ≤ today — which is exactly the current period's row:
  ```
  =IFERROR(
    IF(TODAY()>INDEX(PayPeriods_End, ROWS(PayPeriods_End)), "(out of range)",
       INDEX(PayPeriods_Label, MATCH(TODAY(), PayPeriods_Start, 1))),
    "(out of range)")
  ```
  IFERROR catches "today earlier than all periods"; the inner IF catches "today later than period 25's end". Also added defense-in-depth on G (Per-Period Need): wrapped the division in `IFERROR(..., "")` so any future malformed F never produces `#DIV/0!`.
- **Lesson:** **XLOOKUP in Google Sheets is unreliable when the lookup vector is produced by array-multiplication of boolean expressions.** Prefer `INDEX(labelRange, MATCH(target, sortedStartRange, 1))` when the start range is ascending-sorted — it's more portable, doesn't rely on array-broadcast behavior, and a single MATCH call covers the typical "find the row whose range contains the target" case. Added to CLAUDE.md trip-up list.

### Slicer.setColumnPosition API Change Bug (v11.7) — CRITICAL UX

- **Symptom:** PWA `addCategory` action started returning generic crash errors. New category was actually created (Setup tab + Budget rows updated correctly), but the PWA reported failure and the slicer ended up in a broken state with no filter column.
- **Logs:**
  ```
  2026-04-19 19:51:56  addCategory  CRASH  3592ms
  TypeError: newSlicer.setColumnPosition is not a function
      at rebuildBudgetInternal_ (Code:2546:13)
      at handleAddCategoryInner_ (Code:488:16)
      at handleAddCategory_ (Code:441:12)
      at routeAction_ (Code:85:45)
      at doGet (Code:106:20)
  ```
- **Root cause:** Google appears to have changed the Apps Script Slicer API. The `setColumnPosition()` method is no longer present on the object returned by `Sheet.insertSlicer()` in web-app context. The same code worked in v10.5 when first written; nothing in our codebase changed around the slicer block. This was a silent server-side change.
- **Why it cascaded:** The original `rebuildBudgetInternal_` block did:
  ```js
  // remove all existing slicers
  for (var s = 0; s < existingSlicers.length; s++) existingSlicers[s].remove();
  // create new slicer
  var newSlicer = budget.insertSlicer(...);
  newSlicer.setColumnPosition(1);  // THROWS HERE
  ```
  When `setColumnPosition` threw, control already past the `remove()` calls — so the working slicer was destroyed AND the throw propagated up, crashing the parent. The user was left with: a slicer that exists but has no filter column (broken UX) and a PWA showing a crash.
- **Fix (v11.7):** Refactored to:
  1. Prefer `setRange()` on existing slicer (preserves filter column, no `setColumnPosition` call).
  2. Only recreate when no slicer exists — with `typeof === 'function'` guard around `setColumnPosition`.
  3. Wrap entire slicer block in top-level try/catch — slicer is a UI convenience; failure must never crash the parent operation.
- **Lesson:** **UI-widget code paths should never crash data operations.** Slicers, named ranges, formatting — these are decoration. They go in try/catch with non-fatal logging. The data write should always succeed. Also: Google's API contract isn't stable across releases for newer features. Defensive `typeof` guards are cheap insurance.

### Gas Rollover Investigation (v11.x, late April 2026) — non-bug

- **Symptom:** User reported Budget tab row 72 (Apr 15-28 / Gas) showing -$280 Available with $100 budgeted and $40 spent. They flagged it as "the second miscalculation" and asked whether to redesign the formula.
- **Investigation via dumpSheet:** Traced the Gas chain across periods:
  | Period | Budgeted | Spent | Available | Notes |
  |--------|----------|-------|-----------|-------|
  | Dec 25 - Mar 31 | $0 | $0 | $0 | (no activity) |
  | Apr 1 - 14 | $0 | **$340** | -$340 | $40 ESSO + **$250 SHELL** + $30 ESSO + $20 PETRO |
  | Apr 15 - 28 | $100 | $40 | -$280 | rollover -$340 + $100 - $40 |
- **Root cause:** NOT a bug. The formula correctly rolled the -$340 deficit forward. The deficit was real: Apr 1-14 had $0 budgeted but $340 spent on Gas, anchored by an erroneous SHELL $250 charge that the user had not noticed. The user manually uncategorized SHELL after our investigation, which heals the chain.
- **Why it was confusing:** The Available column does double duty:
  - For *spending* categories (Groceries): a small rolling buffer near zero. A negative value here typically means immediate overspend.
  - For *savings* categories (a future Saving tab): the cumulative pile.
  - The user's mental model was "this period's remaining budget" (= $60 here), but the formula computes "cumulative position".
- **What was discussed (and explicitly deferred per user's call):**
  Four budget design models laid out, all of which would prevent this confusion:
  - **A.** Each period independent (no rollover) — kills future Savings goal use case
  - **B.** Positive-only rollover — hides overspend
  - **C.** Full rollover (current) — honest but confusing
  - **D.** Two columns: "This Period" + "Cumulative" — best UX, more invasive
  Plus: move calculations from spreadsheet formulas to Apps Script values (eliminates the entire formula-bug class). User decided to keep the current formula since "it still works, even though brittle" and we'll revisit if it bites again.
- **Lesson:** Before assuming "miscalculation", trace the rollover chain back through the same category in earlier periods. The bug is almost always in the data, not the formula. Document this in CLAUDE.md so future-Claude doesn't waste time on the same investigation.

### POST Redirect Bug (all write actions failed from PWA)
- **Issue:** Apps Script web apps respond with HTTP 302 redirect. Per HTTP spec, browsers convert POST→GET on 302, dropping the request body. All POST-based write actions (categorize, uncategorize, addCategory) silently failed.
- **Symptom:** Transaction disappeared from PWA list but never appeared in Transactions sheet. No error shown (optimistic UI removed it, but API returned doGet's "Unknown action" which wasn't caught properly).
- **Fix:** Moved all actions into `doGet()`. PWA now uses GET with URL params for everything. `doPost` kept for backward compatibility (curl testing).
- **Lesson:** Never use POST from browser to Apps Script web apps. Always use GET with URL params.

### Budget Available Circular Reference Bug (discovered v10.3, FIXED in v10.4) — CRITICAL
- **Symptom:** "Small trip" and "Eating out" categories showed inflated `Available` values across all 26 periods (e.g. Small trip period 1: $145,200 → $745,200 → $865,200 across queries — values GREW with each sheet recalculation). Other categories (Groceries, Gas, etc.) showed correct $0 / budgeted amounts.
- **Root cause:** The Available formula uses `INDEX(PayPeriods_Label, MATCH(A2, PayPeriods_Label, 0) - 1)` to find the prior period. For period 1 (`Dec 25 - Jan 20`), `MATCH = 1` so `MATCH - 1 = 0`. **`INDEX(range, 0)` in Sheets returns the entire range as an array.** SUMIFS with an array criterion effectively evaluates "Budget_Period equals ANY of these 26 labels" — matching every Budget row of that category. Since the formula's own cell is in that range, this creates a **self-referential circular formula**: `Available_p1 = SUM(all Available for category) + Budgeted - Spent`.
- **Why it diverges:** Sheets resolves circular references iteratively. Each recalculation: `new_p1 = old_p1 × ~26 + budgeted_total`. Values grow by ~27× per recalc. Verified across multiple queries — values continually grew.
- **Why ONLY Small trip and Eating out:** All 208 cells use the same formula. Best theory: Sheets caches a stable $0 fixed point for cells that were $0 when first evaluated. Categories present at workbook build (Groceries, Gas, Parking, House things, Saajidah spending, Fahyad spending) found this stable point before any non-zero Budgeted was added. Small trip and Eating out were either added or had their cells edited AFTER the Apr 15-28 Budgeted values were entered, forcing fresh evaluation that didn't find $0 — instead landing in the divergent iteration. **Practical takeaway: any category that gets non-zero Budgeted introduced after its cells stabilize is a ticking time bomb.**
- **Fix:** Change the formula to explicitly handle period 1:
  ```
  =IF(MATCH(A2, PayPeriods_Label, 0) > 1,
      IFERROR(SUMIFS(Budget_Available, Budget_Period,
          INDEX(PayPeriods_Label, MATCH(A2, PayPeriods_Label, 0) - 1),
          Budget_Category, C2), 0),
      0
  ) + D2 - E2
  ```
  Period 1 explicitly returns `0 + Budgeted - Spent` (no rollover, no INDEX call). Eliminates the bad `INDEX(_, 0)` entirely. Eliminates the circular reference. Other periods unchanged.
- **Lesson:** Never rely on `MATCH - 1` without checking if the result is ≥ 1. `INDEX(range, 0)` returns the full range, not an error.

### Trailing Whitespace in Category Names (discovered v10.3, FIXED in v10.4)
- **Symptom:** Setup E10 has Main Category `"Nice Things "` (with trailing space) for "Eating out". All other rows have `"Nice Things"` without space.
- **Root cause:** The PWA's "Add Category" function passed user input directly without trimming. User typed `"Nice Things "` accidentally with a trailing space when adding the new category.
- **Impact:** `INDEX/MATCH` lookups against `"Nice Things"` (no space) won't match this row. Could cause Budget Main Category lookups to fail silently. Doesn't cause the circular reference bug above — but is a fragile data condition.
- **Fix (one-off):** Edit Setup E10 to remove trailing space.
- **Fix (preventive):** `handleAddCategory_` already calls `.trim()` on inputs (line 339-340) — but this case slipped through, suggesting either (a) the trim was added after this row was written, or (b) the trim happens after a different validation. Also add trimming in the PWA's `saveNewCategory` before sending to API.
- **Lesson:** Trim user inputs at BOTH client and server. Belt-and-suspenders.

### getLastRow Formula-Filled Rows Bug (v8 → v9) — CRITICAL
- **Issue:** After batch sync, Pending rows marked "categorized" but Transactions tab showed NO new rows
- **Root cause:** `getLastRow()` counts formula-filled cells as content **even when formulas return empty string**. The Transactions tab has `=IF(A="","",...)` formulas pre-filled in rows 2-1000 (cols E and G, via `setTransactionFormulas_`). `getLastRow()` reports 1000 even on an empty sheet. Therefore `findNextEmptyRow_(txn)` returned 1001. Every `setValues()` went to rows 1001+, far below the visible data range
- **Bug was in single-txn handler too** — `handleCategorize_` had it too but went undetected because the response was generated from the same row that was just written. PWA showed success; user never scrolled to row 1001
- **Fix:** Rewrote `findNextEmptyRow_(sheet)` to scan column A (purely data, never formulas) from bottom up for the actual last non-empty cell. Works regardless of formula-filled columns
- **Safety net added:** Write verification — after `setValues()` on Transactions, read back the first row and confirm merchant + amount match. If mismatch, log to Logs tab, return error, and DO NOT update Pending (prevents the same inconsistency)
- **Sources:** [labnol.org/sheets-lastrow-arrayformula](https://www.labnol.org/sheets-lastrow-arrayformula-220322), [yagisanatode getLastRow with formulas](https://yagisanatode.com/google-apps-script-get-the-last-row-of-a-data-range-when-other-columns-have-content-like-hidden-formulas-and-check-boxes/)
- **Lesson:** NEVER use `getLastRow()` alone on a sheet that may have formula-filled empty rows. Either scan a pure-data column, or use `getNextDataCell(Direction.DOWN)` on a data column, or pre-format formulas with `IF(cond, , value)` instead of `IF(cond, "", value)`

### Categories Not Showing Bug (v0.4 → v0.6)
- **Issue:** Tapping a transaction in PWA showed only "Add Category" — no category buttons rendered
- **Root cause:** `selectTransaction()` only unhid the picker but did NOT call `renderCategories()`. The async `fetchCategories()` in `init()` silently swallowed errors (`.catch(() => {})`), so if the fetch failed, `store.categories` stayed empty and no buttons were ever rendered.
- **Fix:**
  1. `selectTransaction()` now calls `renderCategories()` before showing picker
  2. `init()` catch logs error + shows toast if categories empty
  3. `renderCategories()` shows "No categories loaded. Tap Refresh." when empty
  4. `refresh()` re-fetches categories (not just transactions)
- **Lesson:** Never silently swallow API errors — at minimum log to console and show user feedback when the result is critical (empty UI).

### knownTimestamps Stale Cache Bug
- **Issue:** `knownTimestamps` was persisted to localStorage. On new sessions, all previously-fetched timestamps were sent to parseAndFetch, which filtered them all out. Result: "No pending transactions" despite 31 pending in the sheet.
- **Root cause:** The server already filters by `status === 'pending'`, making client-side timestamp dedup redundant for excluding categorized transactions.
- **Fix:** Made knownTimestamps in-memory only (not persisted). Each session starts fresh. Server-side status filter handles dedup.

### Timestamp Format Bug (v7 → v7.1)
- **Issue:** Sheets auto-parses `"2026-04-12 14:13:00"` strings into JS Date objects when read via `getValues()`
- **Symptom:** `.toString()` on Date produced `"Tue Apr 14 2026 18:21:00 GMT-0600 (Mountain Daylight Time)"`
- **Fix:** Use `Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss')` in both `handleParseAndFetch_()` and `handleCategorize_()`
- **Lesson:** Always format Date objects explicitly when returning from Apps Script — never rely on `.toString()`

### processInfoAlerts refactor
- `processInfoAlerts()` — menu version with `SpreadsheetApp.getUi()` alerts
- `processInfoAlerts_()` — internal version, returns `{ parsed, threads, errors, errorDetails }`, no UI calls
- Both paths share the same parsing logic; split needed because `getUi()` throws in web app context

## GitHub Repository
- **Repo:** `fahyad/gsheetbudget2026-categorizerApp`
- **URL:** https://github.com/fahyad/gsheetbudget2026-categorizerApp
- **Local path:** `/Users/fahyadkhan/gsheetbudget2026-categorizerApp`
- **Visibility:** Public (required for GitHub Pages free hosting)
- **Purpose:** PWA for categorizing budget transactions on phone
- **GitHub CLI:** authenticated as `fahyad` via `gh` (keyring) — can push directly
- **Git protocol:** HTTPS

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Period Start = pay date | User preference |
| Period 1 starts Dec 25, 2025 | Captures Jan 1 fixed expenses |
| Period 26 ends Jan 5, 2027 | Covers gap until next pay |
| Pay Date column removed | Redundant with Period Start |
| Period Start/End hidden | Needed by formulas, not by user |
| Categories in D:E | No gap, clean layout |
| Fixed Monthly Expenses: compact master list | User wanted usable, editable sheet |
| SUMPRODUCT for fixed deductions | Eliminates expanded date rows; fully formula-driven |
| LET() in SUMPRODUCT | Avoids repeating INDEX/MATCH; cleaner formula |
| 13-month range (Jan 2026 – Jan 2027) | Period 26 extends into Jan 2027 |
| FixedExpenses_DueDay (not DueDate) | Stores day-of-month (1–31), not full dates |
| Purchases negative, income/refunds positive | User preference |
| Gross Pay from Transactions | Variable per period |
| Main + Sub category model | User wants grouping |
| Budget rebuilt on Add Category | Preserves Budgeted values |
| updateWorkbook() safe update | User needs to update script without losing data |
| Manual email trigger (not auto) | User controls when parsing happens |
| Trigger from PWA | One app for everything — parse + categorize from phone |
| Timestamp as dedup key | Date+time from email is unique per transaction |
| PWA local cache | Prevents re-fetching already-loaded transactions |
| Pending tab in same sheet | Simpler, everything in one workbook |
| Batched Gmail API calls | 4 calls total vs N per email; 2–4 sec expected |
| getBody() with HTML stripping | getPlainBody() fails on HTML-only emails (Scotiabank) |
| Batch sync (not per-txn) | 3 API calls vs 2+N; local categorize/undo instant; fewer failure points |
| Sync queue in localStorage | Survives page close; auto-loads on reopen; beforeunload warns if unsent |
| No knownTimestamps (removed) | Server filters by status=pending; syncQueue handles local dedup; old approach caused stale cache bug |
| Credit alerts only (Phase 1) | Debit alerts have different format; add later |
| `findNextEmptyRow_` scans col A | getLastRow() fails with formula-filled rows; col A is only pure data |
| LockService on mutating handlers | Prevents concurrent requests from corrupting sheet state |
| Write verification after setValues | Catches silent write failures before updating Pending |
| Sheet-based activity log + console mirror | User-visible tab + Cloud Logging for cross-session debug |
| Category validation in handlers | Fast-fail with clear error instead of silent data validation rejection |
| Archive logs at 5000 rows | Prevents Logs tab from slowing down the sheet |
| Apps Script as web app API | Free, handles auth via Google login, has Sheets access |
| GitHub Pages PWA | Free hosting, installable on phone, no app store |

## Known Data Issues (discovered via dumpSheet, 2026-04-18)

### Orphan Transactions in rows 1001–1008
Pre-v9, `findNextEmptyRow_` returned 1001 because `getLastRow()` counted formula-filled cells. Eight transactions categorized between Mar 31 and Apr 10 ended up in rows 1001–1008 of the Transactions tab. They are correctly formatted (Date, Merchant, Amount, Category) but:

- The named range `Transactions_Amount` is C2:C1000 — so Budget Spent SUMIFS does NOT include them
- The Main Category formula is only present in rows 2–1000 — so col E is blank for these rows
- The Period FILTER formula is only present in rows 2–1000 — so col G is blank

**Total invisible spending: $439.10**

| Row | Date | Merchant | Amount | Category |
|-----|------|----------|--------|----------|
| 1001 | Mar 31 | SHOPPERS DRUG MART #0387 | -$16.79 | Fahyad spending |
| 1002 | Apr 1 | SAFEWAY #8892 | -$26.24 | Groceries |
| 1003 | Apr 1 | ESSO 7-ELEVEN 37839 | -$40.00 | Gas |
| 1004 | Apr 2 | SHOPPERS DRUG MART #0387 | -$16.79 | Fahyad spending |
| 1005 | Apr 7 | SHELL C81551 | -$250.00 | Gas |
| 1006 | Apr 7 | HOMESENSE 123 | -$39.29 | House things |
| 1007 | Apr 7 | ESSO 7-ELEVEN 37814 | -$30.00 | Gas |
| 1008 | Apr 10 | PETRO-CANADA 85969 | -$20.00 | Gas |

**Cleanup options (deferred):**
1. One-shot Apps Script function: read rows 1001–1008, write to first empty rows in 2–1000, delete originals (`deleteRows(1001, 8)`)
2. Manual cut-paste in the editor (8 rows, ~30 sec)
3. Delete and re-categorize via the PWA (these are NOT in Pending tab anymore — would need to re-add)

### Fixed Monthly Expenses → Due Day formatted as Date
The Due Day column (C) is formatted as Date instead of Number. When you type "1" (meaning 1st of month), Sheets stores it as Date(1) → "Dec 31, 1899" in display. Underlying value coerces to numeric `1` in formulas, so the SUMPRODUCT in Budget _income (`=DATE(2026,M,dueDay)`) evaluates correctly — verified Budget Dec 25–Jan 20 _income = -$1948 = sum of all 4 expenses.

**But it's fragile.** Editing this column to change a Due Day will produce confusing display and may break the formula if Sheets coerces the new value differently.

**Cleanup (deferred):**
- Select C2:C5 → Format → Number → Plain
- Re-enter values 1, 1, 1, 1 (or actual due days)

## Sign Convention
- **Purchases:** negative (e.g. -50)
- **Income/Paycheck:** positive (e.g. +2000)
- **Refunds:** positive (e.g. +15)
- Budget Spent: `=-SUMIFS(...)` → positive display
- Available: Prior Available + Budgeted - Spent

## Category Structure
| Main Category | Sub Category | In Budget? |
|---------------|--------------|------------|
| Income | Paycheck | No (_income row handles it) |
| Living | Groceries | Yes |
| Living | Gas | Yes |
| Living | Parking | Yes |
| Nice Things | House things | Yes |
| Nice Things | Saajidah spending | Yes |
| Nice Things | Fahyad spending | Yes |
| Nice Things | Small trip | Yes |

## Fixed Monthly Expenses
| Name | Monthly Amount | Due Day |
|------|---------------|---------|
| Rent | $1,550.00 | 1 |
| Epcor | $60.00 | 1 |
| Phones | $88.00 | 1 |
| Student Loans | $250.00 | 1 |

Total: $1,948/month

## Pay Periods
| # | Period Start | Period End |
|---|-------------|------------|
| 1 | Dec 25 | Jan 20 |
| 2 | Jan 21 | Feb 3 |
| 3 | Feb 4 | Feb 17 |
| 4 | Feb 18 | Mar 3 |
| 5 | Mar 4 | Mar 17 |
| 6 | Mar 18 | Mar 31 |
| 7 | Apr 1 | Apr 14 |
| 8 | Apr 15 | Apr 28 |
| 9 | Apr 29 | May 12 |
| 10 | May 13 | May 26 |
| 11 | May 27 | Jun 9 |
| 12 | Jun 10 | Jun 23 |
| 13 | Jun 24 | Jul 7 |
| 14 | Jul 8 | Jul 21 |
| 15 | Jul 22 | Aug 4 |
| 16 | Aug 5 | Aug 18 |
| 17 | Aug 19 | Sep 1 |
| 18 | Sep 2 | Sep 15 |
| 19 | Sep 16 | Sep 28 |
| 20 | Sep 29 | Oct 13 |
| 21 | Oct 14 | Oct 27 |
| 22 | Oct 28 | Nov 9 |
| 23 | Nov 10 | Nov 24 |
| 24 | Nov 25 | Dec 8 |
| 25 | Dec 9 | Dec 22 |
| 26 | Dec 23 | Jan 5 |

## Development Workflow (clasp)

As of v9, Apps Script code lives in git at `apps-script/Code.js` in this repo. Local file is `.js` (clasp convention); it lands as `Code.gs` in Apps Script.

### ⚠️ CRITICAL: Always update the existing deployment, never create a new one

The PWA is hardcoded to call **one specific deployment URL**. If you create a new deployment via plain `clasp deploy`, you get a NEW URL, the PWA keeps calling the OLD URL, and your changes never reach the user.

**The production deployment ID is:**
```
AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ
```

This is the deployment baked into:
- `js/config.js` → `DEFAULT_API_URL` (the URL the PWA hits)
- `apps-script/deploy.sh` → `PROD_DEPLOYMENT_ID` (the deployment the script updates)

If you ever change one, change both — they MUST match.

### Daily loop (CORRECT — updates existing deployment, same URL)

**Easy mode (recommended):**
```bash
cd apps-script
# edit Code.js in your editor
./deploy.sh "v10 — short description"
```

`deploy.sh` runs `clasp push` then `clasp deploy -i <PROD_DEPLOYMENT_ID> -d "..."` for you. Same URL, new version number, PWA picks up the new code on next request.

**Manual mode (equivalent):**
```bash
cd apps-script
clasp push
clasp deploy -i AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ -d "v10 — description"
```

### ⛔ NEVER do this
```bash
clasp deploy -d "v10"          # WRONG — no -i flag means NEW deployment with NEW URL
clasp deploy --description "v10" # WRONG — same problem, new deployment
```
Either of these creates a new deployment with a new URL. The PWA keeps calling the OLD URL and never sees your changes. Your code is "deployed" but doesn't reach the user. Symptom: PWA appears to have stale behavior, no errors, no Logs entries for new requests.

### How to verify you used the right command

After deploying, check that your deployment list still has 7 entries (not 8):
```bash
clasp deployments
```
If the count grew, you accidentally created a new deployment. To recover:
1. Find the new deployment's ID in the list
2. Delete it: `clasp undeploy <newDeploymentId>`
3. Re-run the deploy with the correct `-i AKfycbw2EbHNk_...`

### Useful commands
```bash
clasp status             # show changed files (what will be pushed)
clasp pull               # pull changes made via the Apps Script editor
clasp logs               # view Cloud Logging output (console.log/warn/error)
clasp logs --watch       # live tail
clasp open               # open the Apps Script editor in browser
clasp versions           # list version history (each ./deploy.sh adds a version to PROD_DEPLOYMENT_ID)
clasp deployments        # list all deployments (should stay at 7 — only HEAD + 6 versions of prod)
```

### Rollback to a previous version
```bash
clasp versions                                  # find the version number you want
clasp deploy -i AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ -V <versionNumber> -d "rollback to vN"
```
Same `-i` (production deployment ID), but with `-V <number>` to point it at an older version. URL doesn't change.

### Setup on a new machine
```bash
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
npm install -g @google/clasp
export PATH="$HOME/.npm-global/bin:$PATH"   # add to ~/.zshrc too
clasp login                                 # OAuth (browser)
cd apps-script
clasp pull                                  # verify link works
```

### Files in `apps-script/`
| File | Purpose |
|------|---------|
| `Code.js` | Main script (1600+ lines). Source of truth. |
| `appsscript.json` | Manifest (OAuth scopes, runtime version, etc.) |
| `.clasp.json` | Local→remote project link (scriptId + rootDir). Keep in git; no secrets. |
| `.claspignore` | Allowlist: only `Code.js` + `appsscript.json` get pushed. |

### Secrets
- OAuth token lives in `~/.clasprc.json` (never inside repo; explicit in root `.gitignore`).
- The API key for the web app is in Apps Script Script Properties (set via menu "Set API Key"); never committed.

### Script ID
Stored in `apps-script/.clasp.json`. Public (embedded in deployment URLs anyway). Safe to commit.

### MCP integration (optional)
`~/Library/Application Support/Claude/claude_desktop_config.json` has a `mcpServers.clasp` entry that lets Claude call clasp directly as tools after restarting Claude Desktop. The CLI works fine either way.

---

## PWA Restructure (v0.12 → v0.14)

Shipped on branch `claude/read-markdown-context-v1c5T` in three deploys. `main` still serves v0.11 until this is merged. Full plan history: `/root/.claude/plans/let-s-discuss-layout-of-nifty-moore.md`.

### Shell + hash router (v0.12)

Chose hash routing (`#/categorize`, `#/dashboard`, `#/setup`) over History API because: no server-side rewrite rules, `<a href="#/..">` links give native accessibility and free back/forward, and GitHub Pages doesn't support per-route 404-to-index rewrites cleanly.

`js/router.js` is ~80 LOC: one `hashchange` listener, lazy `import('./views/...')` on first activation, wipes `#view-root`'s innerHTML before the next mount. View contract: every module default-exports `{ mount(root), unmount() }`. `unmount` is usually empty because in-view DOM is garbage-collected when innerHTML is cleared — only shell-level listeners need explicit cleanup.

`js/app.js` is ~40 LOC: version label, `#settings-btn` → `navigate('#/setup')`, `beforeunload` warning when `syncQueue.length > 0`, `store.loadCache()` once before `router.start()`.

**Lazy loading gain:** users who only categorize never download `dashboard.js`, `budget.js`, `suggest.js`, `swipe.js`. Verified via DevTools Network tab — `/js/views/dashboard.js` only appears when the Dashboard tab is tapped the first time. Subsequent loads come from the service worker's stale-while-revalidate rule for `/js/views/` and `/js/lib/`.

### v0.12.2 — moving chrome into the view that owns it

v0.12.1 shipped with Refresh + Sync in the shell header and a `setHeaderActions({refresh, sync, settings})` helper that each view called on mount. Fine mechanism, wrong location:

- Refresh and Sync are **categorize-flow tools** — they're meaningless on Dashboard or Setup.
- The helper required bookkeeping at every view, plus a "Done" relabel on Setup's Settings button because the whole header/tab-bar was hidden on `#/setup`.

v0.12.2 deleted `setHeaderActions` entirely. Header is now just title + version + Settings. Refresh is an inline `⟳` icon in `#period-filter-bar` (next to the period dropdown). Sync is a sticky bar (`#sync-bar`) above the tab-bar, hidden when `store.syncQueue.length === 0`. When the undo-bar is also visible, `.above-undo` on the sync-bar bumps it up 48px to stack.

The Categorize tab-bar label gained a pending-count badge: `Categorize (N)` when a queue exists, maintained by `router.updateCategorizeBadge()` — called on every route change and from `categorize.js` after any mutation (categorize, undo, sync complete). No pub/sub needed; explicit calls at the mutation sites.

Explicit non-goals (documented in the v0.12.2 plan): no pull-to-refresh gesture (~60 LOC of touch handling the icon covers functionally), no FAB, no pub/sub.

### v0.13 — dashboard data layer

The key design decision was **not** to add a new Apps Script endpoint. The spreadsheet has already computed every value we need: Budget rows 8+ contain pre-computed Spent + Available per period/category via SUMIFS, and Saving rows 6+ contain pre-computed per-goal rollups. `lib/budget.js` makes two parallel `dumpSheet` calls (Budget `A1:F215` = 1,290 cells; Saving `A1:I105` = 945 cells — both under the 10K cap), parses display-strings like `"$1,234.56"` into numbers on ingest, and caches the normalized shape for 10 minutes in localStorage.

Period switching is **zero-network**. One fetch pulls all 26 periods × 8 categories; the dropdown `onchange` filters the cached JS array. This was the biggest design win — naively fetching per-period would have been 26× worse.

Currency round-trip goes through two helpers. `parseCurrency` is tolerant of `$`, commas, whitespace, paren-negatives, blanks, null — 11 edge cases unit-tested via `node --input-type=module` before commit. `formatCurrency` uses `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` — all display runs through it so future locale changes happen in one place.

Cache invalidation is one explicit call from `views/categorize.js sync()`: after `batchCategorize` success, call `invalidateDashboardCache()` alongside `invalidateSuggestIndex()`. Two callers total, so no pub/sub yet.

**Known scope limit (documented in the plan's non-goals):** the per-period Net Income / Fixed Expenses / Ready-to-Assign numbers live in `Budget!A4:F4`, pre-computed against whatever `$B$1` (the sheet's period dropdown) is set to. Replicating them client-side for arbitrary periods would require three more `dumpSheet` calls (Transactions for Paycheck SUMIFS, FixedMonthlyExpenses for the LET monthly-day-check, Setup for PayPeriod dates). For v0.13 we read the summary row as-is; if `Budget!B1` ≠ the PWA's selected period, the hero card shows a small "sheet period: X" hint. Full replication is a v0.14+ stretch.

### v0.14 — auto-suggest engine + per-row swipe

Local-only by design. No LLM, no new endpoint. One `dumpSheet('Transactions', 'A2:H1000')` call builds `{normalizedMerchant: {category: count}}` — cached 1 hour, invalidated after `batchCategorize` just like the dashboard cache.

**Merchant normalizer** (`lib/suggest.js`): 6 regex rules applied in order. Goal is **deterministic variant collapse** — if `AMAZON.COM*MT12345 SEATTLE WA` and `AMAZON.COM*XY98765 SEATTLE WA` produce different keys, the index bucketizes them separately and confidence never rises above threshold. Initial draft of the rules failed that test; tightened to:

1. lowercase + trim
2. `^(sq|tst|sp|paypal)\s*\*\s*` — payment-processor prefixes
3. `\s*\*[a-z0-9]+` global — strip card/txn ID suffixes **anywhere**, not just at end
4. `\s*#\w+` — strip store IDs (`#4321`, `#10211`)
5. `\S*\d+\S*` — strip any token with a digit (catches `T-0384`, `123abc`, `12345`)
6. `\s+[a-z]{2}$` — strip trailing 2-letter state code
7. collapse whitespace

17 unit-test cases run before commit (`Starbucks #4321` → `starbucks`, `AMAZON.COM*MT12345 SEATTLE WA` and `AMAZON.COM*XY98765 SEATTLE WA` → same key, `TARGET T-0384` and `TARGET 00026452` → `target`, etc.). If you edit the rules, re-run the suite — the `node --input-type=module` block in the session log makes it easy.

**Confidence threshold:** `topCount / totalSeen >= 0.70` else no suggestion. PayPal-style ambiguous merchants don't get suggested; users handle them in Manual. Cold start with < 20 historical categorizations suggests almost nothing — by design, coverage grows as the user categorizes.

**Swipe gesture** (`lib/swipe.js`, ~95 LOC): `attachSwipe(translateEl, { revealEl, onLeft, onRight, threshold = 0.40 })`. The `translateEl`/`revealEl` split is critical — pseudo-elements transform with their parent, so if the row itself translates, the action-background `::before`/`::after` go off-screen with it. The Auto tab uses a two-element DOM: outer `.auto-row` stays static and holds the Accept/Skip backgrounds; inner `.auto-row-inner` has the visible content and translates. `attachSwipe(inner, { revealEl: outer, ... })` wires both.

Vertical-scroll preservation: on the first meaningful move (`|dx|` or `|dy|` > 4 px), if `|dy| > |dx| * 1.5` the swipe aborts and the browser takes scroll control. Short static taps (dx < 5 px and t < 300 ms) fall through to the normal click handler — that's how tap-to-open-picker still works on the same row. Commit (>= 40% of row width) animates the row off-screen over 180 ms, then fires the callback.

**`rejectedThisSession`** is a module-level Set in `categorize.js`, intentionally in-memory only. Next session — after more categorizations have expanded the index — a suggestion that was below threshold today might hit threshold, and the user deserves another look.

### GitHub Pages `.nojekyll` failure mode (Apr 23 2026)

First deploy of the feature branch to Pages timed out at `updating_pages` with `Error: Timeout reached, aborting!`. The build step "succeeded" — an artifact was created — but the deploy-to-live step hung and eventually cancelled. Misleading symptom: the failure log looks unrelated to content.

Root cause: GitHub Pages runs Jekyll by default when no `.nojekyll` marker exists. The build produced some artifact that the deploy step couldn't apply (likely a path or content that Jekyll munged). The static PWA shouldn't be Jekyll-processed at all.

Fix: empty `.nojekyll` at repo root + empty-commit retrigger. After landing the marker and pushing a no-op commit, the next deploy succeeded.

Rules:

- **Keep `.nojekyll` on every branch Pages deploys from.** When merging the feature branch into `main`, the marker goes with the merge.
- **Pages build "success" doesn't imply deploy success.** If the live site doesn't update, check Actions → pages build and deployment → the DEPLOY step specifically.
- **Empty-commit retrigger is a valid diagnostic.** `git commit --allow-empty -m "Retrigger Pages deploy" && git push` is safe and often clears transient GitHub infrastructure hiccups.

---

## Minimal Monochrome Redesign (v0.15 → v0.15.2)

The v0.14 PWA had full functionality but an indigo-themed aesthetic the user wanted simplified. Design work was outsourced to Claude Design (claude.ai/design); the handoff came back as a gzipped tar at `/v1/design/h/<id>` containing HTML/JS prototypes + README + chat transcripts. The README is emphatic: **read the chat transcripts first** — the prototype is the output of the iteration, but the chat is where the intent lives.

Three variations were initially offered (A Minimal Monochrome, B Paper Ledger, C High-Contrast Editorial). After iterating on Variation A, the user explicitly deleted B and C. Final direction locked in:

**Tokens** (defined as CSS custom properties in `:root`):
- `--ink: #0A0A0A`, `--bg: #FAFAF9`, `--bg-period: #EFEDE8`, `--bg-selected: #F5F5F4`, `--bg-active-tab: #F0EFEC`
- `--muted: #737373`, `--muted-2: #A3A3A3`, `--rule: #E5E5E3`, `--rule-2: #EDEDEB`
- Status colors: `--amber: #B45309` (zero), `--red: #B91C1C` (over), `--green: #15803D` (goal reached)

**Typography:** Inter 400/500/600/700 for UI (loaded from Google Fonts with preconnect). JetBrains Mono 500/600 reserved for the `+`/`−` toggle glyph only — one monospace touch as a counterweight to the otherwise Inter-only setup. Tabular-nums on all numeric columns.

**Period bar** (common to Categorize + Dashboard): `‹ ` + label + `▾` + ` ›` in a row at the very top, `#EFEDE8` tan background with thick black bottom border. Clicking the label toggles a 7-column 14-day calendar grid that shows txn dots under each day and inverts the "today" cell black. Right slot differs per view:
- Categorize → `Sync N` (black primary pill) when queue > 0, else `↻ Parse` (white outline pill).
- Dashboard → `Day X of Y` eyebrow text.

**Tab bar** (3 tabs): `Categorize / Dashboard / Settings`. Active state gets a thick black accent bar across the top + warm-gray `#F0EFEC` background tint + uppercase bold label. Previous `Sync-button-in-header` idea (v0.11) and `Settings-button-in-header` (v0.14) both retired.

**Dashboard body:** 4-col grid (Income / Fixed / Budgeted / Ready). Categories grouped by main name; `+`/`−` toggle at left, uppercase group label with letter-spacing, gray band background. Sub-rows inset at 42px from left; amounts right-aligned with `left/over` primary (color-coded) and `spent/budgeted` secondary (muted). 1px progress bar matches the status color.

### v0.15.1 — iOS safe-area fix

The design prototype assumed a fixed 390×844 iPhone 14 device frame, and its 54px "notch area" block got translated literally as `<header>{ height: 54px; background: var(--bg); }`. On iPhone 16 Pro (Dynamic Island, actual safe-area-inset-top ≈ 62px) this produced a visible white strip above the tan period bar.

Fix required three coordinated changes:

1. **`viewport-fit=cover` in the viewport meta.** Without this, `env(safe-area-inset-*)` returns `0` on iOS regardless of notch state — the entire CSS mechanism is gated by this opt-in.
2. **Delete the fixed header spacer.** Replaced with `env()`-aware padding on the top-most visible element in each view.
3. **Extend the period bar's tan background into the notch.** `.period-bar { padding-top: calc(env(safe-area-inset-top, 0px) + 10px); }` — the `10px` is the design's intended internal padding; the `env()` portion fills whatever inset the OS reports (`0` on SE, `47` on regular iPhones, `59` on older Pro, `62` on 16 Pro).

Also required: update every other top-anchored fixed element to be safe-area-aware. `#category-picker top: 100px` and `#error-toast top: 64px` were both calibrated against the old fixed-header layout and need `calc(env(safe-area-inset-top, 0px) + <offset>)` to avoid hiding under the Dynamic Island.

Principle: **when translating from a design prototype, identify every pixel-hardcoded "device chrome" assumption and translate it to an environment variable.** Anything else is a bug waiting for the next device generation.

### v0.15.2 — data-driven dedup

"Savings" main-category subs (Europe, NDEB) were rendering in two places: the dashboard's Budget category section (as `Savings > Europe: $0 left, $250 / $250, 1px bar`) AND the Saving Goals section below (as `Europe Trip: $3250 / $5000, 18 periods remaining, $97/period`). Same underlying sheet data via different lenses — the Saving tab's `Currently Saved` column IS `SUMIFS(Budget_Available, Budget_Category, linkedCategory, Budget_Period, $B$3)`.

Fix in `views/dashboard.js`:

```js
const linkedSubs = new Set(goals.map(g => g.linkedCategory).filter(Boolean));
const cats = allCats.filter(c => !linkedSubs.has(c.sub));
```

Intentionally data-driven, not `main === 'Savings'`. If the user later creates a goal under a different main (e.g., `Nice Things > Small trip`), it still gets suppressed from the Budget section. The Goal card carries strictly more info (target, periods remaining, needed-per-period), so nothing is lost.

---

## Client Metrics Pipeline (v0.15.3 + Apps Script v11.13)

### Motivation

Pre-v0.15.3 the only observability was the `Logs` tab (timestamp + action + duration + status + details + error). Each row captures Apps Script execution time, but **not**:

- client-perceived latency (fetch start → parse end)
- TLS / DNS / 302-redirect overhead to `script.google.com` → `script.googleusercontent.com`
- cold-container queue wait when multiple requests arrive concurrently
- duplicate calls (same action fired twice in the same session)
- cache-hit rates (did `lib/budget.js`'s 10-min cache actually save a round-trip?)
- view mount latency

After logs showed `parseAndFetch: 1789ms` but the user reported `~20s` perceived load, it became clear the gap lives in client + network + cold-container time — all invisible to server-side logging. Before picking a fix, the pipeline was built to capture exactly those signals.

### Architecture

**Client side** (`js/lib/metrics.js`, ~200 LOC):

- **Session id** generated once per module load (random base-36, 10 chars). Every metric carries it so rows can be grouped by cold PWA open.
- **Mount counter** incremented by `router.js noteMount()` on every successful view mount. Lets us distinguish "first mount of the session" (pays cold-container tax) from subsequent warm mounts.
- **In-flight Set** tracks active tickets; `recordStart(action)` returns a ticket, `recordComplete(ticket, {...})` finalizes. `inFlightAtStart` captures how many concurrent calls were in flight when THIS one started — direct evidence of the "3 parallel calls serialize on a cold container" pattern.
- **Previous-complete timestamp** lets us compute `msSincePrev` per call. A large gap (>30s) correlates with cold-container state; <1s correlates with the refresh flurry.
- **Duplicate detector**: per-action `lastStartByAction` map; if same action's `clientStartMs` is within 2s of its previous start, `duplicateDetected: true`. No analysis pass required — the column self-annotates.
- **Cache-hit events** emitted by `lib/budget.js` and `lib/suggest.js` via `recordEvent(kind, { cached: true/false, note: '...' })`. Lets us compute cache-hit rate ∈ sheet formulas.
- **Mount-timing events** emitted by `router.js`: `mount:categorize`, `mount:dashboard`, `mount:setup` with `clientTotalMs` = mount round-trip and `note` = "import=XXms,mount=YYms" so we can split lazy-load import time from render time.
- **Buffer**: 50-entry ring (drop oldest on overflow).
- **Flush**: `navigator.sendBeacon` on `visibilitychange: hidden` + `pagehide`. Fallback to `fetch({keepalive: true})`. Manual flush via `window.__apiStatsFlush()`. 30s safety interval flush if buffer >80% full mid-session.
- **Self-exclusion**: the `logClientMetrics` action is not instrumented (`metricKey !== 'logClientMetrics'` guard in `api.js request()`). Without this, each flush generates a new metric about the flush, which generates a new metric, indefinitely.

**Server side** (`apps-script/Code.js`, v11.13):

- `doGet` and `doPost` now inject `_elapsedMs = Date.now() - start` into the parsed response body before returning. Applies to both success and error paths. The client reads it into `serverMs` and computes `networkMs = clientTotalMs - serverMs` — the residual where TLS + DNS + redirect + cold-container wait live.
- `handleLogClientMetrics_` accepts `{ session, records: [...] }` and appends to a dedicated `ClientMetrics` tab. Tab auto-creates on first write with 18 columns (see below). One `setValues(rows)` call per batch — cheap at the scale of 50-record batches.
- Safety: hard 500-record cap per batch (client buffer is 50, but defense-in-depth against bugs).

### Tab schema

`ClientMetrics`:

```
ReceivedAt | SessionId | MountN | AppVersion | Connection | Action
ClientStartMs | ClientTotalMs | ServerMs | NetworkMs
InFlightAtStart | MsSincePrev | Duplicate | Cached
Ok | ErrorMsg | Bytes | Note
```

- **Timestamps**: `ReceivedAt` is server-side wall clock (for ordering); `ClientStartMs` is `performance.now()` relative (for delta math within a session).
- **`Action`**: the API action name, with `dumpSheet:<tab>` suffix for dumpSheet calls (splits the 8K-cell Transactions read from smaller ones). Also synthetic kinds: `mount:categorize`, `cache-hit:dashboard`, `cache-miss:suggest`, etc.
- **`Duplicate` / `Cached` / `Ok`**: `Y` / `N` / blank for compact filtering.

### CORS preflight avoidance

`sendBeacon` + Apps Script has a quiet trap. Apps Script web apps respond to `OPTIONS` preflight requests with a 302 redirect (there's no way to return a direct response), which breaks the CORS preflight handshake. The symptom is a silent fetch failure with no client-visible error — the beacon is dropped, no logs land.

Any POST whose `Content-Type` is `application/json` triggers preflight because it's a "non-simple" content type. Workarounds:

- Use `text/plain` Blob for `sendBeacon`. `Content-Type: text/plain` is a "simple" CORS content type that skips preflight. Server-side, Apps Script can still `JSON.parse(e.postData.contents)` regardless of the declared type.
- Put `action` and `apiKey` in the JSON body (not URL query string), so existing `doPost` routing works unchanged.

Applied in `lib/metrics.js flush()`:

```js
const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
navigator.sendBeacon(url, blob);
```

### Querying

Typical analysis queries (to be added as a sibling `ClientMetrics-Analysis` tab or run in a notebook):

- Cold start penalty: `AVERAGEIF(MsSincePrev, ">60000", NetworkMs)` vs `AVERAGEIF(MsSincePrev, "<5000", NetworkMs)` — the gap is the cold container + TLS/DNS cost.
- Concurrency cost: `AVERAGEIF(InFlightAtStart, ">=2", NetworkMs)` vs `AVERAGEIF(InFlightAtStart, "=0", NetworkMs)` — measures serialization on cold containers.
- Duplicate call frequency: `COUNTIF(Duplicate, "Y") / COUNTA(Action)`.
- Cache-hit ratio: `COUNTIF(Action, "cache-hit:dashboard") / (COUNTIF(Action, "cache-hit:dashboard") + COUNTIF(Action, "cache-miss:dashboard"))`.
- Per-view mount latency P90: `PERCENTILE(FILTER(ClientTotalMs, Action = "mount:categorize"), 0.9)`.

### Design principles worth preserving

1. **Diagnose before fixing.** Four candidate fixes (drop duplicate `fetchCategories`, defer `ensureIndexReady`, cache txns in localStorage, client-side logger) were all plausible. Instead of shipping them on guesswork, the logger goes first so each subsequent fix can be validated against before/after numbers in the same tab.
2. **Diagnostic plumbing must never affect the critical path.** `sendBeacon` is fire-and-forget; instrumentation is O(1); buffer drops oldest on overflow; flush endpoint failures are swallowed. At worst, you miss a batch of metrics — the app doesn't hiccup.
3. **Self-exclusion is not optional** for any logger that depends on the same transport it's measuring. One line in the instrumentation wrapper prevents the infinite-recursion bug class entirely.
4. **Keep ops logs and perf logs in separate tabs.** `Logs` stays lightweight for error monitoring (at most one row per API call). `ClientMetrics` can grow to hundreds of rows per session without polluting the ops view.

---

## Cold-Start Optimization (v0.15.4)

### Cold-Start Perf Findings + Fix (v0.15.4)

- **Symptom:** User reported cold PWA opens taking ~20 s before transactions appeared. `Logs` tab showed server exec times of 300–2500 ms per call — nowhere near 20 s in aggregate. Root cause was invisible to server logging.

- **Verification:** v0.15.3's `ClientMetrics` tab captured two real sessions (`5y2p0s2l5f`, `6w29253t3v`) with per-call `ClientTotalMs`, `ServerMs`, `NetworkMs`, `InFlightAtStart`, `MsSincePrev`, `Duplicate`, `Cached` columns populated. Representative cold-open row: `categories ClientTotal=2963ms, Server=301ms, Network=2662ms, Duplicate=Y`. Representative warm-container row: `version ClientTotal=2571ms, Server=46ms, Network=2525ms, MsSincePrev=340ms` — showing ~2.5 s of network overhead **on every call regardless of container warmth**.

- **Root cause:** three independent but co-occurring issues, plus one contradicted assumption:
  1. **Duplicate `categories`**: `mount()` fires `api.fetchCategories()` in the background for pre-warming the picker; `refresh()` then awaits its own `fetchCategories()` call. Two identical round-trips every mount.
  2. **Eager suggest-index warmup**: `mount()` always called `ensureIndexReady()` which does `dumpSheet('Transactions', 'A2:H1000')` — an 8000-cell read (~3.1 s cold). Users on the Manual sub-tab never need it that session.
  3. **Re-mounts pay the full tax**: router's per-view `await mount()` re-fires all awaited calls on every navigation; `store.transactions` was memory-only so re-mounts started with a blank list every time.
  4. **(Contradicted assumption)** The "Apps Script cold start" was assumed to be the main culprit, expected to affect mainly the first call. Data showed the ~2.5 s network tax applies **per logical fetch** — it's the 302 redirect from `script.google.com` to `script.googleusercontent.com` + TLS handshake, not a one-shot container spin-up. Parallel fetches serialize on the Apps Script single-threaded container, so fire-and-forget parallelism doesn't meaningfully help either.

- **Why it cascaded:** cold Categorize mount sequence was: `fetchCategories` (3 s) + `dumpSheet:Transactions` (3.1 s) + `parseAndFetch` (4.7 s with duplicate categories compounding) + blank paint waiting on all three. Empirically ~7.7 s to first useful paint + background cost of the now-unused suggest index. Re-mounting doubled this cost since nothing was cached.

- **Blast radius:** every cold PWA open AND every re-mount within a session since v0.12 (when the router-per-view architecture landed). Previously masked because v0.11 was one monolithic view that mounted once.

- **Fix (v0.15.4):** four coordinated PWA-only fixes, no Apps Script changes:

  ```js
  // js/views/categorize.js — share mount's promise, throttle silent re-mounts
  let categoriesPromise = null;
  let didInitialRefresh = false;
  let lastRefreshMs = 0;
  const REFRESH_THROTTLE_MS = 60 * 1000;

  async function refresh({ force = false } = {}) {
    if (!force && didInitialRefresh && (Date.now() - lastRefreshMs) < REFRESH_THROTTLE_MS) {
      return;  // silent re-mount no-op
    }
    // ... force branch re-fetches categories fresh; non-force awaits categoriesPromise
  }
  ```

  ```js
  // js/views/categorize.js — defer suggest index to Auto activation
  if (activeSubtab === 'auto') {
    ensureIndexReady().then(() => renderTransactions()).catch(err => ...);
  }
  // In setSubtab('auto'): same call, idempotent on cache hit.
  ```

  ```js
  // js/store.js — persist transactions, replace-semantic setter
  setTransactions(list) {
    this.transactions = list.slice().sort(...);
    this.saveTransactions();
  }
  // Called by refresh(): store.setTransactions(fresh.filter(notQueued))
  ```

- **Verification (post-deploy, 2026-04-24):** v0.15.4-tagged `ClientMetrics` rows from sessions `2e6604343r`, `3h0s4b3g18`, `4j2w0v1w6k`. Five of six perf targets hit:

  | Metric | v0.15.3 baseline | v0.15.4 measured | Status |
  |---|---|---|---|
  | Rows with `Duplicate=Y` | many per session | 0 | ✅ |
  | `dumpSheet:Transactions` on Manual mount | 1 (3136 ms) | 0 calls | ✅ |
  | `mount:dashboard` re-mount (cache hit) | 3861 ms | 3 / 14 / 16 ms | ✅ |
  | `mount:categorize` re-mount (throttled) | 6864–9198 ms | 1 ms | ✅ |
  | `mount:setup` re-mount `version` call | 2525 ms | 0 ms (cached) | ✅ |
  | `mount:categorize` first cold | 7763 ms | 7348 / 9038 ms | ❌ |

  The miss on first cold `mount:categorize` is bounded by `parseAndFetch` (~3 s server) + `categories` (~500 ms server) + ~2.5 s per-call network tax. With duplicate `categories` removed (saving ~3 s), the remaining critical path is genuinely those two awaited calls. Beating it further would need either a consolidated `dashboardData`-style endpoint OR cold-container optimization on Google's side — neither in scope. **Important nuance:** `mount:categorize ClientTotalMs` measures when `await refresh()` returns, not when pixels paint. The localStorage txns cache (Fix #3) paints in <200 ms regardless, so the user-perceived cold-open is materially faster than the metric suggests.

  Two suspicious observations from the same data, neither a v0.15.4 bug:
  - Session `2e6604343r` opened with 5× `Invalid API key` rows + 1× `HTTP 404` row producing a 26 s `mount:dashboard`. This was the v0.15.3 → v0.15.4 service-worker activation transition. Transient.
  - Session `4j2w0v1w6k` MountN=1 had `categories ClientTotalMs=20383 ms` after `msSincePrev=66697 ms`. Almost certainly iOS Safari suspending the tab mid-fetch, then resuming much later. Browser behavior, not a code bug.

- **Lesson:**
  1. **Server-side duration is a subset of user-perceived latency.** Apps Script's `Logs` captures only handler exec time; Apps Script web apps pay a 302-redirect + TLS tax *per logical fetch* on top. To diagnose perf, you need client-side measurement (`lib/metrics.js` + `ClientMetrics` tab) OR the problem stays invisible.
  2. **"Fire in parallel at mount, await in refresh" is a trap pattern.** If the same endpoint is reachable through both entry points, one of them must yield to the other — usually by sharing a promise. Added as CLAUDE.md trip-up #25.
  3. **Every `await mount()` on re-navigation is expensive unless explicitly throttled.** The router's clean re-mount semantics make this non-obvious. Added as CLAUDE.md trip-up #26.
  4. **Client-side cached state beats server-side cleverness for perceived performance.** `store.transactions` in localStorage turned a 5 s blank screen into a <200 ms paint even on cold open — no server change required.
  5. **Diagnose before fixing** (from Phase 21 lesson): the four candidate fixes from earlier log analysis were all validated as correct by real `ClientMetrics` data, but the priority ordering changed after seeing network-tax-per-call. If we'd shipped the first three without data, we'd have under-estimated how much the re-mount throttle mattered.
  6. **Mount latency is a misleading single number for "is the app fast?"** — the metric improvement table above shows `mount:categorize` first-cold barely changed, but the user experience improved dramatically because cached txns paint before mount completes AND every subsequent in-session navigation dropped to ~1–16 ms. Always pair mount timings with cache-hit ratio + perceived-paint reasoning when evaluating perf changes.

---

### Time-Driven Email Parsing (v11.16 → v11.17)

A design+implementation note rather than a bug postmortem — this is a deliberate architectural shift, not a fix for something broken.

- **Situation:** After Phase 22 squeezed everything PWA-side, the residual cost on `mount:categorize` was the `parseAndFetch` server time itself (~1–3 s), most of which was the inline Gmail scan inside `processInfoAlerts_`. The ~2.5 s per-call network tax (302 redirect + TLS + cold-container queue) is unavoidable as long as the PWA talks to Apps Script as a synchronous proxy. So the next-largest lever was: stop doing work inside the request that doesn't need to be there.

- **Decision:** Move email parsing off the synchronous request path entirely, using a time-driven Apps Script trigger. The PWA becomes a near-pure reader of pre-parsed rows. Two-phase split was deliberate — each phase rollback-able independently:
  1. Trigger only (PWA contract unchanged) → if the trigger doesn't fire reliably, no behavior change for the user; manual `parseAndFetch` still parses inline.
  2. Read-only `parseAndFetch` (with opt-in force-parse) → only ship after Phase 1 is observed working in production.

- **Why this works for THIS app specifically:**
  - `processInfoAlerts_` was already trigger-safe (LockService + `Budget/Processed` Gmail label + `uniqueSuffix_` timestamp hash). No correctness work needed.
  - Single user, personal use case → being behind ≤1 hour on email is acceptable. No need for sub-minute responsiveness.
  - Existing "↻ Parse" pill in the period bar was already wired for "I want fresh now" — re-using it for the explicit force-parse path meant zero new UI.

- **Implementation:**
  ```js
  // apps-script/Code.js (v11.16)
  function processInfoAlertsTrigger() {                         // trigger handler
    var start = Date.now();
    try {
      var r = processInfoAlerts_();
      PropertiesService.getScriptProperties()
        .setProperty('LAST_TRIGGER_RUN', new Date().toISOString());
      if (r.skipped) return;                                    // lock_timeout already logged
      if (r.parsed > 0 || r.errors > 0) {                       // silent on no-op runs
        logActivity_('triggerParseEmails', Date.now() - start,
          r.errors > 0 ? 'partial' : 'success',
          'parsed:' + r.parsed + ' threads:' + r.threads + ' errors:' + r.errors,
          r.errors > 0 ? r.errorDetails.join('; ') : '');
      }
    } catch (err) {
      logActivity_('triggerParseEmails', Date.now() - start, 'crash', '',
        err.toString() + '\n' + (err.stack || ''));
    }
  }

  function installEmailTrigger() {                              // idempotent
    var existing = ScriptApp.getProjectTriggers();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getHandlerFunction() === 'processInfoAlertsTrigger') {
        ScriptApp.deleteTrigger(existing[i]);
      }
    }
    ScriptApp.newTrigger('processInfoAlertsTrigger')
      .timeBased().everyHours(1).create();
  }
  ```

  ```js
  // apps-script/Code.js (v11.17) — handleParseAndFetch_
  var parseResult = { parsed: 0, threads: 0, errors: 0, errorDetails: [] };
  var wantParse = params.withParse === '1' || params.withParse === 'true' || params.withParse === true;
  if (wantParse) parseResult = processInfoAlerts_();
  // ... read uncategorized rows from Transactions tab as before
  ```

  ```js
  // js/api.js (v0.17.0)
  export async function parseAndFetch({ withParse = false } = {}) {
    const extra = withParse ? { withParse: '1' } : {};
    return request('parseAndFetch', buildUrl('parseAndFetch', extra));
  }

  // js/views/categorize.js — inside refresh({ force })
  const data = await api.parseAndFetch({ withParse: force });
  ```

- **Trade-offs accepted:**
  - **Up to 60 min lag on new transactions** in the typical case. Mitigated by the existing "↻ Parse" pill, which still does the inline scan when the user explicitly asks for fresh.
  - **No PWA-side trigger-health UI.** Apps Script's built-in failure-notification email exists if the trigger ever crashes; the manual Parse pill works as escape hatch. We can add a `LAST_TRIGGER_RUN` reader if we ever observe silent failures, but YAGNI for now.
  - **Logs tab grows by ~1 entry per "interesting" trigger run** (filtered to runs that parsed something OR errored). At ~1–2 new transactions/day, ~30–60 entries/month. Existing 5000-row rotation handles this easily.

- **Quota math:**
  - Apps Script triggers: 24 runs/day × ~3 s = ~72 s/day on the 90-min/day consumer quota → 1.3% utilization.
  - Gmail reads: ~50/day max → trivially under the 20k/day quota.

- **Backward compat (verified by reading both directions):**
  - Old PWA → new server: PWA never sends `withParse`. Server reads as undefined. Server skips parse, returns just the read. Hourly trigger keeps the sheet fresh, so the user sees nothing different.
  - New PWA → old server: server doesn't know about `withParse`, parses anyway. Slower than ideal, correct.

- **Bring-up gotchas (added as CLAUDE.md trip-ups):**
  1. **Apps Script editor's Triggers panel doesn't auto-refresh after programmatic install.** A `ScriptApp.newTrigger().create()` call DOES install the trigger, but an open editor tab from before the install can show empty state. Hard-reload (Cmd+Shift+R) or close-and-reopen the tab. Trip-up #27.
  2. **Running a trigger handler from the editor's Run button does NOT install a trigger.** It just executes the function once (useful for forcing a permissions re-grant on new scopes). The trigger itself comes from `installEmailTrigger`. Symptom of confusing the two: a `triggerParseEmails` row appears in Logs but no trigger shows in the Triggers panel. Trip-up #28.

- **Lesson:**
  1. **The single-decision review is more valuable than a per-bug review.** A long list of trip-ups (302 redirect, POST body loss, deployment-ID coupling, in-sheet observability, CORS preflight workaround) all rooted in one architectural choice ("Apps Script as synchronous proxy") were addressable by removing parsing from the request path — not by fixing each trip-up individually. When a code review surfaces 10 problems, look for the one decision that produced them.
  2. **Re-use existing affordances before adding new UI.** I almost added a force-parse icon button in the categorize header. Re-reading `categorize.js` revealed the "↻ Parse" pill already existed for exactly this case. Net Phase 2 PWA change: ~10 lines.
  3. **Stage rollouts that are independently reversible.** Phase 1 alone delivered the "emails appear without opening the PWA" win. Phase 2 alone delivered the perf win. Each is rollback-able to the prior state. Bundling them would have made any post-deploy issue harder to bisect.

---

### Goal Archive Flow (v11.18)

A user-visible behavior change rather than a bug postmortem: archive of a savings goal now removes the linked sub-category from the Budget tab, where previously it only hid from the PWA dropdown.

- **Symptom:** User completed the "Banff" savings goal, manually checked Setup col F (Archived?) for the linked sub-category, and reported the Banff row was still appearing in the Budget tab. Expectation didn't match design.

- **Root cause:** Three separate concerns hadn't been linked into one user-facing action.
  - `handleCategories_` already filtered Setup col F → PWA dropdown was correct.
  - `rebuildBudgetInternal_` read only `D2:E100`, ignored col F → Budget tab kept archived rows by design (comment at Code.js:1885 documented this as intentional: *"kept in Setup so historical Budget rebuilds preserve their data"*).
  - `handleArchiveGoal_` / `handleUnarchiveGoal_` (v11.14) DO atomically set Saving col J + flip Setup col F. But registered in `routeAction_` and dormant — no PWA caller, no menu wrapper. The "right" flow was unreachable.

- **Design decision:** The original "kept in Budget" rule made sense for "I want to stop categorizing new transactions but keep history visible" — a use case nobody actually has in this single-user app. Real use case is "I'm done with this goal; remove it." So:
  - **Filter Setup col F in `rebuildBudgetInternal_` too.** Symmetric to `handleCategories_`.
  - **Add `Archive Goal...` / `Unarchive Goal...` menu items.** Wrap the existing endpoint internals + force a Budget rebuild atomically.
  - **No PWA-side archive UI in this round** — sheet-side menu solves the immediate user need; PWA-side would be a follow-up.

- **Trade-off accepted:** Budgeted values for archived sub-categories in past periods are lost on the wipe-and-rebuild. Spent values stay reachable (computed via SUMIFS on Transactions). Disclosed in the menu's YES/NO confirmation prompt. Justification: archive is a "this goal is done" signal — keeping budgeted values around for a category the user explicitly stopped budgeting to is more clutter than help.

- **Fix:**
  ```js
  // Code.js — refactored archive handler. Lockless internal + thin web wrapper.
  function handleArchiveGoal_(body) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
    }
    try {
      return jsonResponse_(archiveGoalInternal_(body && body.goalName, body && body.status));
    } finally { lock.releaseLock(); }
  }

  function archiveGoalInternal_(goalNameRaw, statusRaw, ssOpt) {
    // ... validation, scan Saving rows ...
    // Duplicate-name detection (v11.18 addition):
    var matchIdxs = [];
    for (var r = 0; r < goalRows.length; r++) {
      if (String(goalRows[r][0] || '').trim() === goalName) matchIdxs.push(r);
    }
    if (matchIdxs.length > 1) {
      return { success: false, error: '...appears in multiple rows...' };
    }
    // ... rest unchanged from v11.14 logic ...
    return { success: true, goal: {...}, categoryArchived: <bool> };
  }
  ```

  ```js
  // Code.js — rebuildBudgetInternal_ filter change.
  // Before:
  var catRaw = setup.getRange('D2:E100').getValues();
  if (catRaw[c][0] !== '' && catRaw[c][1] !== '' && catRaw[c][0] !== 'Income') {
    budgetCats.push(catRaw[c][1]);
  }
  // After (v11.18):
  var catRaw = setup.getRange('D2:F100').getValues();
  if (catRaw[c][0] !== '' && catRaw[c][1] !== '' && catRaw[c][0] !== 'Income' && catRaw[c][2] !== true) {
    budgetCats.push(catRaw[c][1]);
  }
  ```

  ```js
  // Code.js — menu wrapper holds one lock across archive + rebuild.
  function archiveGoalMenu() {
    var ui = SpreadsheetApp.getUi();
    var goalName = promptForGoalName_(ui, 'archive');
    if (!goalName) return;
    // ... show YES/NO confirmation with data-loss disclosure ...
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) { ui.alert('Another operation in progress, try again.'); return; }
    try {
      var result = archiveGoalInternal_(goalName, 'Achieved', ss);
      if (!result.success) { ui.alert('Archive failed: ' + result.error); return; }
      try { rebuildBudgetInternal_('rebuild', ss); }
      catch (rebuildErr) { /* log + tell user to run Update Script */ }
      // ... success message including "kept active because other goals" hint ...
    } finally { lock.releaseLock(); }
  }
  ```

- **Edge cases handled:**
  - **Duplicate goal names** (v11.18 new): scan all rows; fail with row numbers if same name in multiple rows. Was: silently pick first match.
  - **Linked sub-category shared with another active goal**: `hasOtherActive` check (preserved from v11.14) — Setup col F flip is skipped; `categoryArchived: false` returned; menu surfaces the reason.
  - **No active goals to archive / no archived goals to unarchive**: `promptForGoalName_` short-circuits with `ui.alert('No goals to archive...')` before showing the prompt.
  - **Rebuild failure mid-archive**: wrapped in try/catch inside the menu; logs `archiveGoalMenu / rebuild_failed` to Logs tab, tells user to run Update Script manually. Saving status + Setup col F still get committed (idempotent on re-run).
  - **User cancels at either prompt**: returns null, no lock acquired, no state change.

- **Not handled (deferred):**
  - **Restoring budgeted values on unarchive** — requires a persistent budgetedMap survival mechanism (Script Properties, hidden tab). Not worth the complexity for a personal-use app where archive is "this goal is done forever" 95% of the time.
  - **PWA-side archive button** — endpoints stay reachable; UI is the only missing piece. A few hours of PWA work, deferred.
  - **`onEdit` trigger that auto-rebuilds Budget when Setup col F changes** — would unify the manual-col-F-edit flow with the menu flow. Risk: surprising side-effects from any Setup edit. Use the menu instead.

- **Lesson:**
  1. **A long list of "doesn't work" symptoms can collapse to one missing connection.** Three independent code paths each handled their slice of "archive" correctly. The bug was that no UI tied them together. The fix isn't fixing the parts — it's the wrapper. (Compare to the time-driven email parsing finding above: 10 trip-ups → 1 architectural decision. Same shape.)
  2. **Dormant endpoints are technical debt with a friendly face.** `handleArchiveGoal_` had been registered in `routeAction_` for two weeks before this session — looked complete from `apps-script/Code.js`'s perspective, but had never been called by anything. Worth checking, periodically: which web-app actions actually have callers? Anything in the action map without a UI invocation is at risk of being subtly broken next time anyone touches it.
  3. **"By design" comments age badly when the use case behind them was wrong.** The Code.js:1885 comment saying *"Archived rows are kept in Setup so historical Budget rebuilds preserve their data"* was technically accurate but documented a use case nobody had. Worth re-reading old design comments occasionally — sometimes the design was right for an audience the project no longer has.

---

### Pixel UI Theme System (PWA v0.18.0 → v0.19.1)

A second visual direction (terminal/pixel aesthetic) shipped as a CSS overlay scoped via the `data-theme` attribute. Coexists with the v0.15 Minimal Monochrome direction as the structural foundation.

- **Symptom:** None — additive feature, not a bug fix. User shared a Claude Design "PWA V2" handoff and asked to try it cautiously without breaking the existing UI.

- **Decision:** Don't replace mono. Add pixel as an opt-in overlay with the same DOM and JS, just different CSS. Use `:root[data-theme="pixel"]` selector scope so the new rules are inert until the attribute flips. Keep mono CSS in `style.css` as the structural foundation that pixel.css overrides — every pixel rule is a `var()`-aware override or attribute-scoped addition. Result: rollback is a single attribute flip; full revert is removing one stylesheet link.

- **Architecture:**
  ```
  index.html
    <head>
      <link rel="stylesheet" href="css/style.css">    ← always loaded; mono baseline
      <link rel="stylesheet" href="css/pixel.css">    ← always loaded; rules inert without data-theme="pixel"
      <script>document.documentElement.setAttribute('data-theme', 'pixel');</script>  ← early, before paint
    </head>
  
  css/style.css       :root { --bg: #FAFAF9; --ink: #0A0A0A; ... }
  css/pixel.css       :root[data-theme="pixel"] { --bg: #0A0A0A; --ink: #F0E9D6; ... }
  
  All component rules use var(--bg), var(--ink), etc. — they re-cascade
  automatically when the attribute flips. The selectors don't need to
  know which theme is active.
  ```

- **Fix sub-phases (each rollback-able independently):**
  - **v0.18.0 (Phase A+B+C):** infrastructure (toggle UI in Settings, both stylesheets shipped, JS-side persistence). Color palette + JetBrains Mono + stepped progress bars + single accent stripe.
  - **v0.18.1 (Phase D):** today chip + terminal calendar.
  - **v0.18.2 (Phase C+):** dashboard polish + two real bugs fixed (`.cat-bar` 1px-tall, header background covering accent stripe).
  - **v0.19.0 (Phase G):** multi-select rail (separate finding below).
  - **v0.19.1:** branch fixes after on-device — summary wrapping (font 18→14 + nowrap), tab tap feedback (`:active` rule), force-pixel default (toggle removed from Settings; mono CSS still loaded as structural foundation).

- **Lessons:**
  1. **Two-stylesheet load + attribute scope is the cleanest theme overlay pattern.** Browsers handle the cascade for free; no JS theme-switcher logic needs to walk the DOM.
  2. **Force-flip the attribute in the `<head>` script before any CSS parses** to avoid flash-of-mono on cold open. `document.documentElement.setAttribute('data-theme', X)` runs synchronously in the head; CSS doesn't paint until parsed.
  3. **Bugs in Phase C surfaced only on phone.** The stepped gradient on `.cat-bar-fill` looked correct in source review but rendered invisibly because `.cat-bar` was 1px tall. Always test new visuals on the target device before declaring done.
  4. **Mono as structural foundation, pixel as overlay** keeps rollback cheap. Removing the pixel branch entirely just means deleting one stylesheet link; the app keeps working.

---

### Multi-Select Category Rail (PWA v0.19.0)

Phase G of the pixel UI redesign. The most behavior-significant change in the arc — first new categorize-flow paradigm since v0.11.

- **Symptom (in user terms):** Old flow ("tap a transaction → pick its category → repeat") was optimized for "what is this transaction?". User has a backlog of receipts every few days; clearing them is faster as "pick a category → check matching transactions → commit" — the receipt-sorting metaphor.

- **Design (state machine):**
  ```
  IDLE        no chip armed, no selection
              tap chip      → ARMED
              tap txn       → opens picker (today's flow, fallback)
  
  ARMED       chip selected, no txns checked yet
              tap same chip → IDLE
              tap diff chip → ARMED with new chip, selection clears
              tap txn       → ARMED+SEL
  
  ARMED+SEL   chip armed AND ≥1 txn checked
              Commit        → batch-categorize all selected to chip → IDLE
              Cancel        → IDLE (clear all)
              tap chip      → IDLE (clear all)
              tap diff chip → ARMED with new chip, selection clears
              tap txn       → toggle that txn's checked state
  ```
  Override of mockup: mockup KEEPS selection on chip-switch, which would let user select 5 Coffee txns then accidentally tap Travel and assign all 5 to Travel. Phase G clears on chip-switch — safety > one fewer tap.

- **Fix:**
  - `js/views/categorize.js`: new module-level `activeCategory` (string|null) + `selectedTimestamps` (Set<string>) state. `selectedTimestamp` (single, picker mode) kept for the IDLE-tap-txn fallback path.
  - New tap router routes to picker-open OR toggle-checkbox based on `activeCategory` presence.
  - New `commitBatch()` calls `store.removeTransaction` + `store.addToSyncQueue` per selected item, sets `lastCategorized = { batch: [...], category }`, transitions to IDLE.
  - New `renderRail()` builds the chip strip + status row; selective DOM updates on tap (no full re-render — flip classList only).
  - Backend untouched: `handleBatchCategorize_` already accepts a list of `{ts, cat}` items.

- **Edge cases handled:**
  - Period switch mid-selection: clears `selectedTimestamps` but keeps `activeCategory`.
  - Sub-tab switch (Manual → Auto): clears both.
  - Tab away (onHide): clears both.
  - Add Category mid-selection: modal opens, on save the new category auto-arms, selection clears.
  - Sync in flight + commit: allowed; new items append to syncQueue.
  - Sync in flight + Undo: blocked (matches today's behavior).
  - Batch undo: loops through `lastCategorized.batch`, restores each. If sync ran between commit and undo (some items left syncQueue), only restores items still in queue + reports partial.
  - Long category names: chip width grows; rail just scrolls more.
  - >30 categories: horizontal scroll fine on mobile.
  - Goal-linked categories appear in rail; archived categories don't (already filtered server-side).

- **Lesson:**
  1. **Mutual exclusion of two flows beats forcing one.** Picker fallback for IDLE-tap-txn keeps the 2-tap quick-categorize path. Rail is for batch. Both have value; they don't overlap.
  2. **Override the mockup's UX choices when they're footguns.** The chat transcript showed considered design but didn't catch the chip-switch-keeps-selection problem. Worth questioning every "design decision" in a handoff against your specific use case.
  3. **State machine on paper before code.** Three explicit states (IDLE / ARMED / ARMED+SEL) with explicit transition rules made the implementation straightforward and the edge-case audit tractable.

---

### Claude Code Workflow Tooling (main, 2026-04-30)

Project-level `.claude/` infrastructure to make Claude Code sessions in this repo land with state in mind, run diagnostic commands without prompting, and invoke established workflows in one token.

- **Symptom:** New Claude sessions paid the "ramp-up tax" every cold open — needed to read CLAUDE.md, notice the 4-step state-check ritual, run those commands one by one (each prompting for permission), then synthesize state. Existing setup was already strong (CLAUDE.md, working `update-budget-docs` skill, pre-commit hook, `deploy.sh`, `deploy` shell function) but project-level Claude Code features were unused.

- **Decision:** Add four pieces of infrastructure, all project-scoped (committed under `.claude/`), all rollback-able as single-commit reverts.

- **Fix:**
  ```
  .claude/settings.json              ← permission allow-list (~18 read-only Bash commands)
                                       deny-list (9 destructive ops blocked outright)
                                       SessionStart hook → state-check.sh
                                       statusLine config → statusline.sh
  
  .claude/state-check.sh             ← runs at session start, outputs:
                                       branch + sync state vs origin
                                       uncommitted count + first 8 names
                                       last 5 commits
                                       Apps Script + PWA + SW versions
                                       ⚠ DRIFT warning if Code.js ≠ VERSION.txt
                                       ~305 ms locally
  
  .claude/statusline.sh              ← persistent display: <branch>[ *<dirty>] · <as-version>[⚠]
                                       ~176 ms refresh
  
  .claude/skills/state/SKILL.md      ← /state — re-runs state-check on demand
  .claude/skills/lint/SKILL.md       ← /lint — runs docs lint, reports cleanly
  .claude/skills/deploy/SKILL.md     ← /deploy "<desc>" — orchestrates pre-flight +
                                       deploy.sh + post-deploy commit + push
  ```

- **What's allowed vs prompted:**
  - **Allowed (no prompt):** all read-only diagnostic git ops, `node --check`, the docs lint, `wc`/`ls`/`file`/`head`/`tail`. Anything that mutates state stays prompted.
  - **Denied outright:** `rm -rf`, `git push --force` and variants, `git reset --hard`, `git clean -fd` and variants. Even if Claude tries to construct one of these, it won't execute.
  - **Prompted (default):** `git commit`, `git push`, `git checkout`, `./apps-script/deploy.sh`, `clasp` commands, file mutations via shell.

- **Edge cases handled:**
  - Script run outside a git repo: `state-check.sh` exits 0 silently.
  - No upstream branch: tolerated; "vs origin: no upstream tracked".
  - Missing `VERSION.txt` or `Code.js`: lines just don't render.
  - DRIFT detection: catches Code.js APP_SCRIPT_VERSION ≠ VERSION.txt (the v11.14-class incident pattern).
  - Skill registration mid-session: known limitation — skills register at session START; skills added or merged in mid-session require a fresh session to be invocable. Documented in trip-up #30 + the existing `update-budget-docs` SKILL.md "Known limitation" section.

- **Lesson:**
  1. **Project-scoped Claude Code config is committed dev infrastructure.** Lives in `.claude/`, ships with the repo, every fresh session inherits it. Doesn't need any per-machine setup.
  2. **Permissions tighten the trust boundary.** Allow-list reduces friction without weakening safety; deny-list catches typos before they execute. Default-prompt-everything is too noisy; default-allow-everything is too risky.
  3. **The hook + status line + slash commands together compress the cold-open ritual** from ~5 manual commands to zero. The CLAUDE.md ritual was always right; relying on Claude to remember it was the failure mode.
  4. **Skills register at session start.** Mid-session adds work but require restart to be invocable via `Skill()` — read SKILL.md directly and follow manually as the workaround.

---

### Budget Tab Schema Evolution (v11.19)

The Budget tab gains an explicit "Rolled Over" column between Spent and Available, surfacing the prior-period carryover that was previously hidden inside the Available formula. Math is unchanged; only the decomposition + visibility is new.

- **Symptom:** User reported Groceries showing "$0.00 LEFT" with "$0 spent / $98 budget" beneath. Mathematically appears wrong (budgeted $98 minus spent $0 should leave $98 available, not $0). Reality: prior period overspent by $98, the deficit rolled forward, this period's Available = $98 budgeted − $98 carried-over deficit = $0. The carryover term was always part of the Available formula but invisible — no column showed it, no PWA label hinted at it.

- **Fix (v11.19, deployed @44):** Extract the carryover into its own column F. Available simplifies from a compound SUMIFS expression to pure arithmetic.

  ```js
  // Before — buildAvailableFormula_ embedded the recursive SUMIFS lookup:
  '=IF(MATCH(A_row,PayPeriods_Label,0)>1,'
    + 'IFERROR(SUMIFS(Budget_Available,Budget_Period,'
    +   'INDEX(PayPeriods_Label,MATCH(A_row,PayPeriods_Label,0)-1),'
    +   'Budget_Category,C_row),0),'
    + '0)+D_row-E_row'

  // After — split into two helpers:
  buildRolledOverFormula_(row):
    '=IF(MATCH(A_row,PayPeriods_Label,0)>1,'
      + 'IFERROR(SUMIFS(Budget_Available,Budget_Period,'
      +   'INDEX(PayPeriods_Label,MATCH(A_row,PayPeriods_Label,0)-1),'
      +   'Budget_Category,C_row),0),'
      + '0)'

  buildAvailableFormula_(row):
    '=F_row+D_row-E_row'
  ```

  Layout changes:

  ```
  Before (6 cols):
    A: Period | B: Main Cat | C: Category | D: Budgeted | E: Spent | F: Available

  After (7 cols):
    A: Period | B: Main Cat | C: Category | D: Budgeted | E: Spent | F: Rolled Over | G: Available
  ```

  Named range updates:

  ```
  setNamedRanges_:
    Budget_RolledOver = budget.getRange('F8:F500')   // NEW
    Budget_Available  = budget.getRange('G8:G500')   // shifted F → G
  ```

  Saving tab + dashboard formulas reference these by name, so the column shift is transparent — they continue to work without code changes.

- **Edge cases handled:**
  - **First period (no prior):** MATCH > 1 guard returns 0. Rolled Over = $0. Available = D − E. Same as before.
  - **New category mid-year (no prior data):** SUMIFS returns 0. Rolled Over = $0. Correct.
  - **Archived sub-category** (filtered out of `rebuildBudgetInternal_` since v11.18): no Budget row at all. Unaffected.
  - **User edits Budgeted mid-period:** Available recalculates → next period's Rolled Over recalculates → cascade continues. No special handling needed; Sheets dependency graph propagates.
  - **User runs Update Script:** `budgetedMap` preserves user-entered Budgeted across the wipe-and-rebuild. Rolled Over and Available re-derive fresh from formulas.
  - **Recursion safety:** Each row's Rolled Over depends on prior period's Available; that prior Available depends on its own Rolled Over (which depends on prior-prior Available); chain bottoms out at period 1 where MATCH > 1 returns false. No circular reference because Sheets evaluates in dependency order, not cell-position order.

- **Coupling that bit us — and is now a trip-up (#32):** The PWA's `parseDashboard` (in `js/lib/budget.js`) reads Budget tab columns by index — `row[5]` for Available pre-v11.19. After the column shift, `row[5]` is Rolled Over and Available is `row[6]`. Adding/removing/reordering Budget tab columns requires a paired PWA parser update OR the dashboard cards silently show wrong numbers (no error, just values from the wrong column).

  Why named ranges DON'T help here: the PWA reads via the `dumpSheet` endpoint which returns raw 2D arrays indexed by column position, not by named range. Anything that consumes the dump has to know the column layout. Saving tab + sheet-side formulas use named ranges (resilient to column shifts); PWA's dashboard parser doesn't (must update in lockstep with schema changes).

- **Lesson:**
  1. **Decompose compound formulas when the hidden terms are user-relevant information.** Available was always `RolledOver + Budgeted − Spent`; collapsing it into a single SUMIFS-driven cell saved a column but cost user comprehension. Three columns ($D + $F − $E = $G) is more honest than one.
  2. **Schema changes propagate through every consumer that reads by index.** Saving tab and sheet-side formulas use named ranges and survive transparently. The PWA reads raw arrays from `dumpSheet` and breaks immediately. Plan paired updates whenever `rebuildBudgetInternal_`'s column count changes.
  3. **"By design" + "user can't see it" can both be true.** The original embedded-SUMIFS Available formula was correct AND opaque. Correctness doesn't preclude the need for visibility.
  4. **Math-doesn't-look-right reports are usually visibility issues.** When the user said "Groceries math doesn't add up," the bug wasn't math — it was the missing term. Look for hidden inputs before assuming the formula is wrong.

### FIXED Summary-Cell Accordion (PWA v0.19.4 → v0.19.6)

The dashboard's `Fixed −$1,948.00` summary cell turned into an accordion: tap to expand a sticky inline panel listing each Fixed Monthly Expense due in the selected period. Architecturally the smallest visible change; in practice it touched the data layer (third parallel `dumpSheet` call), the period model (client-side mirror of the sheet's fixed-expenses formula), and the layout model (sticky stack ladder with safe-area-aware offsets).

- **Symptom (in user terms):** Dashboard summary strip showed `Fixed −$1,948.00` with no way to ask "what fixed expenses are due in this period?" without opening the sheet. User wanted everything-on-one-page (categories toggled + fixed expenses toggled) OR concise (everything collapsed) — choosing what's visible without tab-switching round-trips.

- **Design iterations (3, only #3 shipped):**
  ```
  #1 Sub-tab control bar          rejected — adds new bar
  #2 Drill-down view + back btn   rejected — round-trip cost
  #3 Inline accordion in cell     ACCEPTED — info on-demand, no nav
  ```

- **Research informed the implementation:**
  - Avoid `<details>`/`<summary>` — Safari has known grid-layout bugs with them
  - Use the WAI-ARIA APG accordion pattern: `<button>` + `aria-expanded` + `aria-controls` + panel with `role="region"` + `aria-labelledby` + `hidden` attribute toggle
  - Skip animation on first cut (was going to add later if user asked; never asked)
  - Persist open/closed state to localStorage so re-mounts don't snap shut
  - `display: none` (via `hidden`), NOT opacity:0 — screen readers + tab order should ignore the closed panel

- **Fix (v0.19.4 — accordion infrastructure):**
  - `js/views/dashboard.js`:
    - Module state: `expandedSummary` (Set<string>; persisted to `budget_dashboard_summary_expanded` localStorage key via `readExpandedSummary_`/`writeExpandedSummary_`).
    - `summaryCell()` extended to render as `<button class="summary-cell-toggle" aria-expanded aria-controls>` when called with accordion config, plain `<div>` otherwise. Same visual surface; one becomes interactive.
    - `toggleFixedExpand` flips state, calls `renderFixedPanel`, persists to localStorage.
    - `renderFixedPanel` walks `data.fixedMonthlyExpenses` filtered through `dueDatesInPeriod`, formats each row, returns HTML for the panel content.
  - `js/lib/budget.js`:
    - `BUDGET_RANGE` extended to `A1:G215` (col shift from v11.19's Rolled Over insertion).
    - New `FIXED_RANGE = 'A2:C50'`.
    - `fetchFresh()` parallelizes a third `dumpSheet` call (Budget + Saving + Fixed Monthly Expenses).
    - `parseDashboard` returns new `fixedMonthlyExpenses` field (array of `{name, amount, dueDay}`).
    - Cache key bumped to `_v3` (every shape change → invalidate prior cached payloads).
  - `js/periods.js`:
    - `BUDGET_YEAR = 2026` constant exported.
    - `dueDatesInPeriod(dueDay, periodStart, periodEnd)` mirrors `buildFixedExpensesFormula_` exactly: iterates m=0..12, computes `Date.UTC(BUDGET_YEAR, m, dueDay)`, filters by period range, detects month overflow (e.g., Feb 30 → Mar 2 should NOT count as "Feb's due date"). Returns array of dates inside the period.
    - Sanity check: dashboard sums the panel and warns to console if total disagrees with sheet's Fixed value (catches BUDGET_YEAR drift between PWA and Apps Script — both have the constant, both have to bump in lockstep on Dec 31).

- **Fix (v0.19.5 — sticky containment):**
  User reported the period bar wasn't sticking when scrolling — it scrolled away after ~60 px. Root cause: `.period-bar` had `position: sticky; top: 0`, but its containing block `#period-bar-host` was a thin shrink-to-fit `<div>`. Sticky elements only float within their containing block's box; once the wrapper's bottom passes the sticky `top` offset, the sticky child scrolls off as if it were `position: static`. Promoted the sticky property to `#period-bar-host` itself — the wrapper now has the full scroll-extent of the page to stick within.

  ```css
  /* Before — sticky on inner; wrapper is shrink-to-fit, only ~60px stick range */
  #period-bar-host { /* no sticky */ }
  .period-bar { position: sticky; top: 0; }

  /* After — sticky on wrapper; full-page stick range */
  #period-bar-host { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 9; }
  .period-bar { /* no sticky needed */ }
  ```

  This pattern was reapplied to the FIXED panel in v0.19.6 (next sub-version).

- **Fix (v0.19.6 — sticky panel + header removal + open-state highlight):**
  User feedback on the open panel:
  1. Make the panel itself sticky too (anything toggled from a sticky element should remain sticky)
  2. Remove the grey "Fixed expenses Apr 29 – May 12" header inside the panel (redundant with the period bar above)
  3. Highlight the FIXED button when toggled open

  Implementation:
  ```css
  /* Sticky stack ladder: period bar above, fixed panel below, no overlap */
  #period-bar-host { z-index: 9; top: env(safe-area-inset-top, 0px); }
  .fixed-panel    { z-index: 6; top: calc(env(safe-area-inset-top, 0px) + 108px); position: sticky; }

  /* Open-state highlight on the toggle button */
  .summary-cell-toggle[aria-expanded="true"] {
    background: var(--bg-period);  /* tan tint matches period bar */
    /* + amber label color + amber chevron */
  }
  ```

  Plus: `.fixed-panel-head` element removed entirely (DOM + CSS). A stale-read race during the v0.19.6 commit required a follow-up commit (`ed7da6e`) to actually delete the head element after the initial commit (`6d9650e`) only got the CSS + version bumps. Caught by visually inspecting the deployed PWA.

- **Pixel UI graduation to main (2026-05-09):**
  After v0.19.6 verified working on phone, user asked to graduate the pixel branch. Plan: `--no-ff` merge to preserve history (vs. force-push), tag the pre-merge state for rollback, keep the branch on remote as a snapshot.
  - Merge conflicts on `js/config.js`, `sw.js`, `js/views/dashboard.js` (header removal) — all resolved by taking pixel's version (the desired state). Doc files auto-merged cleanly because pixel had absorbed main's docs earlier in the arc.
  - Tag `main-pre-pixel-merge` created as rollback handle.
  - `pwa/pixel-ui-redesign` branch preserved on remote per user request, but inactive — future PWA work happens on main.
  - Post-merge: APP_VERSION on main = v0.19.6, CACHE_VERSION = v36, force-pixel via early `<head>` script in `index.html`, no in-app theme toggle.

- **Edge cases handled:**
  - Period switch with panel open: `renderFixedPanel` re-runs against new period's `dueDatesInPeriod` filter; panel content updates in place, open state preserved.
  - Empty period (no fixed expenses due): panel renders an empty-state row; total shows $0; sanity check passes ($0 == sheet's $0).
  - Cold open with prior open state: localStorage read in `mount()`; panel renders open if state persisted; first paint matches user's last-seen state.
  - Panel sticky overlapping a category card: tested at scroll positions where a category card is exactly under the sticky panel — z-index stack handles it (panel z-index 6, cards default z-index 0).
  - Safe-area-aware offset on iPhone 16 Pro: `env(safe-area-inset-top, 0px) + 108px` keeps the panel below the period bar regardless of Dynamic Island inset.
  - Dec 31 due day in a Jan 2027 period: `dueDatesInPeriod` walks m=0..12 inclusive of m=12 (Dec of year+1 = Jan next year), so the next year's January period correctly receives this period's Dec 31 expense — verified by sanity check matching sheet total.
  - `BUDGET_YEAR` drift between PWA constant and Apps Script `BUDGET_YEAR` constant: sanity check warns to console; doesn't block render but flags the issue. Annual rollover touches both files.

- **Lesson:**
  1. **Sticky containment is a containing-block constraint, not a viewport constraint.** A sticky child only floats within its parent's box. If the parent is shrink-to-fit, the sticky child can only stick within those few pixels. When adding sticky, audit the containing-block chain — promote sticky to the tallest available wrapper. Codified as trip-up #33.
  2. **Sticky stack ladders need explicit z-index + top.** Period bar at `z-index: 9` + `top: env-inset` and fixed panel at `z-index: 6` + `top: env-inset + 108px` form a deterministic visual stack. Without the offset math, the panel would float over the period bar; without z-index, scroll-overlapping content would leak through.
  3. **Mirror, don't re-derive.** The PWA's `dueDatesInPeriod` doesn't reinvent the math — it intentionally mirrors the sheet's `buildFixedExpensesFormula_` line-for-line, including the m=0..12 boundary and the month-overflow guard. The sanity check on totals catches drift between the two implementations on real data, every render. Re-deriving would have introduced subtle off-by-month bugs that only show up in edge-case periods (Feb 30, Dec 31).
  4. **WAI-ARIA APG over `<details>`/`<summary>`.** The native HTML elements would be one less line of code, but Safari grid bugs + the inability to style the disclosure triangle exactly + the incompatibility with our existing `summaryCell()` function made the manual ARIA pattern a clear win. Manual ARIA = `<button aria-expanded aria-controls>` + panel `<div role="region" aria-labelledby hidden>` + JS toggling `hidden` and `aria-expanded` in lockstep. That's it.
  5. **Persist UI state when re-mounts are common.** The dashboard view re-mounts on every navigation back to `#/dashboard`; without localStorage persistence the panel would always start closed, and the user's "I want it open" preference would be lost on every nav. Three lines of code: `readExpandedSummary_` on mount, `writeExpandedSummary_` on toggle.
  6. **Look for stale-read races on Edit-after-Edit sequences.** During v0.19.6 the header-removal Edit succeeded structurally but pulled an outdated file snapshot — the deployed PWA still showed the header until commit `ed7da6e`. The fix: always re-Read before Edit if there's been any intervening tool-state change. Verifying the actual deploy (not just the diff) caught it.

### Cold-Start Round 2 (Apps Script v11.20 + PWA v0.19.7 → v0.19.8)

After the rulepop architecture comparison surfaced "what could we borrow?", three perf proposals were evaluated against measured data, two implemented (plus a third PWA-only win that emerged from inspection). The validation step mattered — the highest-profile proposal (build step / Vite) turned out to be a workflow change disguised as a perf change once the bytes-vs-round-trips question got asked properly.

- **Symptom (in user terms):** Cold-open Categorize takes 7-9 s to first paint. v0.15.4 closed the duplicate-fetch + suggest-index gaps. The remaining ~7 s floor is entirely round-trip cost: two awaited Apps Script calls (`fetchCategories` + `parseAndFetch`), each paying the documented ~2.5 s 302+TLS network tax. Apps Script web apps redirect from `script.google.com` to `script.googleusercontent.com`, and TLS handshake + redirect dominate the per-call cost regardless of container warmth (Phase 22 finding: parallel fetches don't help — single-threaded Apps Script container serializes them anyway).

- **What was evaluated and rejected:**
  - **Build step (Vite/esbuild):** total JS = 131 KB uncompressed → ~50 KB gzipped already. Even minify+treeshake to 25 KB saves ~25 KB on first install only — ~100 ms on 4G. Zero impact on the 7-9 s cold-start floor. Cost: breaks the "edit + git push" workflow, adds CI, makes phone debugging harder. Verdict: workflow polish disguised as perf. Defer indefinitely.
  - **CSS attribute period filtering:** pre-rendering all 26 periods upfront and flipping a `body[data-period="N"]` selector to switch periods. Period-switch is currently pure client-side, sub-100 ms, no measured complaint. Pre-rendering 26× more DOM upfront would regress the cold mount we're trying to fix. Verdict: actively harmful. Skip.

- **Fix #1 — Preconnect (PWA v0.19.7):**
  Two `<link rel="preconnect">` tags in `index.html` for `script.google.com` and `script.googleusercontent.com` (the latter is the 302-redirect target). Browser warms the TLS handshake while the rest of the HTML parses; the first API call after cold open finds the connection ready. Saves ~100-500 ms on the first call.

  ```html
  <link rel="preconnect" href="https://script.google.com" crossorigin>
  <link rel="preconnect" href="https://script.googleusercontent.com" crossorigin>
  ```

  `crossorigin` matches the actual fetch (which is CORS-enabled). Without it the browser warms a separate non-CORS connection and the actual fetch creates a new one anyway. Both hosts are baked into the deployment ID and have been stable for years.

- **Fix #2 — Cache-first dashboard paint (PWA v0.19.7):**
  Pre-fix `dashboard.js mount()`: render skeleton spinner → `await load()` → `getDashboardData()` returns cached if <10 min old, else fetches. With cache >10 min old the user sees a 5-7 s spinner before any dashboard content. Now `mount()` reads localStorage synchronously via `peekDashboardCache()` (which already existed since v0.19.0 for the chip rail), paints immediately if any cache exists, then calls `load()` in the background — same pattern `store.transactions` got in v0.15.4 Fix #3.

  ```js
  // js/views/dashboard.js — new mount() head
  const peeked = peekDashboardCache();
  if (peeked) {
    cachedData = peeked.data;
    cachedData._fetchedAt = peeked.fetchedAt;
    renderPeriodBar();
    renderBody();
    load({ forceRefresh: false }).catch(err => console.error('Dashboard refresh failed', err));
  } else {
    renderPeriodBar();
    await load({ forceRefresh: false });
  }
  ```

  Risk inspected: cache could be days old, dollar amounts off. Acceptable — that's the entire point of stale-while-revalidate. `selectedPeriodIdx` is set from `currentPeriod()` at mount, so the right period renders even from stale cache.

- **Fix #3 — Bootstrap endpoint (Apps Script v11.20 + PWA v0.19.8):**
  This is the headline change. New Apps Script action `bootstrap` returns categories + parseAndFetch in one round-trip. Server-side it's pure dispatch: `handleBootstrap_` calls `handleCategories_()` + `handleParseAndFetch_()` (both lock-free, both read different tabs — no overlap), parses each handler's response, and merges into one JSON envelope with per-section error fields:

  ```js
  function handleBootstrap_(params) {
    var catResponse = handleCategories_();
    var txnResponse = handleParseAndFetch_(params);
    var cat, txn, catErr, txnErr;
    try {
      var pc = JSON.parse(catResponse.getContent());
      if (pc.success) cat = pc.categories; else catErr = pc.error;
    } catch (e) { catErr = 'parse: ' + e; }
    try {
      var pt = JSON.parse(txnResponse.getContent());
      if (pt.success) { txn = pt.transactions; /* + parsed, parseErrors */ } else txnErr = pt.error;
    } catch (e) { txnErr = 'parse: ' + e; }
    return jsonResponse_({
      success: true,
      categories: cat || [],
      categoriesError: catErr,
      transactions: txn || [],
      transactionsError: txnErr,
      parsed: parsed,
      parseErrors: parseErrors,
      _bootstrapMs: Date.now() - bootstrapStart
    });
  }
  ```

  PWA-side, `js/views/categorize.js` got a `startBootstrap_({withParse})` helper that tries `api.bootstrap` first; on any failure (including old Apps Script returning "Unknown action: bootstrap" during a deploy gap) falls back to the v0.15.4 `Promise.all([fetchCategories, parseAndFetch])` pattern transparently:

  ```js
  async function startBootstrap_({ withParse = false } = {}) {
    let result;
    try {
      const data = await api.bootstrap({ withParse });
      if (!data.categoriesError && !data.transactionsError) {
        result = { categories: data.categories, transactions: data.transactions, ... viaBootstrap: true };
      }
    } catch (err) {
      console.warn('bootstrap unavailable, falling back:', err.message);
    }
    if (!result) {
      const [catData, txnData] = await Promise.all([
        api.fetchCategories(),
        api.parseAndFetch({ withParse })
      ]);
      result = { categories: catData.categories, transactions: txnData.transactions, ... viaBootstrap: false };
    }
    store.setCategories(result.categories);
    renderCategories(); renderChips(); updateRailVisibility();
    return result;
  }
  ```

  `bootstrapPromise` (renamed from `categoriesPromise`) is the module-level singleton; mount() fires it; refresh() awaits on non-force, replaces with a fresh `withParse:true` call on force.

- **Why bootstrap actually wins (the validation step):**
  - 2 × ~2,500 ms network tax → 1 × ~2,500 ms = ~2,500 ms saved per cold mount
  - Server-side total work is the SUM of categories + parseAndFetch internals (no parallelism gain because Apps Script container is single-threaded — verified in Phase 22). So the server pays the same compute; the client pays one TLS+302 instead of two.
  - Combined response size: categories ≤100 rows × 2 cols + uncategorized txns typically <100 = ~2-50 KB. Two orders of magnitude under Apps Script's 10 MB response limit.
  - Lock-free: neither underlying handler takes a lock, so combining them doesn't introduce contention.
  - Backward compatible by construction: bootstrap is a NEW action, so old PWAs never call it; new PWAs fall back transparently when the action is unknown.

- **Edge cases handled:**
  - **Old Apps Script + new PWA (deploy-window transient):** `api.bootstrap` returns `{success:false, error:"Unknown action: bootstrap"}`, `request()` throws, fallback fires. User pays one wasted ~2.5 s round-trip on first cold mount during the deploy window. Mitigation: deploy Apps Script first, then push PWA.
  - **Partial failure (e.g., categories OK but parseAndFetch threw):** combined response has `transactionsError` set, `categoriesError` null. Current implementation falls back fully if EITHER section errored — simpler and safer than partial use. Could optimize to use the OK section + supplement the failed one separately later.
  - **Force refresh:** refresh() with `force=true` replaces `bootstrapPromise` with a fresh `startBootstrap_({withParse:true})` call. The old promise still settles but no one awaits it. No leak.
  - **bootstrap AND fallback both fail:** `bootstrapPromise = null` so the next refresh attempts a fresh fire instead of awaiting a rejected promise forever. Same retry semantics as v0.15.4 `categoriesPromise`.
  - **Re-mount within session:** the `bootstrapPromise` singleton is reused. Combined with the existing 60 s `REFRESH_THROTTLE_MS`, re-mounts within 60 s are no-ops (preserves Phase 22 win).
  - **Network timeout:** the 30 s timeout in `request()` (api.js) applies to bootstrap too. Timeouts trigger the fallback path.

- **What this does NOT touch:**
  - Dashboard's 3 parallel `dumpSheet` calls (Budget + Saving + Fixed) — different code path, different cache TTL, different lifecycle. Adding to bootstrap would couple Categorize cold-start latency to Dashboard schema. Keep separate.
  - `batchCategorize` sync flow (separate concern, different lock model)
  - `addCategory` modal (already client-side store update + single API call)
  - `version`, `logClientMetrics`, archive endpoints (orthogonal)

- **Rollback handles:**
  - PWA v0.19.7 (Phase 29.1): revert the commit. 4 files (index.html, dashboard.js, config.js, sw.js); cache-first paint and preconnect are independent.
  - PWA v0.19.8 (Phase 29.2): revert the commit. 4 files (api.js, categorize.js, config.js, sw.js). Apps Script unchanged — `bootstrap` action stays live but unused.
  - Apps Script v11.20: rollback not needed (additive). To roll back: redeploy v11.19, the new `bootstrap` action becomes "Unknown action", and PWAs fall back to dual fetch automatically.

- **Verification (post-deploy, requires real ClientMetrics):**
  - `bootstrap` rows in ClientMetrics with `Ok=true`, `ServerMs` ≈ sum of (categories + parseAndFetch ServerMs) — confirms server-side work is unchanged
  - `mount:categorize` `ClientTotalMs` ≈ 4,800 ms ± 1 s on cold sessions (down from 7,300+)
  - Fallback path verifiable by temporarily breaking the bootstrap action — ensure PWA recovers without user-visible failure
  - Dashboard cold-open with stale localStorage cache paints in <200 ms (vs the 5-7 s spinner pre-v0.19.7)

- **Lesson:**
  1. **Validate proposals against measured data before implementing.** The build-step proposal sounded compelling ("3-4× smaller bundle!") until the data showed bytes weren't the bottleneck — the 2.5 s per-call network tax dominates everything. The CSS period-filter proposal sounded clever until the data showed period-switch wasn't slow. Validation killed two proposals, saved weeks of incorrect work, AND surfaced a fourth proposal (cache-first dashboard) that hadn't been on the list.
  2. **Apps Script web app perf is dominated by round-trip count, not server work.** Each call pays ~2.5 s for the 302 + TLS handshake regardless of container warmth. Reducing call count is the only lever that actually moves the needle for cold-start. Server-side optimization (cache, faster handlers) only matters once round-trips are minimized.
  3. **Backward-compatible by construction beats backward-compatible by versioning.** The bootstrap endpoint is purely additive — old endpoints stay live forever. New PWA detects unknown action and falls back. No version negotiation, no feature flags, no contract migration. Compare to a hypothetical "bootstrap REPLACES categories+parseAndFetch" design that would have required a synchronized deploy. Ours can deploy Apps Script and PWA hours apart with no user-visible breakage (just a one-time 2.5 s penalty during the gap).
  4. **Keep the side-effect application close to the data.** `startBootstrap_` applies `store.setCategories` + render side-effects inside the helper, not at the call site. This means cold mount renders the chip rail as soon as categories arrive — even before refresh() finishes filtering transactions through the sync queue. Centralizing the side-effect prevented a class of "rail flickers because categories arrived but render didn't fire" bugs.
  5. **Workflow improvements aren't perf improvements.** Build steps, content-hashed assets, automated cache-busting — all real wins for developer experience but invisible to the user opening the app. When the perf complaint is "cold open is slow," look for round-trips, not bytes.

### Duplicate Parsing + Period Bug (Apps Script v11.21 — Phase 30)

User reported duplicate transactions in the PWA. Investigation (Gmail connector + dumpSheet against API key) discovered TWO critical bugs causing the Budget tab totals to be wrong in opposite directions.

- **Symptom (in user terms):** PWA list showed the same merchant+amount+date appearing 2-4 times, e.g. "LS MISSION FUN & GAMES $114.29 (2026-04-29)" listed twice. Three concrete cases the user pointed at: LS MISSION ×2, TIM HORTONS #7546 $12.87 ×2 (actually 3 in sheet — 1 categorized + 2 uncategorized), PETRO-CANADA 85969 $50.00 ×2.

- **Investigation methodology (the "no assumptions" pass):**
  1. **Source (Gmail):** queried `from:infoalerts@scotiabank.com subject:"Authorization on your" newer_than:30d` → 67 emails, all with `Budget/Processed` label applied. Same query with `-label:Budget-Processed` → 0 results (label exclusion currently works).
  2. **Sheet (Transactions tab via dumpSheet):** 133 data rows; 15 distinct Timestamp strings with multiple rows (some 2×, some 3×, one 4×); ~$435 of phantom over-counted spending.
  3. **Logs tab:** 27 `triggerParseEmails` runs, each shows `parsed:N threads:1` where N varies 1-4. 0 lock timeouts. 0 parser errors.
  4. **Completeness check:** all 67 Gmail emails present in sheet at least once → no missing transactions; the only problem is over-counting.
  5. **Ladder pattern discovered:** within Gmail thread `19decb304f53f0f7` (May 3-4, 4 messages), 1st (oldest) message has 4 sheet rows, 2nd has 3, 3rd has 2, 4th has 1 — each new message triggers re-parse of all prior messages in the thread.
  6. **Period anomaly noticed in the same dump:** several rows have `period='Unassigned'` despite the Date being clearly inside a known period. Found 100% of last-day-of-period transactions affected — Mar 31, Apr 14, Apr 28, May 12 all show 'Unassigned' regardless of categorization status.

- **Bug 1 — Duplicate parsing (root cause):**
  Scotiabank info-alerts all share the literal same subject ("Authorization on your credit account"), causing Gmail to bundle them into single threads. The parser's loop:

  ```js
  for (var t = 0; t < allMessages.length; t++) {
    for (var m = 0; m < allMessages[t].length; m++) {   // <-- iterates ALL messages
      var msg = allMessages[t][m];
      // ... parse and push to newRows
    }
  }
  ```

  When a NEW message arrives in an already-`Budget/Processed`-labeled thread, Gmail's negative-label search briefly re-matches the thread (eventual consistency between message-add and label-inheritance for new messages in existing labeled threads). On the re-match, the inner loop iterates ALL messages — old AND new. The S3 hash-suffix mechanism (Phase 14) was designed to dedup within a batch using a per-call collision counter (`batchKeys`), but the counter resets per call, so cross-batch re-processing produces byte-identical timestamps.

- **Bug 2 — Last-day-of-period silent loss (concurrent discovery):**
  The parser wrote `emailDate` to col A as a full Date object including time (e.g. `May 12 2026 12:50:00`). The Period formula at `setTransactionFormulas_` line 2674 compared this against PayPeriods stored at midnight:

  ```
  =IF(A{tr}="", "", IFERROR(FILTER(Setup!$C$2:$C$27,
    Setup!$A$2:$A$27 <= A{tr},          ← Start <= Date (works any time of day)
    Setup!$B$2:$B$27 >= A{tr}           ← End >= Date (FAILS on last day with time)
  ), "Unassigned"))
  ```

  On the LAST day of a period: `End (May 12 midnight) >= A (May 12 12:50)` → FALSE → no period matches → "Unassigned" → row silently excluded from `Budget!Spent` SUMIFS keyed on Period+Category. Mid-period transactions worked because End was a future date. Only last-day transactions failed.

- **Bug 3 — Hash birthday collision (latent, mitigated):**
  `shortHash_` used 4 hex chars (16 bits, 65,536 values). Birthday paradox: ~256 distinct (merchant, amount) pairs → 50% collision probability. Not actively a problem yet, but became a latent false-drop risk under the new write-time dedup: if a real new transaction's hash collided with an existing row's hash, the dedup would skip the real transaction.

- **Fix (v11.21 — single deploy, three layers):**

  ```js
  // Layer 1: widened shortHash_ from 2 → 4 MD5 bytes (4 → 8 hex chars).
  // Backward compatible — existing 4-char-hash rows still match by string equality.
  function shortHash_(input) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input);
    var hex = '';
    for (var i = 0; i < 4; i++) {  // was 2
      var b = bytes[i] & 0xff;
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
  }

  // Layer 2: write-time timestamp dedup in processInfoAlerts_ Step 3.5.
  // LockService already in place — no race window between read and write.
  if (newRows.length > 0) {
    var existingTimestamps = {};
    var lastRowForDedup = txn.getLastRow();
    if (lastRowForDedup >= 2) {
      var existingH = txn.getRange(2, 8, lastRowForDedup - 1, 1).getValues();
      for (var ei = 0; ei < existingH.length; ei++) {
        var ets = existingH[ei][0];
        if (ets !== '' && ets !== null && ets !== undefined) {
          existingTimestamps[String(ets)] = true;
        }
      }
    }
    var beforeDedup = newRows.length;
    newRows = newRows.filter(function (r) { return !existingTimestamps[r.timestamp]; });
    var skipped = beforeDedup - newRows.length;
    if (skipped > 0) {
      logActivity_('processInfoAlerts', 0, 'dedup_skip',
        'skipped ' + skipped + ' duplicate rows (already in sheet)', '');
    }
  }

  // Layer 3a: parser writes Date column at midnight (no time portion).
  var dateOnly = new Date(
    emailDate.getFullYear(),
    emailDate.getMonth(),
    emailDate.getDate()
  );
  newRows.push({ date: dateOnly, ... });

  // Layer 3b: Period formula wraps A{tr} in INT() so comparison tolerates time.
  // Setup A/B values are already midnight Dates — no INT() needed on Setup side.
  '=IF(A' + tr + '="","",IFERROR(FILTER(Setup!$C$2:$C$27,'
    + 'Setup!$A$2:$A$27<=INT(A' + tr + '),'
    + 'Setup!$B$2:$B$27>=INT(A' + tr + ')),"Unassigned"))'
  ```

  Plus `dedupeAndNormalizeTransactionsRescue` — one-shot menu item for existing data. LockService-protected. Groups by Timestamp string, picks "best" row per group (any non-empty Category wins; multi-categorized warns), normalizes Date to midnight, atomic write via existing consolidate-pattern (clear A/D/F/H → write back, leave E/G formulas alone).

- **Edge cases handled:**
  - Manual rows (Timestamp blank) pass through cleanup untouched — different identity rule.
  - Multi-categorized duplicate groups (user fixed two siblings manually) — kept first, warning logged.
  - Hash format change doesn't break PWA — `handleBatchCategorize_` matches by exact Timestamp string equality regardless of hash length.
  - `dedup_skip` log entries become a permanent tripwire — if they stay > 0 post-deploy, Gmail thread re-iteration is still happening (just rescued by dedup); if 0, root cause stopped on its own.
  - Cleanup is idempotent — re-running drops no rows (no dupes left) and re-normalizes no dates (already midnight).
  - Future regression in either Date normalization OR Period formula can't reintroduce Bug 2 alone — needs both to fail simultaneously.
  - Same (timestamp, merchant, amount) tuple in two real distinct emails (e.g. two simultaneous taps at a vending machine same second): with widened hash, the per-batch collision counter would still produce `#xxxx-2` for the second one, distinguishing them; cross-batch case is still a false-drop, but the probability is now astronomically low given 32-bit hash.

- **Verification methodology before any code change:**
  - Queried Gmail with parser's exact filter → 0 unlabeled emails → label exclusion working NOW.
  - Listed Gmail labels → confirmed `Label_3 = Budget/Processed` (not stale).
  - Pulled PayPeriods config → confirmed row 10: "Apr 29, 2026 → May 12, 2026" → May 12 IS within "Apr 29 - May 12" period → 'Unassigned' is a bug, not a config gap.
  - Counted 'Unassigned' rows by date → 8 found, all on last-of-period dates → 100% correlation.
  - Cross-referenced 67 Gmail emails vs sheet → 0 missing → bug is purely over-count, never under-count.

- **Lesson:**
  1. **Never trust upstream dedup alone; dedup at the write site.** Gmail's label exclusion was correct most of the time but had eventual-consistency lag for newly-arriving messages in already-labeled threads. The parser had no defensive write-time check, so the entire correctness depended on Gmail's search index. Anywhere downstream of an "external system says it's safe" gate, add a local check too. Codified as trip-up #34.
  2. **Date objects written to spreadsheet columns carry their time portion — formulas comparing against midnight Dates break on boundaries.** Two-layer fix (normalize at write + INT() in formula) means either layer alone fixes it; both together means a future regression in either can't reintroduce the bug. Codified as trip-up #35.
  3. **Hash strength matters when a hash becomes part of a dedup contract.** The original 4-char hash was fine for "distinguish two charges arriving the same second within one batch" but became a latent false-drop risk under the new cross-batch write-time dedup. Strengthening from 16 → 32 bits eliminated the risk for ~zero code cost.
  4. **Investigate with no assumptions — the first bug found isn't always the only one.** The period bug was discovered WHILE investigating the duplicate bug (noticed `period='Unassigned'` on May 12 in the dump, asked "why?"). If the investigation had stopped at "duplicates found, here's the fix," the period silent-loss bug would have continued unnoticed. The user's instruction to "double-check assumptions and look for other issues" directly produced the Bug 2 discovery.
  5. **Cross-reference the source of truth, not just the affected layer.** Pulling Gmail directly confirmed (a) the parser query works as documented, (b) every email exists in the sheet (no missing data), (c) the duplicates are downstream of Gmail (not Gmail re-delivering). Without the source-side verification, hypothesizing the root cause from sheet data alone could have led to wrong fix.
  6. **`dedup_skip` logging is a permanent feedback loop on the fix.** Beyond fixing the bug, the log line tells us whether the upstream behavior changed on its own (count drops to 0) or whether the dedup is doing active rescue work (count stays > 0). Either signal informs future architectural decisions.

### Statement vs PWA Coverage Gap (observation, post-Phase 30 verification)

Surfaced 2026-05-17 during Phase 30 post-deploy verification. User provided their Scotiabank statement xlsx as a third source of truth (Gmail = source of alert data, Sheet = parsed result, Statement = bank's actual settled-transaction ledger). Cross-reference revealed a coverage gap that is NOT a bug — it's an upstream limitation of Scotiabank's info-alert system that has always existed but wasn't quantified until now.

- **Setting:** 93 debit transactions in one billing cycle's statement (Apr 7-30 = $3,855.17). PWA parsed 64 of them = 69% coverage by exact or fuzzy match. Remaining 29 transactions ($1,627) never produced a Gmail info-alert.

- **Pattern of what Scotiabank info-alerts SKIP:**
  - **Online / card-not-present transactions:** Amazon (6 entries × ~$22 avg), Apple Bill ($184), ChatGPT Plus ($26), Zotero ($30), ClickUp ($15), RockAuto ($230)
  - **Recurring subscriptions:** Apple, ChatGPT, Zotero, ClickUp, Movelearnplay
  - **Mobile transit/parking apps:** AHS UAH Park By Phone (9 entries × $15 = $135), ARC Transit ($30), Espotpark ($70)
  - **International / unusual merchants:** "cr awuk" London ($370), Ubu Psychological ($235)

- **Pattern of what DOES alert reliably:** physical in-person card-present transactions (chip-and-PIN, tap-to-pay at retail terminals). E.g. SHOPPERS DRUG MART, TIM HORTONS, SAFEWAY, PETRO-CANADA pump terminals — these all alert consistently.

- **Implications for budget accuracy:**
  - Budget tab's Spent column on the affected card UNDER-counts actual spending by ~$1,627/cycle = ~$3,250/month (assuming similar gap each cycle).
  - Categories used predominantly by online merchants (Subscriptions, Online Shopping, etc.) are systematically under-budgeted.
  - In-person categories (Groceries, Eating Out, Gas) are accurately captured.

- **Secondary observations from the same cross-reference:**
  1. **Auth date ≠ post date:** Info-alert fires on authorization (instant); statement shows posted date (1-2 days later for some merchants). Cleanup-comparison code matching on exact date misses these; ±2-day fuzzy matching catches them. The sheet has the auth date (per Scotiabank email), the statement has the posted date. Both are correct depending on interpretation; the sheet is more "real-time accurate" but the statement is what reconciles to your monthly bill.
  2. **Gas pump pre-auths over-count:** $250 pre-auth at gas pumps generates an info-alert; the actual fill (~$50-80) generates a SECOND alert. Both end up as separate rows in the sheet. Statement shows only the settled amount. Visible in cross-reference: 2-3 "sheet not in statement" entries are pre-auths that never settled at the pre-auth amount.
  3. **Two-card setup is invisible:** the Gmail data has alerts from at least two cards (account masks `4537*****197****` and `4537*****606****`). The PWA shows both intermingled with no card filter. The statement is only for ONE card (the file name's `9017` ID).

- **Fix options (NOT in Phase 30 scope — open for future decision):**
  1. **Monthly statement import script** — read the Scotiabank xlsx, identify transactions not already in the sheet (match by amount + ±2 day window), add them as parser-style rows with a different flag. Best effort to close the 29-txn gap. Requires the user to download a statement xlsx each cycle and trigger an import.
  2. **Manual entry workflow** — add a "Manual Transaction" form to the PWA. User adds known online charges as they happen. Tedious but bulletproof.
  3. **Direct bank integration via Plaid / MX** — out of scope; paid API + complex auth flow.
  4. **Pre-auth dedup heuristic** — for SHELL / PETRO-CANADA / hotel merchants where amount changes between auth and settle, after N days drop pre-auth rows that don't have a matching settled-amount-categorize. Risk: false drops.
  5. **Card filter in PWA** — store card-account-mask in a new column, add a filter chip in the period bar. Requires schema change.

- **Lesson:**
  1. **Three sources of truth beats two.** Gmail + Sheet alone showed "duplicates exist" but couldn't quantify what % of real spending was being captured. Statement-as-third-source made the upstream limitation visible and measurable. Future debugging where the data pipeline matters: think about what additional source could disambiguate.
  2. **"Working as designed" can still be unsatisfying.** Scotiabank's info-alert system is doing exactly what it advertises — alerting on authorizations of certain transaction types. But the PWA inherits that limitation as ~30% coverage gap in real spending. The fix isn't in our code; it's a product-level decision about whether to accept the gap, add a different data source, or change the architecture.
  3. **Pre-auth vs settled amounts are a hidden cost.** Gas pump $250 pre-auth + actual $69.65 settle = $319.65 "spent" if we naively trust auth alerts. Most users won't notice until they compare to the statement. Pattern is worth flagging in the categorize UI: large round amounts at gas/hotel merchants are likely pre-auths and may be over-counted.
