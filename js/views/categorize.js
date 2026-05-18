// Categorize view — v0.15 redesign (Minimal Monochrome).
//
// Layout:
//   - Period bar at the top (no header): chevrons + collapsible calendar + right slot.
//   - Right slot: "Sync N" primary pill when queue > 0, else "↻ Parse" outline pill.
//   - Manual | Auto segmented control (underline on active).
//   - Manual list: merchant + uppercase date + amount. Tap → picker.
//   - Auto list: merchant + amount; secondary line "SUGGEST · Category".
//     Swipe right = accept, swipe left = hide-this-session.
//   - Undo bar above the tab bar; toast at the top.

import * as api from '../api.js';
import { store } from '../store.js';
import { periodForTimestamp, currentPeriod, allPeriods } from '../periods.js';
import { showError, showSuccess } from '../ui.js';
import { updateCategorizeBadge } from '../router.js';
import { invalidateDashboardCache, peekDashboardCache, getDashboardData } from '../lib/budget.js';
import { ensureIndexReady, suggest, invalidateSuggestIndex } from '../lib/suggest.js';
import { attachSwipe } from '../lib/swipe.js';

const SUBTAB_KEY = 'budget_categorize_subtab';

const TEMPLATE = `
  <section id="app-section">
    <div id="period-bar-host"></div>

    <div id="subtab-bar" role="tablist">
      <button id="subtab-manual" class="subtab active" role="tab" aria-selected="true">Manual</button>
      <button id="subtab-auto"   class="subtab"        role="tab" aria-selected="false">Auto</button>
    </div>

    <div id="transaction-list"></div>

    <div id="period-empty-state" class="empty-state" hidden>
      <div class="glyph">—</div>
      <p>No transactions in this period.</p>
      <p class="hint">Tap ‹ or › to move between periods.</p>
    </div>

    <div id="auto-empty-state" class="empty-state" hidden>
      <div class="glyph">—</div>
      <p>No high-confidence suggestions.</p>
      <p class="hint">Categorize a few manually to train the index.</p>
    </div>

    <div id="category-picker" hidden>
      <div id="category-picker-header">
        <div>
          <div id="selected-merchant-eyebrow">Categorize</div>
          <div id="selected-merchant"></div>
        </div>
        <button id="cancel-pick">Cancel</button>
      </div>
      <div id="category-buttons"></div>
      <button id="add-cat-btn" class="add-cat-trigger">+ Add Category</button>
    </div>

    <div id="add-cat-modal" hidden>
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h3>Add Category</h3>
        <label for="main-cat-select">Main</label>
        <select id="main-cat-select">
          <option value="" disabled selected>Select…</option>
        </select>
        <div id="new-main-group" hidden>
          <label for="new-main-input">New Main Category</label>
          <input type="text" id="new-main-input" placeholder="e.g. Savings">
        </div>
        <label for="sub-cat-input">Sub</label>
        <input type="text" id="sub-cat-input" placeholder="e.g. Coffee">
        <div class="modal-actions">
          <button id="cancel-add-cat" type="button">Cancel</button>
          <button id="save-add-cat" type="button">Save</button>
        </div>
      </div>
    </div>

    <!-- v0.19.0 (Phase G): bottom category rail. Tap a chip to arm a
         category, tap multiple txns to check them, tap Assign to batch-
         categorize them all. When no chip is armed, tapping a txn falls
         through to the existing picker (selectTransaction → categorize).
         The rail is mounted always; CSS hides it on the Auto sub-tab,
         and JS toggles its visibility based on category-load state. -->
    <div id="cat-rail" hidden>
      <div id="rail-status" role="status" aria-live="polite">
        <div id="rail-status-left">
          <span class="rail-status-hint">Tap a category to assign multiple at once</span>
        </div>
        <div id="rail-status-actions" hidden>
          <button id="rail-cancel-btn" type="button">Cancel</button>
          <button id="rail-commit-btn" type="button" disabled>Assign</button>
        </div>
      </div>
      <div id="rail-scroll"></div>
    </div>
  </section>

  <div id="loading" hidden>
    <div class="spinner"></div>
    <span>Loading…</span>
  </div>

  <div id="empty-state" class="empty-state" hidden>
    <div class="glyph">—</div>
    <p>No pending transactions.</p>
    <button id="empty-refresh-btn">Refresh</button>
  </div>

  <div id="undo-bar" hidden>
    <span id="undo-text"></span>
    <button id="undo-btn">Undo</button>
  </div>
`;

// Module-level state.
let selectedTimestamp = null;       // single-tap picker target; null when no picker open
let selectedPeriodIdx = null;       // number; default = current period
let refreshInFlight = false;
let syncInFlight = false;
let activeSubtab = 'manual';
let calendarOpen = false;
const rejectedThisSession = new Set();

// v0.19.0 (Phase G) — multi-select rail state. activeCategory armed = chip
// selected at the bottom rail. selectedTimestamps = Set of txn timestamps
// the user has checked for batch-assign. When activeCategory is null,
// tap-a-txn falls through to selectTransaction (the picker flow).
//
// State lifecycle: cleared on Cancel, Commit, chip-switch, period switch
// (timestamps only), subtab switch, and onHide. NOT persisted across
// reloads — selection is ephemeral by design (matches "I'm sorting
// receipts right now" metaphor).
let activeCategory = null;
let selectedTimestamps = new Set();

// v0.19.0 — chip data fetch promise. Populates chip budgeted/spent/
// available info from the dashboard cache. Module-level so it's only
// fired once per session (subsequent Categorize mounts reuse the cache).
let chipDataPromise = null;

// v0.15.4 perf state — shared across re-mounts for this module lifetime.
// These avoid the needless refetch-on-remount pattern confirmed in
// ClientMetrics. v0.19.8: replaced categoriesPromise with bootstrapPromise
// (the bootstrap endpoint returns categories + transactions in one call).
let bootstrapPromise = null;     // mount's in-flight fetch; reused by first refresh()
let didInitialRefresh = false;   // true after first successful refresh this session
let lastRefreshMs = 0;           // clock of last successful refresh()
const REFRESH_THROTTLE_MS = 60 * 1000;  // silent re-mount refresh skip window

// DOM refs.
let appSection, periodBarHost, transactionList, categoryPicker, categoryButtons,
    selectedMerchantEl, cancelPick, loadingEl, emptyState,
    emptyRefreshBtn, undoBar, undoText, undoBtn, addCatBtn, addCatModal,
    mainCatSelect, newMainGroup, newMainInput, subCatInput,
    cancelAddCat, saveAddCat, periodEmptyState, autoEmptyState,
    subtabManual, subtabAuto,
    // v0.19.0 — rail refs
    catRail, railStatusLeft, railStatusActions, railCancelBtn, railCommitBtn, railScroll;

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default {
  async mount(root) {
    root.innerHTML = TEMPLATE;

    appSection = root.querySelector('#app-section');
    periodBarHost = root.querySelector('#period-bar-host');
    transactionList = root.querySelector('#transaction-list');
    categoryPicker = root.querySelector('#category-picker');
    categoryButtons = root.querySelector('#category-buttons');
    selectedMerchantEl = root.querySelector('#selected-merchant');
    cancelPick = root.querySelector('#cancel-pick');
    loadingEl = root.querySelector('#loading');
    emptyState = root.querySelector('#empty-state');
    emptyRefreshBtn = root.querySelector('#empty-refresh-btn');
    undoBar = root.querySelector('#undo-bar');
    undoText = root.querySelector('#undo-text');
    undoBtn = root.querySelector('#undo-btn');
    addCatBtn = root.querySelector('#add-cat-btn');
    addCatModal = root.querySelector('#add-cat-modal');
    mainCatSelect = root.querySelector('#main-cat-select');
    newMainGroup = root.querySelector('#new-main-group');
    newMainInput = root.querySelector('#new-main-input');
    subCatInput = root.querySelector('#sub-cat-input');
    cancelAddCat = root.querySelector('#cancel-add-cat');
    saveAddCat = root.querySelector('#save-add-cat');
    periodEmptyState = root.querySelector('#period-empty-state');
    autoEmptyState = root.querySelector('#auto-empty-state');
    subtabManual = root.querySelector('#subtab-manual');
    subtabAuto = root.querySelector('#subtab-auto');

    // v0.19.0 — rail refs + handlers
    catRail = root.querySelector('#cat-rail');
    railStatusLeft = root.querySelector('#rail-status-left');
    railStatusActions = root.querySelector('#rail-status-actions');
    railCancelBtn = root.querySelector('#rail-cancel-btn');
    railCommitBtn = root.querySelector('#rail-commit-btn');
    railScroll = root.querySelector('#rail-scroll');

    railCancelBtn.addEventListener('click', cancelBatch);
    railCommitBtn.addEventListener('click', commitBatch);

    emptyRefreshBtn.addEventListener('click', () => refresh({ force: true }));
    cancelPick.addEventListener('click', () => deselectTransaction());
    undoBtn.addEventListener('click', () => undo());
    addCatBtn.addEventListener('click', () => openAddCategoryModal());
    cancelAddCat.addEventListener('click', () => closeAddCategoryModal());
    addCatModal.querySelector('.modal-overlay').addEventListener('click', () => closeAddCategoryModal());

    mainCatSelect.addEventListener('change', () => {
      newMainGroup.hidden = mainCatSelect.value !== '__new__';
      if (mainCatSelect.value === '__new__') newMainInput.focus();
    });
    saveAddCat.addEventListener('click', () => saveNewCategory());

    subtabManual.addEventListener('click', () => setSubtab('manual'));
    subtabAuto.addEventListener('click', () => setSubtab('auto'));

    const saved = localStorage.getItem(SUBTAB_KEY);
    activeSubtab = saved === 'auto' ? 'auto' : 'manual';
    applySubtabState();

    const cur = currentPeriod();
    if (cur) selectedPeriodIdx = cur.idx;

    // Render from the localStorage-cached store immediately — cold opens
    // paint the previous session's txns in <200ms instead of waiting for
    // parseAndFetch. refresh() will merge server state when it returns.
    renderAll();

    // v0.19.8: bootstrap pre-warm — fires the combined categories+txns
    // round-trip ASAP so refresh() can await it instead of paying the
    // network tax twice. On any failure (including old Apps Script
    // returning "Unknown action: bootstrap"), startBootstrap_ falls
    // back to the v0.15.4 dual-fetch pattern transparently. Module-
    // level so re-mounts within session reuse the same promise.
    if (!bootstrapPromise) {
      bootstrapPromise = startBootstrap_({ withParse: false });
    }

    // Suggest index is only needed for the Auto sub-tab. Warm it eagerly
    // ONLY if that's the user's persisted default; Manual-only users skip
    // the 3 s `dumpSheet:Transactions` read entirely.
    if (activeSubtab === 'auto') {
      ensureIndexReady()
        .then(() => renderTransactions())
        .catch(err => console.error('Suggest index warm-up failed:', err));
    }

    // v0.19.0 — fire chip data fetch in background. Hits dashboard cache
    // if fresh (10-min TTL), else does the parallel Budget+Saving dumpSheet
    // (~2.5s on cold open). Fires once per module lifetime; subsequent
    // re-mounts reuse the cache. Chip names render immediately; budget
    // info populates when this resolves.
    if (!chipDataPromise) {
      chipDataPromise = getDashboardData({ forceRefresh: false })
        .then(() => {
          // Re-render chips with full data
          if (catRail && !catRail.hidden) renderChips();
        })
        .catch(err => {
          console.warn('Chip data fetch failed (chips render name-only):', err);
          chipDataPromise = null;  // allow retry on next mount
        });
    }

    await refresh();
  },

  // Persistent-view lifecycle (v0.16.0). The router keeps the DOM mounted
  // after first visit and calls onShow() each time the user returns to this
  // tab. renderAll() is cheap (pure DOM updates from store; no API calls)
  // so this catches any state changes that happened while the user was on
  // another tab — e.g. saving goal archived, sync removed an item.
  //
  // v0.19.0 (Phase G): clear rail state on tab return. Selection is
  // ephemeral by design (per the plan E13) — closing/leaving the app
  // discards in-progress sorting, matching the "receipt-sorting" metaphor.
  onShow() {
    activeCategory = null;
    selectedTimestamps.clear();
    renderAll();
  },

  // Called when navigating away to another tab. Close any transient UI so
  // the user returning later doesn't see a half-open modal or dangling
  // selection. v0.19.0: also clear rail state (mirrors onShow).
  onHide() {
    closeAddCategoryModal();
    deselectTransaction();
    calendarOpen = false;
    activeCategory = null;
    selectedTimestamps.clear();
  },

  // Kept for source compatibility — no longer called by the router (views
  // persist for the app lifetime).
  unmount() {
    selectedTimestamp = null;
    calendarOpen = false;
  },
};

// ======================================================================
// SUBTABS
// ======================================================================

function setSubtab(which) {
  if (which !== 'manual' && which !== 'auto') return;
  if (activeSubtab === which) return;
  activeSubtab = which;
  localStorage.setItem(SUBTAB_KEY, which);
  applySubtabState();

  // v0.19.0 — clear rail state when switching sub-tabs. The Auto tab
  // doesn't use the rail; carrying state across would surprise on return.
  if (activeCategory || selectedTimestamps.size > 0) {
    activeCategory = null;
    selectedTimestamps.clear();
  }

  deselectTransaction();
  renderTransactions();
  updateRailVisibility();
  updateRailStatus();

  // Lazy-warm the suggest index the first time the user flips to Auto.
  // ensureIndexReady() is internally idempotent — subsequent calls short-
  // circuit on the cached index, so we can call this unconditionally.
  if (which === 'auto') {
    ensureIndexReady()
      .then(() => renderTransactions())
      .catch(err => console.error('Suggest index warm-up failed:', err));
  }
}

function applySubtabState() {
  subtabManual.classList.toggle('active', activeSubtab === 'manual');
  subtabAuto.classList.toggle('active', activeSubtab === 'auto');
  subtabManual.setAttribute('aria-selected', String(activeSubtab === 'manual'));
  subtabAuto.setAttribute('aria-selected', String(activeSubtab === 'auto'));
}

// ======================================================================
// PERIOD BAR (calendar dropdown)
// ======================================================================

function pickPeriod() {
  // Returns the Period object to render in the bar. Defaults to current;
  // falls back to the most recent period that has any uncategorized txn.
  const all = allPeriods();
  if (selectedPeriodIdx != null) {
    const p = all.find(x => x.idx === selectedPeriodIdx);
    if (p) return p;
  }
  return currentPeriod() || all[all.length - 1];
}

function renderPeriodBar() {
  periodBarHost.innerHTML = '';

  const p = pickPeriod();
  if (!p) return;

  const bar = document.createElement('div');
  bar.className = 'period-bar' + (calendarOpen ? ' open' : '');

  const top = document.createElement('div');
  top.className = 'period-bar-top';

  const left = document.createElement('div');
  left.className = 'period-nav-left';

  const prev = document.createElement('button');
  prev.className = 'period-chev';
  prev.type = 'button';
  prev.textContent = '‹';
  prev.addEventListener('click', (e) => { e.stopPropagation(); shiftPeriod(-1); });

  const toggle = document.createElement('div');
  toggle.className = 'period-toggle';
  toggle.addEventListener('click', () => {
    calendarOpen = !calendarOpen;
    renderPeriodBar();
  });

  const label = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'period-eyebrow';
  const isCurrent = currentPeriod()?.idx === p.idx;
  eyebrow.textContent = isCurrent ? 'Current Period' : 'Period';
  const name = document.createElement('div');
  name.className = 'period-label';
  name.textContent = p.label;
  label.appendChild(eyebrow);
  label.appendChild(name);

  // v0.18.1 (Phase D): today chip. Hidden via display:none in pixel.css's
  // default rule for both themes; pixel theme re-shows via attribute scope.
  // So: in mono this DOM is invisible; in pixel it renders "[27]" (amber
  // brackets + day-of-month) for the current period or "PAST" otherwise.
  // Same block also in dashboard.js renderPeriodBar — keep the two in sync.
  const todayChip = document.createElement('span');
  todayChip.className = 'period-today-chip' + (isCurrent ? ' is-current' : '');
  if (isCurrent) {
    const day = new Date().getDate();
    todayChip.innerHTML = '<span class="today-bracket">[</span>' + day + '<span class="today-bracket">]</span>';
  } else {
    todayChip.textContent = 'PAST';
  }

  const caret = document.createElement('span');
  caret.className = 'period-caret';
  caret.textContent = '▾';

  toggle.appendChild(label);
  toggle.appendChild(todayChip);
  toggle.appendChild(caret);

  const next = document.createElement('button');
  next.className = 'period-chev';
  next.type = 'button';
  next.textContent = '›';
  next.addEventListener('click', (e) => { e.stopPropagation(); shiftPeriod(1); });

  left.appendChild(prev);
  left.appendChild(toggle);
  left.appendChild(next);

  const right = document.createElement('div');
  right.className = 'period-right';
  right.appendChild(renderRightPill());

  top.appendChild(left);
  top.appendChild(right);
  bar.appendChild(top);

  if (calendarOpen) {
    bar.appendChild(renderCalendar(p));
  }

  periodBarHost.appendChild(bar);
}

function shiftPeriod(delta) {
  const all = allPeriods();
  const cur = pickPeriod();
  if (!cur) return;
  const i = all.findIndex(x => x.idx === cur.idx);
  const target = all[i + delta];
  if (!target) return;
  selectedPeriodIdx = target.idx;
  // v0.19.0 — txns are period-scoped, so selection clears on period
  // shift. Chip stays armed (user is probably moving to find more
  // matching txns to assign to the same category).
  selectedTimestamps.clear();
  deselectTransaction();
  renderAll();
}

function renderRightPill() {
  const n = store.syncQueue.length;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill-btn' + (n > 0 ? ' primary' : '');
  if (n > 0) {
    btn.textContent = syncInFlight ? 'Syncing…' : `Sync ${n}`;
    btn.disabled = syncInFlight;
    btn.addEventListener('click', () => sync());
  } else {
    const glyph = document.createElement('span');
    glyph.className = 'pill-glyph';
    glyph.textContent = '↻';
    btn.appendChild(glyph);
    btn.appendChild(document.createTextNode('Parse'));
    btn.disabled = refreshInFlight;
    // User taps Parse → force-refresh, bypassing the 60s silent throttle
    // and re-fetching categories so new sheet-side categories show up.
    btn.addEventListener('click', () => refresh({ force: true }));
  }
  return btn;
}

function renderCalendar(period) {
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  // Per-day txn count for the selected period only.
  const countByIso = {};
  for (const t of store.transactions) {
    const iso = String(t.timestamp || '').slice(0, 10);
    countByIso[iso] = (countByIso[iso] || 0) + 1;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();
  const ONE_DAY = 86400000;

  for (let ms = startMs; ms <= endMs; ms += ONE_DAY) {
    const d = new Date(ms);
    const iso = d.toISOString().slice(0, 10);
    const count = countByIso[iso] || 0;
    const isToday = iso === todayIso;

    const cell = document.createElement('div');
    cell.className = 'calendar-cell'
      + (isToday ? ' today' : '')
      + (count > 0 ? ' has-txn' : '');

    const num = document.createElement('div');
    num.style.lineHeight = '1';
    num.textContent = String(d.getUTCDate());
    cell.appendChild(num);

    if (count > 0) {
      const dot = document.createElement('div');
      dot.className = 'cell-dot';
      cell.appendChild(dot);
    }

    grid.appendChild(cell);
  }

  return grid;
}

// ======================================================================
// REFRESH / CATEGORIZE / UNDO / SYNC
// ======================================================================

/**
 * Refreshes categories (from server) + uncategorized txns (from parseAndFetch).
 *
 * v0.19.8 changes:
 *   - Single round-trip via bootstrap endpoint (1 network tax instead of 2).
 *     Falls back to parallel fetchCategories + parseAndFetch on any failure.
 *   - Non-force refresh awaits the mount's in-flight bootstrapPromise.
 *   - Force refresh fires a fresh bootstrap call with withParse=true and
 *     replaces bootstrapPromise so future awaits see the latest data.
 *
 * v0.15.4 changes (still in effect):
 *   - Silent re-mounts within REFRESH_THROTTLE_MS = 60s are no-ops.
 *     Users cross-navigating to Dashboard + back no longer pay ~5s.
 *   - Server's txn list is installed via store.setTransactions() (replace),
 *     which correctly evicts stale-cached items that were categorized
 *     elsewhere. Previously addTransactions()+filter could leave phantoms.
 *
 * opts.force = true forces a full refetch (used by Parse pill + empty-state
 * Refresh button). Always fires fresh data AND tells the server to scan
 * Gmail for new infoalerts.
 */
async function refresh({ force = false } = {}) {
  if (refreshInFlight) return;

  if (!force && didInitialRefresh && (Date.now() - lastRefreshMs) < REFRESH_THROTTLE_MS) {
    // Silent re-mount within the throttle window. No-op. The user taps
    // Parse if they want fresh data now.
    return;
  }

  refreshInFlight = true;
  emptyRefreshBtn.disabled = true;
  showLoading(true);
  deselectTransaction();
  renderPeriodBar();

  try {
    // Pick the right bootstrap promise:
    //   force=true:  fire fresh (withParse=true); replace cached promise
    //                so subsequent non-force awaits see latest data
    //   force=false + bootstrapPromise exists: await the in-flight one
    //   force=false + no promise (recovery): fire fresh
    let promise;
    if (force) {
      bootstrapPromise = startBootstrap_({ withParse: true });
      promise = bootstrapPromise;
    } else if (bootstrapPromise) {
      promise = bootstrapPromise;
    } else {
      bootstrapPromise = startBootstrap_({ withParse: false });
      promise = bootstrapPromise;
    }

    const result = await promise;

    // Apply transactions side-effect with sync-queue filtering. (Categories
    // side-effect already applied inside startBootstrap_ when the promise
    // resolved — needed for renderChips during cold mount before refresh
    // even completes.)
    const queued = store.getSyncQueueTimestamps();
    store.setTransactions(result.transactions.filter(t => !queued.has(t.timestamp)));

    lastRefreshMs = Date.now();
    didInitialRefresh = true;
    renderAll();
  } catch (err) {
    showError('Failed to load transactions: ' + err.message);
  } finally {
    showLoading(false);
    refreshInFlight = false;
    emptyRefreshBtn.disabled = false;
    renderPeriodBar();
  }
}

/**
 * v0.19.8: fires a bootstrap call (one round-trip → categories + txns)
 * with transparent fallback to the v0.15.4 dual-fetch pattern. Applies
 * the categories side-effect (store + renderCategories + renderChips +
 * updateRailVisibility) as soon as the data is in hand so cold mount can
 * render the rail immediately. Returns {categories, transactions, parsed,
 * parseErrors, viaBootstrap}; the caller applies the transactions side-
 * effect (with sync-queue filtering).
 *
 * Failure modes handled:
 *   - Old Apps Script returns {success:false, error:"Unknown action..."}
 *     → request() throws → catch fires fallback path
 *   - Bootstrap returns 200 with categoriesError or transactionsError set
 *     → fall through to fallback for the failed section(s)
 *     (current impl: full fallback if either errored — simpler + safe)
 *   - Network error / timeout → catch fires fallback
 *   - Fallback also fails → throw; caller surfaces toast
 */
async function startBootstrap_({ withParse = false } = {}) {
  let result;
  try {
    const data = await api.bootstrap({ withParse });
    if (!data.categoriesError && !data.transactionsError) {
      result = {
        categories: data.categories,
        transactions: data.transactions,
        parsed: data.parsed || 0,
        parseErrors: data.parseErrors || 0,
        viaBootstrap: true
      };
    } else {
      console.warn('bootstrap partial failure (falling back):',
        'cat=' + data.categoriesError, 'txn=' + data.transactionsError);
    }
  } catch (err) {
    console.warn('bootstrap unavailable, falling back to dual fetch:', err.message || err);
  }

  if (!result) {
    // Dual-fetch fallback (the v0.15.4 path). Promise.all so both fire
    // in parallel from the client; server-side they serialize (Apps
    // Script single-threaded container — see Phase 22 findings).
    try {
      const [catData, txnData] = await Promise.all([
        api.fetchCategories(),
        api.parseAndFetch({ withParse })
      ]);
      result = {
        categories: catData.categories,
        transactions: txnData.transactions,
        parsed: txnData.parsed || 0,
        parseErrors: txnData.parseErrors || 0,
        viaBootstrap: false
      };
    } catch (err) {
      // Both bootstrap AND fallback failed. Clear cached promise so the
      // next refresh attempts a fresh fire instead of awaiting a rejected
      // promise forever.
      bootstrapPromise = null;
      if (store.categories.length === 0) {
        showError('Could not load categories. Check connection and refresh.');
      }
      throw err;
    }
  }

  // Apply categories side-effect now (before caller awaits). Cold mount's
  // renderChips/updateRailVisibility paths need them.
  store.setCategories(result.categories);
  renderCategories();
  renderChips();
  updateRailVisibility();

  return result;
}

function categorize(timestamp, category) {
  const removed = store.removeTransaction(timestamp);
  if (!removed) return;
  store.addToSyncQueue(removed, category);
  store.setLastCategorized({ ...removed, category });
  deselectTransaction();
  renderAll();
}

function undo() {
  if (syncInFlight) {
    showError('Wait for sync to finish before undoing.');
    return;
  }
  const last = store.lastCategorized;
  if (!last) return;

  // v0.19.0 — batch undo. lastCategorized may have a `batch: [...]`
  // field set by commitBatch(). Loop and restore each. If sync ran
  // between commit and undo, some items will already be out of the
  // syncQueue — we report the partial restore but don't error out
  // (out-of-scope to issue server uncategorize for synced items).
  if (last.batch && Array.isArray(last.batch)) {
    let restoredCount = 0;
    for (const txn of last.batch) {
      const removed = store.removeFromSyncQueue(txn.timestamp);
      if (removed) {
        store.restoreTransaction({
          timestamp: removed.timestamp,
          date: removed.date,
          merchant: removed.merchant,
          amount: removed.amount,
        });
        restoredCount++;
      }
    }
    if (restoredCount < last.batch.length) {
      showError(restoredCount + ' of ' + last.batch.length + ' restored — others already synced');
    }
    store.clearLastCategorized();
    renderAll();
    return;
  }

  // Single undo (existing path)
  const restored = store.removeFromSyncQueue(last.timestamp);
  if (restored) {
    store.restoreTransaction({
      timestamp: restored.timestamp,
      date: restored.date,
      merchant: restored.merchant,
      amount: restored.amount,
    });
  }
  store.clearLastCategorized();
  renderAll();
}

async function sync() {
  if (store.syncQueue.length === 0) return;
  if (syncInFlight) return;
  syncInFlight = true;
  undoBtn.disabled = true;
  renderPeriodBar();

  try {
    const data = await api.batchCategorize(store.syncQueue);
    const succeeded = data.results.filter(r => r.success).map(r => r.timestamp);
    const failed = data.results.filter(r => !r.success);

    store.clearSyncedItems(succeeded);

    if (succeeded.length > 0) {
      invalidateDashboardCache();
      invalidateSuggestIndex();
    }

    if (failed.length === 0) {
      showSuccess('✓ ' + succeeded.length + ' synced');
    } else {
      showError(failed.length + ' failed to sync. Tap Sync to retry.');
    }

    store.clearLastCategorized();
    renderUndo();
  } catch (err) {
    showError('Sync failed: ' + err.message + '. Data saved locally.');
  } finally {
    syncInFlight = false;
    undoBtn.disabled = false;
    renderPeriodBar();
  }
}

// ======================================================================
// RENDERING
// ======================================================================

function renderAll() {
  renderPeriodBar();
  renderCategories();
  renderUndo();
  renderTransactions();
  // v0.19.0 — rail rendering. Chips re-render whenever categories list
  // changes; status reflects current selection state. Visibility based
  // on subtab + categories loaded.
  renderChips();
  updateRailStatus();
  updateRailVisibility();
}

function renderTransactions() {
  transactionList.innerHTML = '';

  if (store.transactions.length === 0) {
    appSection.hidden = true;
    emptyState.hidden = false;
    periodEmptyState.hidden = true;
    autoEmptyState.hidden = true;
    return;
  }

  appSection.hidden = false;
  emptyState.hidden = true;

  const visible = store.transactions.filter(t => {
    const p = periodForTimestamp(t.timestamp);
    return p && p.idx === selectedPeriodIdx;
  });

  if (activeSubtab === 'auto') {
    renderAutoList(visible);
  } else {
    renderManualList(visible);
  }
}

function renderManualList(visible) {
  autoEmptyState.hidden = true;

  if (visible.length === 0) {
    periodEmptyState.hidden = false;
    return;
  }
  periodEmptyState.hidden = true;

  // v0.19.0 — when a chip is armed, txn rows show .armed cursor +
  // .checked stripe for items in the multi-select. Selection state is
  // ephemeral, so it's safe to read directly from selectedTimestamps.
  const armed = !!activeCategory;

  for (const txn of visible) {
    const div = document.createElement('div');
    div.className = 'txn-item';
    if (armed) div.classList.add('armed');
    if (selectedTimestamps.has(txn.timestamp)) div.classList.add('checked');
    div.dataset.timestamp = txn.timestamp;

    const left = document.createElement('div');
    left.style.flex = '1';
    left.style.minWidth = '0';

    const merchantSpan = document.createElement('div');
    merchantSpan.className = 'txn-merchant';
    merchantSpan.textContent = txn.merchant;

    const dateSpan = document.createElement('div');
    dateSpan.className = 'txn-date';
    dateSpan.textContent = txn.date;

    left.appendChild(merchantSpan);
    left.appendChild(dateSpan);

    const amountSpan = document.createElement('span');
    amountSpan.className = 'txn-amount';
    amountSpan.textContent = '$' + Math.abs(txn.amount).toFixed(2);

    div.appendChild(left);
    div.appendChild(amountSpan);

    div.addEventListener('click', () => selectTransaction(txn));
    transactionList.appendChild(div);
  }
}

function renderAutoList(visible) {
  periodEmptyState.hidden = true;

  const rows = [];
  for (const txn of visible) {
    if (rejectedThisSession.has(txn.timestamp)) continue;
    const s = suggest(txn.merchant);
    if (!s) continue;
    rows.push({ txn, suggestion: s });
  }

  if (rows.length === 0) {
    autoEmptyState.hidden = false;
    return;
  }
  autoEmptyState.hidden = true;

  for (const { txn, suggestion } of rows) {
    const row = document.createElement('div');
    row.className = 'auto-row';
    row.dataset.timestamp = txn.timestamp;

    const inner = document.createElement('div');
    inner.className = 'auto-row-inner';

    const line1 = document.createElement('div');
    line1.className = 'auto-row-line1';
    const merchantSpan = document.createElement('span');
    merchantSpan.className = 'txn-merchant';
    merchantSpan.textContent = txn.merchant;
    const amountSpan = document.createElement('span');
    amountSpan.className = 'txn-amount';
    amountSpan.textContent = '$' + Math.abs(txn.amount).toFixed(2);
    line1.appendChild(merchantSpan);
    line1.appendChild(amountSpan);

    const line2 = document.createElement('div');
    line2.className = 'auto-row-line2';
    const indicator = document.createElement('span');
    indicator.className = 'auto-suggest-indicator';
    indicator.textContent = 'Suggest';
    const catSpan = document.createElement('span');
    catSpan.className = 'auto-suggest-category';
    catSpan.textContent = '· ' + suggestion.category;
    line2.appendChild(indicator);
    line2.appendChild(catSpan);

    inner.appendChild(line1);
    inner.appendChild(line2);
    row.appendChild(inner);

    inner.addEventListener('click', () => selectTransaction(txn));

    attachSwipe(inner, {
      revealEl: row,
      onRight: () => categorize(txn.timestamp, suggestion.category),
      onLeft: () => {
        rejectedThisSession.add(txn.timestamp);
        row.remove();
        if (!transactionList.querySelector('.auto-row')) {
          autoEmptyState.hidden = false;
        }
      },
    });

    transactionList.appendChild(row);
  }
}

function renderCategories() {
  categoryButtons.innerHTML = '';

  if (store.categories.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-cats-msg';
    msg.textContent = 'No categories loaded. Tap ↻ Parse.';
    categoryButtons.appendChild(msg);
    return;
  }

  const groups = {};
  for (const cat of store.categories) {
    (groups[cat.main] = groups[cat.main] || []).push(cat.sub);
  }

  for (const [main, subs] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'cat-group-label';
    label.textContent = main;
    categoryButtons.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'cat-chips-row';
    for (const sub of subs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      btn.textContent = sub;
      btn.addEventListener('click', () => {
        if (selectedTimestamp) categorize(selectedTimestamp, sub);
      });
      chips.appendChild(btn);
    }
    categoryButtons.appendChild(chips);
  }
}

function renderUndo() {
  const last = store.lastCategorized;
  if (last) {
    // v0.19.0 — batch label "<N> → category"; single keeps "merchant → category"
    if (last.batch && Array.isArray(last.batch)) {
      undoText.textContent = last.batch.length + ' → ' + last.category;
    } else {
      undoText.textContent = `${last.merchant} → ${last.category}`;
    }
    undoBar.hidden = false;
  } else {
    undoBar.hidden = true;
  }
  updateCategorizeBadge();
}

function selectTransaction(txn) {
  // v0.19.0 — if a chip is armed, route to multi-select instead of the
  // picker. The two flows are mutually exclusive: picker only opens
  // when no chip is armed (the original 2-tap quick-categorize path).
  if (activeCategory) {
    toggleSelectedTxn(txn);
    return;
  }
  selectedTimestamp = txn.timestamp;
  selectedMerchantEl.textContent = txn.merchant + ' · $' + Math.abs(txn.amount).toFixed(2);
  document.querySelectorAll('.txn-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.timestamp === txn.timestamp);
  });
  renderCategories();
  categoryPicker.hidden = false;
}

function deselectTransaction() {
  selectedTimestamp = null;
  categoryPicker.hidden = true;
  document.querySelectorAll('.txn-item.selected').forEach(el => el.classList.remove('selected'));
}

// ======================================================================
// ADD CATEGORY
// ======================================================================

function openAddCategoryModal() {
  mainCatSelect.innerHTML = '<option value="" disabled selected>Select…</option>';
  const mains = [...new Set(store.categories.map(c => c.main))];
  for (const m of mains) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    mainCatSelect.appendChild(opt);
  }
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = 'New…';
  mainCatSelect.appendChild(newOpt);

  newMainGroup.hidden = true;
  newMainInput.value = '';
  subCatInput.value = '';
  addCatModal.hidden = false;
}

function closeAddCategoryModal() { addCatModal.hidden = true; }

async function saveNewCategory() {
  const mainVal = mainCatSelect.value;
  const mainCategory = (mainVal === '__new__' ? newMainInput.value : mainVal).trim();
  const subCategory = subCatInput.value.trim();

  if (!mainCategory || !subCategory) {
    showError('Both main and sub category are required');
    return;
  }
  if (store.categories.some(c => c.sub.toLowerCase() === subCategory.toLowerCase())) {
    showError('Category "' + subCategory + '" already exists');
    return;
  }
  closeAddCategoryModal();

  const newCat = { main: mainCategory, sub: subCategory };
  store.addCategory(newCat);
  renderCategories();
  // v0.19.0 — re-render the rail so the new chip appears, then auto-arm
  // it (per Phase G plan E11). Common case: user added "Pastries" because
  // they're about to assign a txn to it. Saves them the chip-tap step.
  renderChips();
  updateRailVisibility();
  armCategory(subCategory);

  try {
    await api.addCategory(mainCategory, subCategory);
  } catch (err) {
    store.removeCategory(subCategory);
    renderCategories();
    renderChips();
    // If the auto-armed category got removed, gracefully disarm.
    if (activeCategory === subCategory) disarmCategory();
    updateRailVisibility();
    showError('Failed to add category: ' + err.message);
  }
}

function showLoading(show) { loadingEl.hidden = !show; }

// ======================================================================
// CATEGORY RAIL (v0.19.0 — Phase G)
// ======================================================================
//
// State model:
//   IDLE       — activeCategory=null, selectedTimestamps={}.
//                Tap a txn → opens picker (existing single-tap flow).
//                Tap a chip → arm + transition to ARMED.
//   ARMED      — activeCategory='X', selectedTimestamps={}.
//                Tap a txn → toggleSelectedTxn → ARMED+SEL.
//                Tap same chip → disarm → IDLE.
//                Tap different chip → arm new + clear selection.
//   ARMED+SEL  — activeCategory='X', selectedTimestamps={t1, t2, ...}.
//                Tap a txn → toggle in/out of selection.
//                Cancel → disarm → IDLE.
//                Commit → batch-categorize all → IDLE.
//
// All rail-level state changes go through one of: armCategory, disarmCategory,
// toggleSelectedTxn, commitBatch, cancelBatch. The render helpers (renderChips,
// updateChipActiveStates, updateTxnArmedStates, updateRailStatus,
// updateRailVisibility) only read state and write DOM; they never mutate.

function onChipTap(catName) {
  if (activeCategory === catName) {
    // Re-tap same chip = disarm
    disarmCategory();
  } else {
    // Tap a different chip = arm + clear any pending selection.
    // The mockup KEEPS selection on chip-switch; we override that — it's a
    // footgun (user picks 5 coffee txns, accidentally taps Travel chip,
    // assigns coffees to Travel). Safety > faithfulness here.
    armCategory(catName);
  }
}

function armCategory(catName) {
  activeCategory = catName;
  selectedTimestamps.clear();
  // Mutually exclude with the picker. If picker is open (single-tap path
  // mid-action), close it.
  if (selectedTimestamp) deselectTransaction();
  updateChipActiveStates();
  updateTxnArmedStates();
  updateRailStatus();
}

function disarmCategory() {
  activeCategory = null;
  selectedTimestamps.clear();
  updateChipActiveStates();
  updateTxnArmedStates();
  updateRailStatus();
}

function cancelBatch() {
  disarmCategory();
}

function toggleSelectedTxn(txn) {
  const ts = txn.timestamp;
  if (selectedTimestamps.has(ts)) {
    selectedTimestamps.delete(ts);
  } else {
    selectedTimestamps.add(ts);
  }
  // Selective DOM update — flip the .checked class on this one item only.
  // Rationale: tapping checkboxes should feel instant; full-list re-render
  // is wasteful and would scroll-jump on long lists.
  const item = findTxnItem(ts);
  if (item) item.classList.toggle('checked', selectedTimestamps.has(ts));
  updateRailStatus();
}

function commitBatch() {
  if (!activeCategory || selectedTimestamps.size === 0) return;
  if (syncInFlight) {
    showError('Wait for sync to finish before committing.');
    return;
  }

  // Snapshot first — selectedTimestamps is mutated by removeTransaction
  // indirectly (via re-renders) and by our own clear at the end.
  const snapshot = [...selectedTimestamps];
  const category = activeCategory;

  // Remove all from store.transactions, collect the removed objects so
  // we can both queue them for sync and store them in lastCategorized
  // for batch undo.
  const batch = [];
  for (const ts of snapshot) {
    const removed = store.removeTransaction(ts);
    if (removed) batch.push(removed);
  }

  if (batch.length === 0) {
    // Nothing to commit — defensive (timestamps already gone)
    disarmCategory();
    return;
  }

  // Single localStorage write for the whole batch.
  store.addBatchToSyncQueue(batch, category);
  // Undo target: the whole batch as one unit. renderUndo handles the
  // "<N> → category" label; undo() loops the batch on Undo tap.
  store.setLastCategorized({ batch, category });

  // Reset rail state.
  activeCategory = null;
  selectedTimestamps.clear();

  renderAll();

  showSuccess('✓ ' + batch.length + ' → ' + category);
}

function renderChips() {
  if (!railScroll) return;
  railScroll.innerHTML = '';

  if (store.categories.length === 0) {
    return;
  }

  // Group by main, preserving insertion order (matches Setup tab order).
  const groups = [];
  const idx = {};
  for (const c of store.categories) {
    if (!(c.main in idx)) {
      idx[c.main] = groups.length;
      groups.push({ main: c.main, subs: [] });
    }
    groups[idx[c.main]].subs.push(c);
  }

  // Pull budget data for the selected period if available. peekDashboardCache
  // never fires a network call — getDashboardData() in mount() is what
  // populates the cache. If the cache is empty, chips render name-only.
  const selected = pickPeriod();
  const cache = peekDashboardCache();
  const chipDataMap = {};
  if (cache && selected) {
    const periodCats = (cache.data.categoriesByPeriod && cache.data.categoriesByPeriod[selected.label]) || [];
    for (const pc of periodCats) {
      chipDataMap[pc.sub] = pc;
    }
  }

  groups.forEach((g, gi) => {
    if (gi > 0) {
      const div = document.createElement('div');
      div.className = 'rail-divider';
      railScroll.appendChild(div);
    }
    const groupLabel = document.createElement('div');
    groupLabel.className = 'rail-group-label';
    groupLabel.textContent = g.main;
    railScroll.appendChild(groupLabel);
    for (const c of g.subs) {
      railScroll.appendChild(renderChip(c, chipDataMap[c.sub]));
    }
  });

  // + Add chip at the end opens the same modal as the picker's add button.
  const dividerEnd = document.createElement('div');
  dividerEnd.className = 'rail-divider';
  railScroll.appendChild(dividerEnd);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'rail-add';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => openAddCategoryModal());
  railScroll.appendChild(addBtn);
}

function renderChip(c, data) {
  // c     = { main, sub } from store.categories
  // data  = { budgeted, spent, available } from dashboard cache (may be undefined)
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rail-chip';
  if (activeCategory === c.sub) btn.classList.add('active');
  btn.dataset.sub = c.sub;
  btn.setAttribute('aria-pressed', activeCategory === c.sub ? 'true' : 'false');
  btn.addEventListener('click', () => onChipTap(c.sub));

  const nameEl = document.createElement('div');
  nameEl.className = 'chip-name';
  nameEl.textContent = c.sub;
  btn.appendChild(nameEl);

  if (data) {
    const over = data.available < 0;
    const zero = !over && Math.abs(data.available) < 0.005;
    const state = over ? 'over' : zero ? 'zero' : 'pos';
    const pct = data.budgeted > 0 ? Math.min((data.spent || 0) / data.budgeted, 1) : 0;

    const bar = document.createElement('div');
    bar.className = 'chip-bar';
    const fill = document.createElement('div');
    fill.className = 'chip-bar-fill ' + state;
    fill.style.width = (pct * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    btn.appendChild(bar);

    const amount = document.createElement('div');
    amount.className = 'chip-amount ' + state;
    const sign = over ? '−' : '';
    amount.textContent = sign + '$' + Math.round(Math.abs(data.available));
    btn.appendChild(amount);
  }

  return btn;
}

function updateChipActiveStates() {
  if (!railScroll) return;
  const chips = railScroll.querySelectorAll('.rail-chip');
  chips.forEach(c => {
    const isActive = c.dataset.sub === activeCategory;
    c.classList.toggle('active', isActive);
    c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function updateTxnArmedStates() {
  if (!transactionList) return;
  const armed = !!activeCategory;
  const items = transactionList.querySelectorAll('.txn-item');
  items.forEach(item => {
    item.classList.toggle('armed', armed);
    const ts = item.dataset.timestamp;
    item.classList.toggle('checked', selectedTimestamps.has(ts));
  });
}

function updateRailStatus() {
  if (!catRail || !railStatusLeft || !railStatusActions || !railCommitBtn) return;
  const armed = !!activeCategory;
  catRail.classList.toggle('armed', armed);

  railStatusLeft.innerHTML = '';

  if (!armed) {
    const hint = document.createElement('span');
    hint.className = 'rail-status-hint';
    hint.textContent = 'Tap a category to assign multiple at once';
    railStatusLeft.appendChild(hint);
    railStatusActions.hidden = true;
    return;
  }

  // ARMED: show count → category and (when count>0) the sum.
  let sum = 0;
  if (selectedTimestamps.size > 0) {
    for (const txn of store.transactions) {
      if (selectedTimestamps.has(txn.timestamp)) {
        sum += Math.abs(txn.amount);
      }
    }
  }

  const count = selectedTimestamps.size;
  const countEl = document.createElement('span');
  countEl.className = 'rail-status-count';
  countEl.textContent = count;

  const arrow = document.createElement('span');
  arrow.className = 'rail-status-arrow';
  arrow.textContent = '→';

  const cat = document.createElement('span');
  cat.className = 'rail-status-active';
  cat.textContent = activeCategory;

  railStatusLeft.appendChild(countEl);
  railStatusLeft.appendChild(arrow);
  railStatusLeft.appendChild(cat);

  if (count > 0) {
    const sumEl = document.createElement('span');
    sumEl.className = 'rail-status-sum';
    sumEl.textContent = '$' + sum.toFixed(2);
    railStatusLeft.appendChild(sumEl);
  }

  railStatusActions.hidden = false;
  railCommitBtn.disabled = count === 0 || syncInFlight;
  railCommitBtn.textContent = count > 0 ? 'Assign ' + count : 'Assign';
  railCommitBtn.setAttribute(
    'aria-label',
    count > 0 ? 'Assign ' + count + ' to ' + activeCategory : 'Assign'
  );
}

function updateRailVisibility() {
  if (!catRail || !appSection) return;
  const shouldShow = activeSubtab === 'manual' && store.categories.length > 0;
  catRail.hidden = !shouldShow;
  appSection.classList.toggle('with-rail', shouldShow);
}

// Linear scan to find a txn item by data-timestamp. Avoids needing
// CSS.escape for timestamps that contain '#' (uniqueSuffix_).
function findTxnItem(timestamp) {
  if (!transactionList) return null;
  const items = transactionList.querySelectorAll('.txn-item');
  for (const item of items) {
    if (item.dataset.timestamp === timestamp) return item;
  }
  return null;
}
