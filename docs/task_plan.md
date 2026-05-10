# Task Plan: 2026 Personal Budget + Transaction Categorizer

## Goal
1. Google Sheets personal budget workbook with named ranges, formulas, Apps Script automation, and a slicer.
2. Transaction categorizer system: Apps Script email parser + GitHub Pages PWA for categorizing Scotiabank infoalert transactions on phone.

## Current State (April 2026)
- **Apps Script:** v11.19 — Phase 27: new "Rolled Over" column on Budget tab (col F, between Spent and Available). Available formula simplified to pure `F + D - E` arithmetic; the prior-period SUMIFS lookup extracted to `buildRolledOverFormula_`. New `Budget_RolledOver` named range; `Budget_Available` shifts F → G. PWA paired with v0.19.3 (parses row[6] as available). v11.18 added Goal archive flow (Archive Goal / Unarchive Goal menu items + rebuildBudgetInternal_ filters Setup col F). v11.17 Phase 2 of time-driven email parsing — `handleParseAndFetch_` skips inline Gmail scan unless `?withParse=1`. v11.16 added Phase 1 — `processInfoAlertsTrigger` + install/uninstall menu items, hourly auto-parse. v11.15 made `buildBudgetDashboard_` auto-set Budget B1 to the period containing today on every refresh. v11.14 added `handleArchiveGoal_`/`handleUnarchiveGoal_` (Saving goal archive endpoints; recovered via `clasp pull` 2026-04-26). v11.13 added `_elapsedMs` echo + `logClientMetrics` + `ClientMetrics` tab. v11.12 fixed Budget `#REF!` cascade via `rebuildBudgetInternal_` delegation; v11.9–v11.11 were Saving tab shakedown. Full postmortems in `docs/findings.md`.
- **PWA:** v0.19.6 (cache v36) on `main` — pixel UI is the canonical theme. Graduated from `pwa/pixel-ui-redesign` via merge commit on 2026-05-09; the branch is preserved on remote as a snapshot. Force-pixel via the early `<head>` script in `index.html`; no in-app theme toggle. v0.19.6 adds the FIXED summary-cell accordion (tap → sticky inline expand showing per-period fixed-expense breakdown). v0.19.3 paired with v11.19 — `parseDashboard` reads `row[6]` as available, `row[5]` as new `rolledOver` field. Cache key bumped to invalidate pre-v11.19 cached data. Phase 25 — pixel UI redesign overlay (`css/pixel.css`) scoped via `:root[data-theme="pixel"]`. v0.19.0 added Phase G multi-select category rail. v0.18.0 → v0.18.2 introduced theme infrastructure + dashboard polish + period-bar today chip + terminal calendar styling. Earlier: v0.17.0 Phase 2 of time-driven email parsing (read-only `parseAndFetch`); v0.16.0 persistent views; v0.15.4 cold-start optimization (dedupe categories, defer suggest, persist txns cache, throttle re-mount).
- **Workflow tooling:** Phase 26 — `.claude/settings.json` (permission allow-list + SessionStart hook), `.claude/state-check.sh` (state snapshot script), `.claude/statusline.sh` (persistent branch+version display), three slash-command skills (`/state`, `/lint`, `/deploy`). On main, merged into pixel branch.
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

### Phase 13b: Instructions Tab Rewrite (v10.3)
- Stale references to manual paste workflow + missing Logs tab + missing v10.x menu items
- Rewrote `rows[]` array in `buildInstructionsTab_` (10 sections, ~65 rows)
- Plain numbered steps + color-coded menu function table
- Brief "For Developers" section pointing to clasp workflow
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

### Phase 16: Slicer Crash Fix (v11.7)
PWA `addCategory` was crashing with `TypeError: newSlicer.setColumnPosition is not a function` at the slicer-recreation step in `rebuildBudgetInternal_`. Google appears to have changed the Slicer API; the method is no longer present on the object returned by `Sheet.insertSlicer()` in web-app context. The crash propagated up through the handler, leaving the user with: Setup tab updated (succeeded), Budget tab rebuilt (succeeded), slicer in a broken half-state (old removed, new inserted but no filter column), and PWA showing a generic crash error.

Fix in `rebuildBudgetInternal_`:
1. Prefer UPDATING an existing slicer's range via `setRange()` — preserves the filter column the slicer was originally created with, no `setColumnPosition` call needed on the common path.
2. Only fall back to recreate when no slicer exists, with a `typeof === 'function'` guard around `setColumnPosition`.
3. Wrap the entire slicer block in top-level try/catch — slicer is a UI convenience widget, its failure must never crash the parent operation.

User impact: addCategory works again. The user's existing slicer is in the broken-no-column state from the prior crash; one-time manual fix needed (right-click slicer → Set Column → Period). Future addCategory calls only resize the slicer, so the manual fix sticks.

Investigation also covered Budget row 72 (Apr 15-28 Gas showing -$280). Turned out to be the rollover formula working correctly against $340 of Gas overspending in Apr 1-14 (anchored by an erroneous SHELL $250 charge that the user manually uncategorized). Documented in findings.md as a non-bug to prevent re-investigation. Redesign of the formula model (move calculations to Apps Script, drop or split rollover) discussed but deferred.

- **Status:** complete

### Phase 17: Saving Tab — One-Time Goals (v11.8 → v11.12)
User wanted to track one-time savings goals like "Europe trip $5,000 by Oct 2026" and see what to budget per period to hit them. Implemented as a new tab on the existing Budget infrastructure — no new data model needed. The Available column on Budget already accumulates over time when nothing is spent against a category; that IS savings progress. The new Saving tab adds a goal-tracking layer with computed pace.

Initial design decisions (per user input):
- 1:1 goal:category mapping (one Setup category per goal).
- Manual archive (just stop budgeting; row stays in Saving for record-keeping).
- "Currently Saved" pulls from Budget Available for the period containing today.
- Includes 6-metric dashboard at top.

Implementation: two new helpers (`buildSavingTab_` for full build, `refreshSavingTab_` for non-destructive refresh). Wired into both `buildWorkbook` and `updateWorkbook` — Update Script auto-creates the tab if it's missing, refreshes structure if it exists. No PWA changes, no API changes.

**Four bring-up bugs found and fixed as the user first used the feature:**
- **v11.9 (#REF! cascade):** `updateWorkbook` built the Saving tab BEFORE `setNamedRanges_` ran. `setNamedRanges_` deletes-then-recreates each owned-prefix named range; Sheets converts any formula referencing a deleted named range to a `#REF!` literal, and the recreated same-name-same-definition does NOT heal the broken formulas. Fix: move Saving block to AFTER `setNamedRanges_`. (buildWorkbook unaffected — already correct order there.)
- **v11.10 (B3 XLOOKUP unreliable):** Dashboard cell B3 (Current Period) used `XLOOKUP(1, (start<=today)*(end>=today), label)` relying on Sheets to auto-broadcast multiplied boolean arrays as the lookup vector. Unreliable — XLOOKUP returned "no match" → B3 returned "(out of range)" → cascaded into `#DIV/0!` in Per-Period Need. Fix: replaced with `INDEX(PayPeriods_Label, MATCH(TODAY(), PayPeriods_Start, 1))` plus outer IF for "today past the last period". Also added defense-in-depth IFERROR around the per-period division.
- **v11.11 (schema refactor):** initial Per-Period Need column drifted from $222 → $209 after user budgeted the suggested $222, confusingly, because the formula divided the remaining gap by all 18 remaining periods while Currently Saved already included the current-period allocation. Dropped "On Track?" column (text status with CF — redundant with the numeric columns, can return as dashboard feature later). Added "Allocated This Period" column showing Budget_Budgeted for current period. Rewrote "Needed Future Periods" as adaptive: when F>0 (current period allocated), divides by G-1 (future periods only); when F=0, divides by G (full remaining). Result: value stays constant when user budgets the previously-suggested amount, correctly adjusts up/down on over/under-budget.
- **v11.12 (Budget #REF! across entire tab):** after v11.11 Update Script run, `dumpSheet` revealed every Budget per-row Spent and Available formula stored as `#REF!` — but dashboard formulas in the same tab resolved correctly. The in-place per-row refresh loop in `updateWorkbook` was silently failing to overwrite the broken formulas. Root cause unknown (suspected Apps Script state-commit quirk between `setNamedRanges_` and per-row `setFormula`). Fix: replace the in-place refresh loop with a call to `rebuildBudgetInternal_('refresh', ss)` — same code path `addCategory` uses and that works. Budgeted amounts preserved via existing `existingBudgetedMap`. **Bug was present in every Update Script run since v11.8 (~4 user-visible runs).**

Verification after v11.12 Update Script: 0 `#REF!` cells across all 267 Budget rows; Saving tab showing correct values for the user's real Europe trip goal ($4,000 by Dec 23 - Jan 5, $222 budgeted current period → Needed Future Periods $222.24). The $0.22 shift from exact $222.22 reflects user-rounding and demonstrates the adaptive formula working as designed — validated on real user data.

Patterns added to CLAUDE.md trip-up list (items #10, #11, #12).
- **Status:** complete + verified working

## Phases — In Progress / Future

### Phase 18: PWA Experimental Restructure (v0.12+)
User wanted the PWA to feel snappier ("like Wikipedia Mobile / Twitter Lite / Pinterest") and had two new features queued: a Dashboard tab (read-only Budget-sheet view) and an auto-categorization swipe deck. Scaling the existing 657-line single-file `app.js` to absorb both was going to regress first-paint time and make the file unmaintainable. Chose to restructure the shell first, then build features on the clean foundation.

**3-deploy plan. Detailed architecture doc: `/root/.claude/plans/let-s-discuss-layout-of-nifty-moore.md`.**

Design choices (scaffolding-level):
- **Hash routing** (`#/categorize`, `#/dashboard`, `#/setup`) via `<a>` hrefs in a bottom tab-bar. ~60-line router, zero click handlers for nav, browser back works.
- **View module contract:** `export default { mount(root), unmount() }`. Router lazy-imports on first navigation, wipes root innerHTML on transition.
- **Lazy loading:** dashboard and future auto-suggest chunks aren't downloaded until the user navigates there. Users who only categorize never pay for the rest.
- **Service worker stale-while-revalidate** for `/js/views/` and `/js/lib/` so dynamic imports work offline after first successful fetch.
- **State management unchanged** — `store.js` stays as a singleton. No pub/sub (deferred per user direction; revisit if view-to-view coupling becomes painful in Deploy 2 or 3).
- **Keep single `style.css`** with section-header TOC. Splitting deferred until it crosses ~1200 LOC.
- **Header buttons** (`refresh`, `sync`) hidden by default; each view declares what it needs via `setHeaderActions(...)` on mount. Settings button is always visible; shell handler routes based on current hash (to `#/setup` from elsewhere, back to `#/categorize` when already there). Setup view relabels the button to "Done" so the affordance reads correctly.

**Branch state:**
- Working on `claude/read-markdown-context-v1c5T` (branched from `pwa/experiments`).
- Pushed to origin; **NOT merged to `main`**. `main` still at v0.11 + v11.12 Apps Script.
- GitHub Pages currently deploys from the feature branch (Settings → Pages → Source switched for preview). When merging to main, flip the source back.

**Deploy sequence — all shipped:**
- ✅ **Deploy 1 — v0.12 / v0.12.1 / v0.12.2.** Scaffolding + UX polish. v0.12 introduced the router + lazy views + tab-bar (behaviour identical to v0.11). v0.12.1 fixed a Setup exit regression. v0.12.2 deleted the `setHeaderActions` helper entirely — Refresh and Sync moved from the shell header into the categorize view (inline `⟳` in the period row; sticky sync bar above the tab-bar visible only when `syncQueue.length > 0`); tab-bar no longer hidden on Setup; Categorize tab-bar label shows pending count `Categorize (N)`. Cache `v14 → v17`.
- ✅ **Deploy 2 — v0.13.** Real dashboard content. `js/lib/budget.js` owns two parallel `dumpSheet` calls (Budget A1:F215 + Saving A1:I105), parses currency strings → numbers on ingest (`parseCurrency`), formats via `Intl.NumberFormat`, persists with a 10-min TTL, invalidates on successful `batchCategorize`. View: Ready-to-Assign hero + Income/Fixed/Budgeted summary strip + per-period category cards with green/amber/red progress bars + saving-goal tap-to-expand cards. Period switching is client-side — one fetch, 26 periods filter in-memory. Known scope limit (documented in the plan): summary block reflects sheet `Budget!B1`, not the PWA's selected period, because Net Income / Fixed Expenses formulas depend on Transactions + FixedMonthlyExpenses tabs that v0.13 intentionally doesn't fetch. Cache `v17 → v18`.
- ✅ **Deploy 3 — v0.14.** Manual | Auto segmented control inside the categorize view (not a sub-route — shares period filter + refresh + sync bar + picker). `js/lib/suggest.js` fetches Transactions once per hour, builds `{normalizedMerchant: {category: count}}`, exposes `suggest(merchant)` returning the top category if confidence ≥ 0.70, else null. Normalizer strips payment-processor prefixes (`SQ*`, `TST*`, `PAYPAL*`, `SP*`), `*alnum` tokens, `#alnum` IDs, `\S*\d+\S*` tokens, trailing state codes — 17-case unit-test suite run before commit. `js/lib/swipe.js` is a vanilla touch factory: right = accept (reuses existing categorize path + queues for sync), left = hide this session only (txn remains in Manual). `rejectedThisSession` is in-memory only so a richer index next session gets another shot. Cache `v18 → v19`.

**Pages build failure + fix (Apr 23 2026):**
First attempt to deploy the feature branch timed out at `updating_pages` even though the build step "succeeded" — root cause was GitHub Pages running Jekyll by default with no `.nojekyll` marker. Added empty `.nojekyll` at repo root + empty-commit retrigger cleared it. The file must stay on every branch Pages deploys from.

- **Status:** all 3 deploys shipped, verified end-to-end, Pages serving the branch successfully. Not yet merged to `main`.

### Phase 20: PWA Visual Redesign — Minimal Monochrome (v0.15 → v0.15.2)
After the functional restructure (Phase 18) landed, the user wanted a cleaner aesthetic: drop the indigo theme, simplify information density, improve hierarchy. Scoped design work out to Claude Design (claude.ai/design), received a handoff bundle containing three variations (A, B, C). User iterated via the design canvas UI, converging on Variation A (Minimal Monochrome). B and C were explicitly deleted. Bundle + chat transcript fetched via `/v1/design/h/<id>` (gzipped tar archive), extracted to `/tmp/design-fetch/budget-pwa/`.

Visual system:
- `#0A0A0A` on `#FAFAF9`, `#E5E5E3` rules, `#EFEDE8` period bar.
- Inter for UI, JetBrains Mono for the `+`/`−` toggle glyph.
- Color-coded amounts on dashboard: black (positive), amber `#B45309` (zero), red `#B91C1C` (overspent), green `#15803D` (goal reached).

Shape changes:
- **Header title/version removed.** The period bar (on Categorize + Dashboard) is the visual top of the app.
- **Period bar is a collapsible calendar.** Tap label to expand a 7-col day grid; `‹ ›` chevrons advance/retreat periods. Today cell is inverted black.
- **Sync → top-right pill** in the period bar (`Sync N` primary when queue > 0, else `↻ Parse` outline). Sticky bottom sync bar deleted.
- **Dashboard:** 4-col summary (Income / Fixed / Budgeted / Ready), collapsible `+`/`−` main-category groups, sub-rows show `left/over` primary + `spent/budgeted` secondary + 1px progress bar.
- **Tab bar (3 tabs since v0.15):** thick top accent bar on active tab + warm-gray tint + uppercase bold label. Settings is now a tab, not a header button.

Post-redesign fixes discovered on real device testing:
- **v0.15.1 (iOS safe-area):** on iPhone 16 Pro the Dynamic Island showed a white strip above the period bar. Root cause: I'd translated the design's 54px iPhone 14 frame spacer into a hardcoded `<header>` with `#FAFAF9` background. Actual Dynamic Island inset is ~62px and the color was wrong. Fix: add `viewport-fit=cover` to enable `env(safe-area-inset-*)`; delete the fixed header; extend the period bar's tan background into the notch via `padding-top: calc(env(safe-area-inset-top, 0px) + 10px)`. Applied the same safe-area-aware offset to `#category-picker` and `#error-toast`.
- **v0.15.2 (Savings/Goals dedup):** Savings main category group was showing sub-categories (Europe, NDEB) that also appear as Saving Goal cards below — same data in two places. Dashboard now filters `categoriesByPeriod` to exclude any category whose `sub` matches a `goal.linkedCategory`. Filter is data-driven, not hardcoded.

- **Status:** complete + shipped on `pwa/v0.15-refinement`.

### Phase 21: Client Metrics Pipeline (PWA v0.15.3 + Apps Script v11.13)
User reported ~20s cold-start load time. The existing Logs tab captures server exec duration but not client-perceived latency, TLS/DNS cost, cold-container queue wait, or duplicate-call detection. Before fixing anything, built a richer diagnostic pipeline so future optimization decisions are data-driven.

PWA side (`js/lib/metrics.js`, new — ~200 LOC):
- Session id generated once per cold open; tracks mount counter so each metric is scoped to a view mount within a session.
- `recordStart(action)` / `recordComplete(ticket, {ok, serverMs, bytes, cached, errorMsg})` wrap every API call in `api.js`.
- In-flight Set captures concurrency-at-start; `msSincePrev` captures how long since the last completed request (cold/warm heuristic).
- Duplicate detector: flags any action that fires twice within 2s (catches the known `fetchCategories` bug).
- `recordEvent(kind, data)` captures non-API events: `mount:<route>` with import-vs-mount-time split; `cache-hit:dashboard` / `cache-miss:dashboard`; `cache-hit:suggest` (with source: memory / in-flight-dedup / localStorage) / `cache-miss:suggest`.
- 50-entry buffer; flushes on `visibilitychange: hidden` + `pagehide` via `navigator.sendBeacon`. Text/plain Blob to skip CORS preflight (iOS Safari strict; Apps Script doesn't respond to OPTIONS cleanly). Keepalive fetch fallback if sendBeacon unavailable.
- Exposes `window.__apiStats` / `__apiStats_session` / `__apiStatsFlush()` for Safari remote DevTools inspection.
- **`logClientMetrics` action excluded from instrumentation** — no logging-about-logging loops.

Apps Script side (`handleLogClientMetrics_`, new; `doGet`/`doPost` modified):
- Every response now injects `_elapsedMs = Date.now() - start` before returning (client reads it to compute `networkMs = clientTotalMs - serverMs`).
- `logClientMetrics` action accepts batched records (POST body or GET params), appends to the `ClientMetrics` tab in one `setValues` call.
- Tab auto-creates on first write with 18-column schema: ReceivedAt, SessionId, MountN, AppVersion, Connection, Action, ClientStartMs, ClientTotalMs, ServerMs, NetworkMs, InFlightAtStart, MsSincePrev, Duplicate, Cached, Ok, ErrorMsg, Bytes, Note.
- Defensive 500-row/batch cap (client buffer is 50).

Intended usage:
- Drive a few cold starts + normal sessions → data lands in ClientMetrics → query via `AVERAGE`/`PERCENTILE`/`COUNTIF` to confirm where the 20s goes (cold network vs. Apps Script cold-container vs. sequential chain vs. duplicate calls) before picking a fix. Specific fixes already on the table from prior log analysis: drop duplicate `fetchCategories` in refresh(), defer `ensureIndexReady` until Auto tab, cache transactions in localStorage for instant first paint.

- **Status:** complete + verified working. Apps Script v11.13 deployed @35; ClientMetrics tab auto-created on first successful flush and has populated rows showing per-call timings, concurrency, cache hits, and duplicate flags. Baseline data captured, informing Phase 22.

### Phase 22: Cold-Start Optimization (PWA v0.15.4)
User reported ~20s cold-open load time. Phase 21's ClientMetrics pipeline produced first real measurements, which guided this fix. Before shipping anything we validated all four prior hypotheses against real data.

Measurement findings from the v0.15.3 baseline:
- **Confirmed:** duplicate `categories` is real (`Duplicate=Y` on every `mount:categorize` row, ~3s wasted per mount).
- **Confirmed:** suggest-index warmup is heavy (`dumpSheet:Transactions` = 3136ms on cold mount, fires unconditionally).
- **Confirmed:** re-mounts pay full tax (`mount:categorize` 7763ms cold → 6864ms warm re-mount → 9198ms third re-mount — not improving).
- **Contradicted:** network overhead is NOT front-loaded to the first call. The `version` endpoint with 46ms server time paid 2525ms network even mid-session with warm container. Every call pays the 302-redirect + TLS overhead; parallelism doesn't help (calls serialize on the single-threaded Apps Script container).

Four fixes landed in v0.15.4 based on what the data actually said:
- **v0.15.4 (dedupe categories):** `mount()` stores its `fetchCategories` promise in a module variable (`categoriesPromise`). `refresh()` awaits it instead of firing a duplicate. User-initiated refreshes (`refresh({ force: true })`) opt into fresh fetches so sheet-side category additions still propagate.
- **v0.15.4 (defer suggest index):** `ensureIndexReady()` now fires only when `activeSubtab === 'auto'` on mount, OR on first `setSubtab('auto')` activation. Manual-only users never pay the 3.1s dumpSheet call.
- **v0.15.4 (persist transactions):** `store.transactions` now persists to localStorage via a new `saveTransactions()`/`setTransactions()` pattern. Cold PWA open paints cached txns in <200ms; `refresh()` merges server state in the background. `setTransactions()` replaces rather than merges so stale-cached items (e.g., categorized directly in the sheet) get evicted correctly.
- **v0.15.4 (throttle re-mounts):** silent re-mount `refresh()` is a no-op within 60s of the last successful run. Parse pill + empty-state Refresh always bypass via `force: true`.
- **v0.15.4 (version cache, bonus):** Setup module caches the `version` response in memory for its lifetime. Saves ~2.5s per Setup re-mount.

No Apps Script changes. All PWA-side. CACHE_VERSION v23 → v24.

Patterns added to CLAUDE.md trip-up list (items #25, #26).

- **Status:** complete + verified working. Five of six perf targets hit per measured ClientMetrics on 2026-04-24: `Duplicate=Y` rows = 0 (was many), `dumpSheet:Transactions` on Manual mount = 0 calls (was always firing), `mount:dashboard` re-mount = 3–16 ms (was 3861 ms), throttled `mount:categorize` re-mount = 1 ms (was 6864–9198 ms), Setup `version` re-mount = 0 ms (was ~2500 ms each). Sixth target (first cold `mount:categorize` < 3 s) missed: still 7348 ms / 9038 ms because `parseAndFetch` + `categories` are gated by ~2.5 s per-call network tax that is unavoidable without a server-side consolidated endpoint. The localStorage-cached transactions fix paints in <200 ms regardless, so the user-perceived cold open is materially faster even though `mount:categorize` ClientTotalMs (which fires after refresh awaits) is still long. See `docs/findings.md` "Cold-Start Perf Findings + Fix (v0.15.4)" Verification block for raw numbers. Phase 23's read-only `parseAndFetch` later reduces the residual cold-mount cost by removing the inline Gmail scan from the critical path.

### Phase 23: Time-Driven Email Parsing (v11.16 → v11.17 + PWA v0.17.0)
After Phase 22 hit the per-call ~2.5 s network tax floor, the next-largest cost on cold-mount `parseAndFetch` was the inline Gmail scan inside `processInfoAlerts_` (typically 1–3 s server-side, hidden inside the response). The user critique that prompted this Phase named it directly: "using Apps Script as a synchronous HTTPS proxy in front of the Sheet" was responsible for most of the project's perf and trip-up surface area. Removing parsing from the request path was the smallest decision that addressed the most pain.

Two-phase split, by deliberate choice (each independently rollback-able):

- **Phase 1 — v11.16 (trigger only, no PWA contract change).** Added `processInfoAlertsTrigger` (thin handler wrapping the existing LockService-protected `processInfoAlerts_`), `installEmailTrigger`/`uninstallEmailTrigger` menu items under Budget Tools, and an hourly time-based trigger created via `ScriptApp.newTrigger(...).timeBased().everyHours(1).create()`. Logs filter to "interesting" runs only (`parsed > 0` OR `errors > 0`) to keep the Logs tab from accumulating 24 noise entries/day. `LAST_TRIGGER_RUN` script property updated each run for future trigger-health detection. Decision: hourly (vs 15-min) for a personal-use app where being behind ≤1 hour is acceptable; quota math is trivial either way (~5 min/day total runtime on the 90-min/day quota).

- **Phase 2 — v11.17 + PWA v0.17.0 (read-only contract).** `handleParseAndFetch_` now skips `processInfoAlerts_()` unless the caller passes `?withParse=1`. PWA `js/api.js` `parseAndFetch({ withParse })` defaults to false; `js/views/categorize.js` `refresh({ force })` derives `withParse: force` so the existing "↻ Parse" pill in the period bar's right slot + the empty-state Refresh button still force a Gmail scan when the user explicitly asks for "fresh now." Mount-time auto-refresh is now a pure sheet read (~200 ms server vs ~1–3 s with parse). Backward-compat verified in both directions: old PWA → new server gets read-only path; new PWA → old server is parsed-anyway because the old server ignores the new param. No new UI was added — the existing Parse pill already covered the explicit-force case.

Two trip-ups discovered during Phase 1 bring-up:
- The Apps Script editor's Triggers panel doesn't auto-refresh after programmatic `ScriptApp.newTrigger().create()`; needed a hard-reload of the editor tab. Trip-up #27.
- Running a trigger handler via the editor's Run button does not install a trigger — it only executes the function once. The user hit this confusion because the handler logging produced a Logs row that looked like the install had succeeded. Trip-up #28.

Patterns added to CLAUDE.md trip-up list (items #27, #28).
- **Status:** complete + verified working (Phase 1 confirmed by user 2026-04-28 — trigger fires hourly, parses new Scotiabank emails into Transactions tab without PWA involvement; Phase 2 deployed @42, on-device confirmation pending but contract is backward-compatible so the rollback path is just "redeploy v11.16").

### Phase 24: Goal Archive Flow (v11.18)
User completed the "Banff" savings goal, ticked the Setup col F (Archived?) checkbox, and reported the Banff line was still showing in the Budget tab. Investigation found three concerns that hadn't been linked: (1) `handleCategories_` filtered Setup col F since v11.14 — PWA dropdown was correct. (2) `rebuildBudgetInternal_` read only `D2:E100`, ignoring col F entirely — Budget tab kept archived rows by design ("Archived rows are filtered from PWA dropdown but kept in Setup so historical Budget rebuilds preserve their data"). (3) The v11.14-era `handleArchiveGoal_` / `handleUnarchiveGoal_` web endpoints — which DO atomically set Saving col J + flip Setup col F + return result — were dormant: registered in `routeAction_` but no PWA caller, no menu wrapper. So the "right" archive flow was unreachable from any UI.

Fixes in v11.18:
- **`Archive Goal...` / `Unarchive Goal...` menu items.** Wrap the existing endpoint internals (refactored into `archiveGoalInternal_` / `unarchiveGoalInternal_` so the menu can hold one lock across mutate + rebuild) plus a forced `rebuildBudgetInternal_('rebuild', ss)`. Menu prompts pre-fill from the active Saving-tab selection when applicable, list active/archived goal names (capped at 10 + "(N more)"), and run a YES/NO confirmation before the destructive rebuild that explicitly discloses the budgeted-value data loss.
- **`rebuildBudgetInternal_` filters Setup col F.** Read range extended `D2:E100` → `D2:F100`; emit-list filter adds `&& catRaw[c][2] !== true`. Symmetric to `handleCategories_`. Trade-off accepted: budgeted values for archived sub-categories in past periods are dropped on the next wipe-and-rebuild; spent values stay computed via SUMIFS on Transactions and remain reachable.
- **Duplicate-name detection in `archiveGoalInternal_`.** Pre-v11.18 the loop took the first match silently; now scans all rows and fails with row numbers if the same goal name appears twice. Forces the user to disambiguate by renaming.

Decisions made during planning:
- Single menu item, default to Achieved status (no Cancelled prompt). User can edit Saving col J directly if they ever want the Cancelled label — conditional formatting handles both equivalently.
- Confirmation prompt explicitly discloses data-loss trade-off so the destructive rebuild is opt-in.
- Pre-fill goal name from active Saving-tab selection (small UX win — common case is "I'm looking at the Banff row, archive this one").
- Old "hide from PWA but keep in Budget" semantics (`Setup col F` checkbox without Saving status update) are no longer reachable through the menu, but still possible via direct cell edit. Trip-up #29 documents the inconsistent-tabs failure mode.

Patterns added to CLAUDE.md trip-up list (item #29).
- **Status:** complete + verified working. Deployed @43; user confirmed 2026-04-29 that the Archive Goal flow works end-to-end (Banff archive removed the row from Budget). Rollback path (unused): revert the `rebuildBudgetInternal_` filter line — that alone restores the prior Budget behavior; the new menu items become harmless no-ops.

### Phase 25: PWA Pixel UI Redesign (PWA v0.18.0 → v0.19.1)
User shared a Claude Design "PWA V2" handoff bundle proposing a terminal/pixel UI aesthetic — fundamentally different from the v0.15 Minimal Monochrome direction (dark surfaces with warm parchment ink, JetBrains Mono everywhere, stepped/pixelated progress bars, pixel-block goal fill, accent-stripe cards, multi-select category rail). The user wanted to try it cautiously: branch-only, theme-toggleable, no risk to functionality. Apps Script unchanged across the entire arc.

The redesign arrived as a CSS overlay (`css/pixel.css`) scoped via `:root[data-theme="pixel"]` so all rules are inert until the attribute flips. Same DOM, same JS-flow, same Apps Script — pure visual layer. Backward-compat with mono CSS preserved via the same CSS-variable layer.

Sub-phases shipped on `pwa/pixel-ui-redesign`:

- **v0.18.0 (Phase A+B+C):** Theme infrastructure — early `<head>` script reads `localStorage.budget_theme`, sets `data-theme` before stylesheets parse, no flash-of-mono. Two stylesheets shipped together; `pixel.css` rules scoped via attribute selector. Settings tab gained a Theme section with Mono/Pixel buttons. JetBrains Mono everywhere in pixel theme. Stepped progress bars on dashboard category cards (4px-on / 2px-off repeating gradient). Single amber accent stripe on `.cat-group` and `.goal-card` left edges.

- **v0.18.1 (Phase D):** Period bar today chip (`[27]` amber-bracket day-of-month for current period, `PAST` otherwise). Hidden in mono via default `display: none` rule. Eyebrow ("CURRENT PERIOD" / "PERIOD") hidden in pixel — chip carries the same info. Calendar dropdown restyled: dashed border container, transparent cells with amber numerals, today rendered as outlined cursor box around the day number. Touched both `categorize.js` and `dashboard.js` `renderPeriodBar` (~6 lines each — kept in sync via comments).

- **v0.18.2 (Phase C+):** Two real bugs fixed from Phase C — `.cat-bar` was 1px tall in mono so the stepped gradient was invisible (bumped to 4px), and `.cat-group-header` had `bg-selected` background that painted over the new accent stripe (switched to transparent + indented 22px). Plus dashboard polish: sticky summary strip below period bar, dotted borders within sub-category groups, green toggle glyph (was ink), eyebrow restyled, terminal type for goal cards. The expand-on-tap goal detail rows that already existed in v0.15 got terminal CSS polish here.

- **v0.19.0 (Phase G):** Multi-select category rail. State machine: IDLE (no chip armed → tap txn opens picker, today's flow) → ARMED (chip selected → tap txns adds checkboxes) → ARMED+SEL (Cancel/Commit visible). Tap a different chip while armed CLEARS selection (overriding mockup's keep-selection-on-switch behavior — that was a footgun). Backend untouched (`handleBatchCategorize_` already supports many items). Picker stays as fallback for the no-chip-armed quick-categorize path. Mono theme also gets the rail (different styling, same flow).

- **v0.19.1 (branch fixes after on-device testing):** Three issues from real use — (1) summary strip values wrapping (`−$1,948.00` broke into "−" / "$1,948.00") — dropped pixel font from 18px → 14px + added `white-space: nowrap`. (2) Tab bar felt frozen on tap because `-webkit-tap-highlight-color: transparent` removed the iOS native flash and `.active` class only applied after the lazy-imported view mounted — added `:active` rule that paints the pressed tab immediately. (3) Pixel theme defaulted to mono on cold start — early script now hardcodes `data-theme="pixel"`, theme toggle UI removed from Settings (mono CSS preserved as structural foundation; bringing toggle back is a single-commit revert).

Phases skipped (deliberately):
- **Phase E** (pixel SVG tab icons): cosmetic, low-effort, deferred
- **Phase F** (goal expand-on-tap detail): JS already implemented in v0.15 — only needed CSS polish in pixel theme, which Phase C+ handled
- **Phase H** (animated sync stage): mockup has it, but the existing pill works; deferred indefinitely

Patterns added to CLAUDE.md trip-up list (item #31 — pixel branch defaults).
- **Status:** complete + verified working on phone. Merged to main 2026-05-09 (Phase 25 graduates from feature branch to canonical). The `pwa/pixel-ui-redesign` branch is preserved on remote as a snapshot. Rollback path: revert the v0.19.1 commit (restores the toggle) OR check out tag `main-pre-pixel-merge` for the full pre-merge state.

### Phase 26: Claude Code Workflow Tooling (main, multiple commits)
User asked whether Claude Code (the CLI tool) features could improve the day-to-day workflow and help future Claude sessions get up to speed faster. Their existing setup was already top 5% — extensive CLAUDE.md, working `update-budget-docs` skill, pre-commit hook (secret detection + docs lint), structured docs, `deploy.sh` + `deploy` shell function — but project-level Claude Code features (settings.json, hooks, status line, slash commands) were unused.

Two commits on `main`:

**`.claude/settings.json` + `.claude/state-check.sh` (commit 59ec80d):**
- Permission allow-list for ~18 read-only diagnostic Bash commands (`git status`/`log`/`diff`/`branch`/`show`/`rev-parse`/`stash list`/`ls-files`/`remote`/`config --get`, `node --check`, `bash .claude/skills/update-budget-docs/lint.sh`, `bash .claude/state-check.sh`, `bash .claude/statusline.sh`, `wc`/`ls`/`file`/`head`/`tail`). Claude no longer prompts for these.
- Deny-list for 9 destructive operations (`rm -rf`/`-fr`, `git push --force`/`-f`/`--force-with-lease`, `git reset --hard`, `git clean -fd`/`-df`/`-fdx`) — blocked outright.
- SessionStart hook runs `state-check.sh`. The script outputs branch + sync state vs origin (ahead/behind counts) + uncommitted file count + first 8 names + last 5 commits + version pointers (with `⚠ DRIFT` warning if Code.js APP_SCRIPT_VERSION ≠ VERSION.txt — catches the v11.14-class incident the project already has trip-up #X for). Output gets injected as Claude's first context. Replaces the manual 4-step ritual at the top of CLAUDE.md.
- Performance: state-check measured 305 ms locally (under the 500 ms budget).

**Slash commands as skills + status line (commit 8214e65):**
- `/state` — re-runs state-check.sh on demand (e.g., mid-session after commits)
- `/lint` — runs the docs lint, reports cleanly without auto-fixing
- `/deploy "<description>"` — orchestrates full deploy workflow: pre-flight verification → `./apps-script/deploy.sh` → post-deploy timestamp commit → push. Each step gated; `deploy.sh` stays prompted (production deploys should always be explicit).
- `.claude/statusline.sh` — persistent display in Claude Code's status area: `<branch>[ *<dirty>] · <as-version>[⚠]`. Examples: `main · v11.18`, `pwa/pixel-ui-redesign *2 · v11.18`, `main · v11.17⚠`. Performance ~176 ms.

Patterns added to CLAUDE.md trip-up list (item #30 — skills register at session start, not mid-session).

What this achieves: a new Claude session in this repo lands with state in mind (no manual checking), runs diagnostic commands without nagging, and can invoke established workflows in one token. The workflow ritual that lived in CLAUDE.md as text now executes automatically.
- **Status:** complete. Tooling-only, zero impact on app behavior. Lives on main; merged into pixel branch.

### Phase 27: Budget Tab Rolled Over Column (v11.19 + paired PWA v0.19.3)
The Budget tab's Available column has always carried prior-period rollover via a recursive SUMIFS lookup embedded inside the Available formula. Math was correct; visibility was zero. User flagged the confusion with a real example: Groceries showing "$0.00 LEFT" with "$0 spent / $98 budget" beneath. The math looked wrong (budgeted $98 minus spent $0 should leave $98), but the answer was that $98 of overspend rolled in from a prior period. The number was always there — just hidden inside the formula chain.

Phase 27 surfaces the rollover as its own Budget tab column. Three formula changes in `apps-script/Code.js`:
- **`buildRolledOverFormula_(row)`** (NEW) — extracts the prior-period-Available SUMIFS that used to live inside Available. Returns 0 for period 1 (MATCH > 1 guard against the period-1 INDEX-with-row-0 circular-reference bug fixed in v10.4) or for new categories with no prior rows. Sign mirrors Available — positive when prior period underspent, negative when overspent.
- **`buildAvailableFormula_(row)`** (SIMPLIFIED) — now `=F + D - E` arithmetic. No SUMIFS. The recursive carryover chain runs through Rolled Over instead. Each row's Rolled Over depends on prior period's Available; that prior Available depends on its own Rolled Over; etc. down to period 1. Sheets evaluates in dependency order; no circular reference.
- **`setNamedRanges_`** — `Budget_Available` shifts F8:F500 → G8:G500. New `Budget_RolledOver` = F8:F500. Saving tab + dashboard formulas reference these by name, so the column shift is transparent to them.

Layout: header + data rows extended to 7 cols (was 6). Column F = Rolled Over, column G = Available. Slicer range covers 7 cols. Currency format on D-G.

PWA paired with v0.19.3 (one-line `parseDashboard` change in `js/lib/budget.js` to read `row[6]` as available, plus `rolledOver` exposed at `row[5]` for future label use). Sheet shipped first per user direction; PWA dashboard briefly showed wrong numbers between sheet update and PWA deploy (~minutes window, on pixel branch).

Patterns added to CLAUDE.md trip-up list (item #32 — Budget tab schema changes need paired PWA parser updates).
- **Status:** Apps Script v11.19 deployed @44. User confirmed 2026-05-04 that the new Rolled Over column appears with sensible values (period 1 = $0, subsequent periods = prior Available, Available column still computes to the same numbers as before). PWA v0.19.3 paired fix shipped on main (commit `ff46930`) and merged into `pwa/pixel-ui-redesign` (PWA bumped v0.19.2 → v0.19.3 / cache v32 → v33).

### Phase 28: FIXED Summary-Cell Accordion + Pixel UI Graduation (PWA v0.19.4 → v0.19.6 + main merge)
The dashboard's `Fixed −$1,948.00` cell in the summary strip showed a single number with no way to drill into "what fixed expenses are due in this period?" without opening the sheet. User wanted the cell itself to become an accordion: tap it → expand an inline panel listing each Fixed Monthly Expense due in the selected period. Goal: enable the user to see all info on one page (categories toggled + fixed expenses toggled) OR keep things concise (everything collapsed) — choosing what's visible without view-switching round-trips. Three iterations: (1) add a sub-tab control bar — rejected as a new bar, (2) drill-down with back button — rejected as round-trip, (3) inline accordion — accepted.

After research on accordion best practices (avoid `<details>`/`<summary>` due to Safari grid bugs, use WAI-ARIA APG pattern with `<button>` + `aria-expanded` + `aria-controls`, no animation on first cut, persist state to localStorage, `display: none` not opacity:0), shipped in three sub-versions:

- **v0.19.4 (accordion infrastructure):** New helpers in `js/views/dashboard.js` — `expandedSummary` state, `toggleFixedExpand`, `renderFixedPanel`, `readExpandedSummary_`/`writeExpandedSummary_` (localStorage key `budget_dashboard_summary_expanded`). `summaryCell()` extended to render as `<button>` with WAI-ARIA attributes when accordion config passed. New data layer in `js/lib/budget.js`: `BUDGET_RANGE` extended to `A1:G215` (col shift from v11.19), `FIXED_RANGE = 'A2:C50'` added, `fetchFresh()` does a third parallel `dumpSheet` call (Budget + Saving + Fixed Monthly Expenses), `parseDashboard` returns new `fixedMonthlyExpenses` field. Cache key bumped to `_v3` to invalidate prior shape. New `js/periods.js` exports `BUDGET_YEAR = 2026` constant + `dueDatesInPeriod(dueDay, periodStart, periodEnd)` helper that mirrors the sheet's `buildFixedExpensesFormula_` exactly (iterates m=0..12, computes Date.UTC, filters by period range, detects month overflow). Sanity check warns if PWA panel total disagrees with sheet's Fixed value (catches BUDGET_YEAR drift between PWA and Apps Script).

- **v0.19.5 (sticky containment fix):** User reported the period bar wasn't sticking when scrolling. Root cause: `.period-bar` had `position: sticky` but its containing block `#period-bar-host` was shrink-to-fit (height ~60px), so sticky could only float within those few pixels — past that, the period bar scrolled away. Fix: promoted sticky to `#period-bar-host` (z-index 9). Lesson: sticky elements only float within their containing block's range; if the wrapper is shrink-to-fit, the sticky child can only stick within those few pixels. Same pattern applied to the FIXED panel later in v0.19.6.

- **v0.19.6 (sticky panel + header removal + highlight + main merge):** User feedback on the open panel: (1) make the toggle from FIXED also sticky when opened (anything toggled from a sticky element should remain sticky too), (2) remove the grey "Fixed expenses Apr 29 – May 12" header inside the panel (redundant with the period bar above), (3) highlight the FIXED button when toggled open. Implementation: `.fixed-panel` got `position: sticky; top: calc(env(safe-area-inset-top, 0px) + 108px); z-index: 6` (a sticky stack ladder below the period bar at z-index 9), `.fixed-panel-head` removed entirely, and `.summary-cell-toggle[aria-expanded="true"]` got the amber-label-and-chevron + `bg-period` tint highlight to make the active state obvious. A stale-read race during the v0.19.6 commit required a follow-up commit (`ed7da6e`) to actually remove the `.fixed-panel-head` element after the initial commit (`6d9650e`) only got the CSS + version bumps.

**Pixel UI graduation to main (2026-05-09):** After v0.19.6 verified working on phone, user asked to make the pixel branch the main one. Plan: `--no-ff` merge (preserves history vs. force-push) + tag the pre-merge state for rollback + keep the branch around as a remote snapshot. Conflicts on three files (`js/config.js`, `sw.js`, `js/views/dashboard.js`) all resolved by taking pixel's version (the desired state). Doc files auto-merged cleanly because the pixel branch had absorbed main's docs earlier. Tag `main-pre-pixel-merge` created as rollback handle; `pwa/pixel-ui-redesign` branch preserved on remote per user request. After merge: APP_VERSION on main = v0.19.6, CACHE_VERSION = v36, force-pixel via early `<head>` script in `index.html`, no in-app theme toggle. Pixel UI is now the canonical theme; future PWA work happens directly on main.

Patterns added to CLAUDE.md trip-up list (item #33 — sticky containment).
- **Status:** complete + verified working on phone. PWA v0.19.6 on main (cache v36); pixel branch preserved as remote snapshot. Rollback path: `git checkout main-pre-pixel-merge` for pre-merge state OR revert v0.19.6 commits to roll back the FIXED accordion alone.

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

### Phase 19: Deferred Audit Items (low priority — see findings.md "Apps Script Audit")
- [x] Hardcoded 2026 in fixed-expenses formula → `BUDGET_YEAR` constant (B9, v11.6). PayPeriods array still hardcoded — annual rollover touches 2 places.
- [ ] 999-row pre-filled formulas overhead (cleanup)
- [ ] Pagination for very large uncategorized-transaction lists (no longer "Pending" — single ledger)
- [ ] Complex income formula simplification
- [ ] Retry logic for transient API errors
- [x] `handleAddCategory_` off-by-one — fixed (A5, v11.5): now returns explicit capacity error
- [x] `setNamedRanges_` deletes all named ranges every time — fixed (B3, v11.5): scoped to owned prefixes
- [ ] `rebuildBudgetInternal_` silently clears budget rows in add mode
- [ ] updateWorkbook in-place per-row setFormula loop silently fails (root cause unknown; v11.12 worked around by delegating to rebuildBudgetInternal_). Investigation deferred.
- **Status:** ongoing — 3 of 9 items resolved by Phase 14 review work

## Workflow Reference (CRITICAL)

### Deploying Apps Script changes

**Recommended (one-line shortcut on the user's laptop):**
```bash
deploy "vNN — short description"
```

The `deploy` shell function (defined by `scripts/deploy-alias.sh`, installed in `~/.zshrc`) does: `git pull` → `cd apps-script && ./deploy.sh "$@"` → auto-commit + push the post-deploy timestamp bump. If missing on a new machine, install: `cat scripts/deploy-alias.sh >> ~/.zshrc && source ~/.zshrc`.

**Manual equivalent (any machine):**
```bash
cd ~/gsheetbudget2026-categorizerApp
git pull
cd apps-script
./deploy.sh "vNN — short description"
cd .. && git add apps-script/Code.js apps-script/VERSION.txt && git commit -m "chore: post-deploy timestamp bump" && git push
```

`deploy.sh` runs `clasp push` then `clasp deploy -i <PROD_DEPLOYMENT_ID> -d "..."`. It has a pre-deploy guard (added 2026-04-26) that **blocks if Code.js has uncommitted substantive changes** — prevents the v11.14-class incident where deployed code lives only in production. Override with `FORCE=1 ./deploy.sh "..."` if needed.

**NEVER** use plain `clasp deploy` — it creates a new deployment with a new URL and breaks the PWA.

**Why deploys can't run from cloud Claude environments:** `clasp` requires `~/.clasprc.json` (per-machine OAuth credential generated by `clasp login`). Sandboxed Claude environments (claude.ai/code web UI, GitHub-hosted Claude, etc.) don't have this credential — by design — because the deployed Apps Script runs with the user's Google account permissions (reads Gmail, writes the sheet). Anyone who could deploy via CI = anyone with repo access could run code as the user. The "must run on user's laptop" boundary is the security model. Don't try to remove it via service accounts; the friction is the feature.

### Deploying PWA changes
```bash
cd ~/gsheetbudget2026-categorizerApp
# edit js/, index.html, css/, sw.js
# bump APP_VERSION in js/config.js AND CACHE_VERSION in sw.js
# (header label is populated at runtime from APP_VERSION — no HTML edit needed)
git add . && git commit -m "..." && git push
# GitHub Pages auto-deploys from main branch
```
Bumping CACHE_VERSION is how the service worker knows to activate and purge the old cache. Skip it and installed PWAs will keep serving stale code.

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
| Dashboard showing stale Spent totals after sync (v0.13) | `categorize.js sync()` calls `invalidateDashboardCache()` after `batchCategorize` success; dashboard refetches on next mount |
| Auto-tab bucketizing Amazon variants separately (v0.14 design-time) | Normalizer changed from trailing-only `*alnum$` + `\b\d{4,}\b` to global `*alnum` + `\S*\d+\S*` + `#alnum`, plus 17-case Node test gate before commit |
| GitHub Pages deploy timeout at `updating_pages` (Apr 23 2026) | Added `.nojekyll` at repo root + empty-commit retrigger. Root cause was Pages running Jekyll by default on a non-Jekyll static PWA |

## Notes
- **Source of truth:** this git repo. Old Google Drive Code.gs and .md files are stale backups (still synced as a safety copy after each session).
- **Production deployment ID:** `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ` (in `apps-script/deploy.sh` and `js/config.js DEFAULT_API_URL` — must match)
- **PWA URL:** https://fahyad.github.io/gsheetbudget2026-categorizerApp/
- **GitHub repo:** `fahyad/gsheetbudget2026-categorizerApp` (public)
- **Local repo:** `/Users/fahyadkhan/gsheetbudget2026-categorizerApp`
- **clasp version:** 3.3.0 (`~/.npm-global/bin/clasp`)
- **clasp auth:** `~/.clasprc.json` (OAuth, never committed)
- **Credit card alerts only.** Debit alerts have a different format — TBD.
