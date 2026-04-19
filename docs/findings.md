# Findings & Decisions

> Reference document. Sections describe the system as it currently exists (v9 Apps Script + v0.7 PWA). Bug-fix sub-sections (e.g. "POST Redirect Bug", "knownTimestamps Stale Cache Bug") are historical postmortems — the bugs are fixed, but the lessons are kept for future debugging.
>
> For current state and workflow: see `CLAUDE.md` (root) and `docs/task_plan.md`.
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

### Budget Tab (cols A–F)
| Col | Header | Type |
|-----|--------|------|
| A | Period | Text (period label value) |
| B | Main Category | Formula: INDEX/MATCH from Setup (blank for _income) |
| C | Category | Text (sub category name or "_income") |
| D | Budgeted | Manual entry (formula for _income rows: Net Income via SUMPRODUCT) |
| E | Spent | Formula: -SUMIFS from Transactions |
| F | Available | Formula: rollover + budgeted - spent |

### Transactions Tab (cols A–G)
| Col | Header | Type |
|-----|--------|------|
| A | Date | Date (manual or from categorizer) |
| B | Merchant | Text (manual or from categorizer) |
| C | Amount | Currency (negative=purchase, positive=income/refund) |
| D | Category | Dropdown from CategoryList (manual or from categorizer) |
| E | Main Category | Formula: INDEX/MATCH from Setup |
| F | Transaction # | Text (manual) |
| G | Period | Formula: FILTER by date range |

### Pending Tab (cols A–G)
| Col | Header | Type |
|-----|--------|------|
| A | Timestamp | Date/time string "yyyy-mm-dd hh:mm:ss" (**dedup key**) |
| B | Date | Date (transaction date from email) |
| C | Merchant | Text (parsed from email body) |
| D | Amount | Currency (negative for purchases) |
| E | Email Subject | Text (for debugging) |
| F | Status | Text: "pending" or "categorized" |
| G | Category | Text (filled by PWA when categorized) |

Orange tab color. Populated by Parse Emails, consumed by PWA.

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
| Budget_Period | Budget | A2:A500 |
| Budget_Category | Budget | C2:C500 |
| Budget_Budgeted | Budget | D2:D500 |
| Budget_Available | Budget | F2:F500 |
| Transactions_Amount | Transactions | C2:C1000 |
| Transactions_Category | Transactions | D2:D1000 |
| Transactions_Period | Transactions | G2:G1000 |

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

## Web App API (v10.3)

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

### POST Redirect Bug (all write actions failed from PWA)
- **Issue:** Apps Script web apps respond with HTTP 302 redirect. Per HTTP spec, browsers convert POST→GET on 302, dropping the request body. All POST-based write actions (categorize, uncategorize, addCategory) silently failed.
- **Symptom:** Transaction disappeared from PWA list but never appeared in Transactions sheet. No error shown (optimistic UI removed it, but API returned doGet's "Unknown action" which wasn't caught properly).
- **Fix:** Moved all actions into `doGet()`. PWA now uses GET with URL params for everything. `doPost` kept for backward compatibility (curl testing).
- **Lesson:** Never use POST from browser to Apps Script web apps. Always use GET with URL params.

### Budget Available Circular Reference Bug (discovered v10.3) — CRITICAL
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

### Trailing Whitespace in Category Names (discovered v10.3)
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
