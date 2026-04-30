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
import { invalidateDashboardCache } from '../lib/budget.js';
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
let selectedTimestamp = null;
let selectedPeriodIdx = null;  // number; default = current period
let refreshInFlight = false;
let syncInFlight = false;
let activeSubtab = 'manual';
let calendarOpen = false;
const rejectedThisSession = new Set();

// v0.15.4 perf state — shared across re-mounts for this module lifetime.
// These avoid the duplicate-categories call + needless refetch-on-remount
// pattern confirmed in ClientMetrics.
let categoriesPromise = null;    // mount's in-flight fetch; reused by first refresh()
let didInitialRefresh = false;   // true after first successful refresh this session
let lastRefreshMs = 0;           // clock of last successful refresh()
const REFRESH_THROTTLE_MS = 60 * 1000;  // silent re-mount refresh skip window

// DOM refs.
let appSection, periodBarHost, transactionList, categoryPicker, categoryButtons,
    selectedMerchantEl, cancelPick, loadingEl, emptyState,
    emptyRefreshBtn, undoBar, undoText, undoBtn, addCatBtn, addCatModal,
    mainCatSelect, newMainGroup, newMainInput, subCatInput,
    cancelAddCat, saveAddCat, periodEmptyState, autoEmptyState,
    subtabManual, subtabAuto;

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

    // Categories fetch — fire once per module lifetime. refresh() reuses
    // this same promise instead of firing a second identical call (the
    // duplicate that shows as `Duplicate=Y` in ClientMetrics).
    if (!categoriesPromise) {
      categoriesPromise = api.fetchCategories()
        .then(data => { store.setCategories(data.categories); renderCategories(); return data; })
        .catch(err => {
          console.error('Category fetch failed:', err);
          if (store.categories.length === 0) {
            showError('Could not load categories. Check connection and refresh.');
          }
          categoriesPromise = null;  // allow retry on next mount
          throw err;
        });
    }

    // Suggest index is only needed for the Auto sub-tab. Warm it eagerly
    // ONLY if that's the user's persisted default; Manual-only users skip
    // the 3 s `dumpSheet:Transactions` read entirely.
    if (activeSubtab === 'auto') {
      ensureIndexReady()
        .then(() => renderTransactions())
        .catch(err => console.error('Suggest index warm-up failed:', err));
    }

    await refresh();
  },

  // Persistent-view lifecycle (v0.16.0). The router keeps the DOM mounted
  // after first visit and calls onShow() each time the user returns to this
  // tab. renderAll() is cheap (pure DOM updates from store; no API calls)
  // so this catches any state changes that happened while the user was on
  // another tab — e.g. saving goal archived, sync removed an item.
  onShow() {
    renderAll();
  },

  // Called when navigating away to another tab. Close any transient UI so
  // the user returning later doesn't see a half-open modal or dangling
  // selection.
  onHide() {
    closeAddCategoryModal();
    deselectTransaction();
    calendarOpen = false;
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
  deselectTransaction();
  renderTransactions();

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
 * v0.15.4 changes (measured against v0.15.3 ClientMetrics):
 *   - Silent re-mounts within REFRESH_THROTTLE_MS = 60s are no-ops.
 *     Users cross-navigating to Dashboard + back no longer pay ~5s.
 *   - First refresh reuses the mount's in-flight categoriesPromise instead
 *     of firing a duplicate `categories` call (~3s saved per cold mount).
 *   - Server's txn list is installed via store.setTransactions() (replace),
 *     which correctly evicts stale-cached items that were categorized
 *     elsewhere. Previously addTransactions()+filter could leave phantoms.
 *
 * opts.force = true forces a full refetch (used by Parse pill + empty-state
 * Refresh button). This always re-fetches categories AND parseAndFetch,
 * ignoring throttle and cached categories promise.
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
    // Categories. Three cases:
    //   1. force: re-fetch from server (user may have added a category in
    //      the sheet between now and the last cold open).
    //   2. first refresh + mount's promise already in flight: await it.
    //   3. first refresh + no promise: fire a new one (recovery path if
    //      mount's fetch somehow failed AND retry was cleared).
    try {
      if (force) {
        const catData = await api.fetchCategories();
        store.setCategories(catData.categories);
        renderCategories();
      } else if (categoriesPromise) {
        await categoriesPromise;  // already updates store + renders
      }
    } catch (e) {
      console.error('Category fetch failed:', e);
      if (store.categories.length === 0) {
        showError('Could not load categories. Check connection and refresh.');
      }
      // Don't abort refresh — parseAndFetch can still succeed with no cats.
    }

    // Authoritative uncategorized list, with anything in the syncQueue
    // excluded (those are already queued for server write).
    //
    // v0.17.0: the Apps Script hourly trigger (v11.16) keeps the sheet
    // fresh, so default refresh is read-only (~200 ms server vs ~1-3 s
    // when also scanning Gmail). force=true (Parse pill, empty-state
    // Refresh) means the user is explicitly asking for "right now"
    // freshness, so we tell the server to also run the parser.
    const data = await api.parseAndFetch({ withParse: force });
    const queued = store.getSyncQueueTimestamps();
    store.setTransactions(data.transactions.filter(t => !queued.has(t.timestamp)));

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

  for (const txn of visible) {
    const div = document.createElement('div');
    div.className = 'txn-item';
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
  if (store.lastCategorized) {
    undoText.textContent = `${store.lastCategorized.merchant} → ${store.lastCategorized.category}`;
    undoBar.hidden = false;
  } else {
    undoBar.hidden = true;
  }
  updateCategorizeBadge();
}

function selectTransaction(txn) {
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

  try {
    await api.addCategory(mainCategory, subCategory);
  } catch (err) {
    store.removeCategory(subCategory);
    renderCategories();
    showError('Failed to add category: ' + err.message);
  }
}

function showLoading(show) { loadingEl.hidden = !show; }
