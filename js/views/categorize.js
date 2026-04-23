// Categorize view — the existing manual-categorize flow.
// Refresh and Sync are in-view controls (inline refresh icon in the period
// row; sticky sync bar above the tab-bar when syncQueue > 0). The shell
// header only holds Settings.

import * as api from '../api.js';
import { store } from '../store.js';
import { periodForTimestamp, currentPeriod } from '../periods.js';
import { showError, showSuccess } from '../ui.js';
import { updateCategorizeBadge } from '../router.js';
import { invalidateDashboardCache } from '../lib/budget.js';
import { ensureIndexReady, suggest, invalidateSuggestIndex } from '../lib/suggest.js';
import { attachSwipe } from '../lib/swipe.js';

const SUBTAB_KEY = 'budget_categorize_subtab';

const TEMPLATE = `
  <section id="app-section">
    <div id="subtab-bar" role="tablist">
      <button id="subtab-manual" class="subtab active" role="tab" aria-selected="true">Manual</button>
      <button id="subtab-auto"   class="subtab"        role="tab" aria-selected="false">Auto</button>
    </div>

    <div id="period-filter-bar">
      <label for="period-filter">Period:</label>
      <select id="period-filter" aria-label="Filter transactions by pay period"></select>
      <button id="refresh-inline" title="Refresh" aria-label="Refresh">⟳</button>
    </div>

    <div id="transaction-list"></div>

    <div id="period-empty-state" hidden>
      <p>No uncategorized transactions in this period.</p>
      <p class="hint">Pick a different period above, or choose "All".</p>
    </div>

    <div id="auto-empty-state" hidden>
      <p>No high-confidence suggestions for this period.</p>
      <p class="hint">Categorize a few manually, then check back — suggestions need history.</p>
    </div>

    <div id="category-picker" hidden>
      <div id="category-picker-header">
        <span id="selected-merchant"></span>
        <button id="cancel-pick">Cancel</button>
      </div>
      <div id="category-buttons"></div>
      <button id="add-cat-btn" class="add-cat-trigger">+ Add Category</button>
    </div>

    <div id="add-cat-modal" hidden>
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h3>Add Category</h3>
        <label for="main-cat-select">Main Category</label>
        <select id="main-cat-select">
          <option value="" disabled selected>Select...</option>
        </select>
        <div id="new-main-group" hidden>
          <label for="new-main-input">New Main Category</label>
          <input type="text" id="new-main-input" placeholder="e.g. Savings">
        </div>
        <label for="sub-cat-input">Sub Category</label>
        <input type="text" id="sub-cat-input" placeholder="e.g. Dining Out">
        <div class="modal-actions">
          <button id="cancel-add-cat" type="button">Cancel</button>
          <button id="save-add-cat" type="button">Save</button>
        </div>
      </div>
    </div>
  </section>

  <div id="loading" hidden>
    <div class="spinner"></div>
    <span>Loading...</span>
  </div>

  <div id="empty-state" hidden>
    <p>No pending transactions.</p>
    <button id="empty-refresh-btn">Refresh</button>
  </div>

  <div id="undo-bar" hidden>
    <span id="undo-text"></span>
    <button id="undo-btn">UNDO</button>
  </div>

  <div id="sync-bar" hidden>
    <span id="sync-bar-text"></span>
    <button id="sync-btn-inline">Sync</button>
  </div>
`;

// Module-level state (view is a singleton; re-mounting on re-navigation is OK
// because DOM refs are re-looked-up in mount()).
let selectedTimestamp = null;
let selectedPeriodFilter = null;
let refreshInFlight = false;
let syncInFlight = false;
let activeSubtab = 'manual'; // 'manual' | 'auto'
// Timestamps swiped-left this session. Intentionally in-memory only — a
// next-session re-examination gives the index another chance.
const rejectedThisSession = new Set();

// DOM refs — set in mount(). All live inside the view's own DOM subtree,
// so they're garbage-collected when the router clears root.innerHTML.
let appSection, transactionList, categoryPicker, categoryButtons,
    selectedMerchantEl, cancelPick, loadingEl, emptyState,
    emptyRefreshBtn, undoBar, undoText, undoBtn, addCatBtn, addCatModal,
    mainCatSelect, newMainGroup, newMainInput, subCatInput,
    cancelAddCat, saveAddCat, periodFilter, periodEmptyState,
    autoEmptyState, subtabManual, subtabAuto,
    refreshBtn, syncBar, syncBarText, syncBtn;

export default {
  async mount(root) {
    root.innerHTML = TEMPLATE;

    appSection = root.querySelector('#app-section');
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
    periodFilter = root.querySelector('#period-filter');
    periodEmptyState = root.querySelector('#period-empty-state');
    autoEmptyState = root.querySelector('#auto-empty-state');
    subtabManual = root.querySelector('#subtab-manual');
    subtabAuto = root.querySelector('#subtab-auto');
    refreshBtn = root.querySelector('#refresh-inline');
    syncBar = root.querySelector('#sync-bar');
    syncBarText = root.querySelector('#sync-bar-text');
    syncBtn = root.querySelector('#sync-btn-inline');

    refreshBtn.addEventListener('click', () => refresh());
    syncBtn.addEventListener('click', () => sync());
    emptyRefreshBtn.addEventListener('click', () => refresh());
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

    periodFilter.addEventListener('change', () => {
      selectedPeriodFilter = periodFilter.value === 'all' ? 'all' : Number(periodFilter.value);
      deselectTransaction();
      renderTransactions();
    });

    subtabManual.addEventListener('click', () => setSubtab('manual'));
    subtabAuto.addEventListener('click', () => setSubtab('auto'));

    // Restore last sub-tab (default 'manual'). Apply class state; the first
    // renderTransactions() call below uses activeSubtab to pick a branch.
    const saved = localStorage.getItem(SUBTAB_KEY);
    activeSubtab = saved === 'auto' ? 'auto' : 'manual';
    applySubtabState();

    renderCategories();
    renderSyncBar();
    renderUndo();
    renderTransactions();

    api.fetchCategories()
      .then(data => {
        store.setCategories(data.categories);
        renderCategories();
      })
      .catch(err => {
        console.error('Category fetch failed:', err);
        if (store.categories.length === 0) {
          showError('Could not load categories. Check connection and refresh.');
        }
      });

    // Warm the suggestion index in the background so Auto-tab toggles are
    // instant. Failures are silent — Auto tab will just show its empty state.
    ensureIndexReady()
      .then(() => { if (activeSubtab === 'auto') renderTransactions(); })
      .catch(err => console.error('Suggest index warm-up failed:', err));

    await refresh();
  },

  unmount() {
    selectedTimestamp = null;
  },
};

function setSubtab(which) {
  if (which !== 'manual' && which !== 'auto') return;
  if (activeSubtab === which) return;
  activeSubtab = which;
  localStorage.setItem(SUBTAB_KEY, which);
  applySubtabState();
  deselectTransaction();
  renderTransactions();
}

function applySubtabState() {
  subtabManual.classList.toggle('active', activeSubtab === 'manual');
  subtabAuto.classList.toggle('active', activeSubtab === 'auto');
  subtabManual.setAttribute('aria-selected', String(activeSubtab === 'manual'));
  subtabAuto.setAttribute('aria-selected', String(activeSubtab === 'auto'));
}

// ================================================================
// REFRESH
// ================================================================

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  refreshBtn.disabled = true;
  emptyRefreshBtn.disabled = true;

  showLoading(true);
  deselectTransaction();

  try {
    try {
      const catData = await api.fetchCategories();
      store.setCategories(catData.categories);
      renderCategories();
    } catch (e) {
      console.error('Category refresh failed:', e);
      if (store.categories.length === 0) {
        showError('Could not load categories. Check connection and refresh.');
      }
    }

    const data = await api.parseAndFetch();
    store.addTransactions(data.transactions);

    const queuedTimestamps = store.getSyncQueueTimestamps();
    store.transactions = store.transactions.filter(t => !queuedTimestamps.has(t.timestamp));

    renderTransactions();
  } catch (err) {
    showError('Failed to load transactions: ' + err.message);
  } finally {
    showLoading(false);
    refreshInFlight = false;
    refreshBtn.disabled = false;
    emptyRefreshBtn.disabled = false;
  }
}

// ================================================================
// CATEGORIZE / UNDO / SYNC
// ================================================================

function categorize(timestamp, category) {
  const removedTxn = store.removeTransaction(timestamp);
  if (!removedTxn) return;

  store.addToSyncQueue(removedTxn, category);
  store.setLastCategorized({ ...removedTxn, category });

  deselectTransaction();
  renderTransactions();
  renderUndo();
  renderSyncBar();
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
    const txn = {
      timestamp: restored.timestamp,
      date: restored.date,
      merchant: restored.merchant,
      amount: restored.amount
    };
    store.restoreTransaction(txn);
  }
  store.clearLastCategorized();

  renderTransactions();
  renderUndo();
  renderSyncBar();
}

async function sync() {
  if (store.syncQueue.length === 0) return;
  if (syncInFlight) return;
  syncInFlight = true;

  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing…';
  undoBtn.disabled = true;

  try {
    const data = await api.batchCategorize(store.syncQueue);
    const succeeded = data.results.filter(r => r.success).map(r => r.timestamp);
    const failed = data.results.filter(r => !r.success);

    store.clearSyncedItems(succeeded);

    if (succeeded.length > 0) {
      // Spent / Available changed in the sheet — dashboard cache is stale.
      invalidateDashboardCache();
      // New categorized rows in Transactions → suggestion index is stale too.
      invalidateSuggestIndex();
    }

    if (failed.length === 0) {
      showSuccess('✓ ' + succeeded.length + ' transactions synced');
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
    renderSyncBar();
  }
}

// ================================================================
// RENDERING
// ================================================================

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

  populatePeriodFilter();
  const visible = filterTxnsByPeriod(store.transactions);

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

  // Only rows with a high-confidence suggestion AND not swiped-away-this-session.
  const withSuggestions = [];
  for (const txn of visible) {
    if (rejectedThisSession.has(txn.timestamp)) continue;
    const s = suggest(txn.merchant);
    if (!s) continue;
    withSuggestions.push({ txn, suggestion: s });
  }

  if (withSuggestions.length === 0) {
    autoEmptyState.hidden = false;
    return;
  }
  autoEmptyState.hidden = true;

  for (const { txn, suggestion } of withSuggestions) {
    // Outer: static shell that holds swipe-action backgrounds (::before
    // accept, ::after skip). Inner: the visible content that translates.
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
    indicator.textContent = '↗';
    const catSpan = document.createElement('span');
    catSpan.className = 'auto-suggest-category';
    catSpan.textContent = suggestion.category;
    line2.appendChild(indicator);
    line2.appendChild(catSpan);

    inner.appendChild(line1);
    inner.appendChild(line2);
    row.appendChild(inner);

    // Tap opens the picker (same as Manual). Swipe intercepts via touch events.
    inner.addEventListener('click', () => selectTransaction(txn));

    attachSwipe(inner, {
      revealEl: row,
      onRight: () => {
        // Accept: apply suggested category and remove the row.
        categorize(txn.timestamp, suggestion.category);
      },
      onLeft: () => {
        // Reject for this session — txn stays in Manual tab.
        rejectedThisSession.add(txn.timestamp);
        row.remove();
        // If this was the last row, show the empty state.
        if (!transactionList.querySelector('.auto-row')) {
          autoEmptyState.hidden = false;
        }
      },
    });

    transactionList.appendChild(row);
  }
}

function populatePeriodFilter() {
  const byPeriod = new Map();
  for (const txn of store.transactions) {
    const p = periodForTimestamp(txn.timestamp);
    if (!p) continue;
    const existing = byPeriod.get(p.idx);
    if (existing) {
      existing.count++;
    } else {
      byPeriod.set(p.idx, { period: p, count: 1 });
    }
  }

  const totalCount = store.transactions.length;
  const cur = currentPeriod();
  const curIdx = cur ? cur.idx : null;

  const sortedIdxs = Array.from(byPeriod.keys()).sort((a, b) => b - a);

  periodFilter.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = `All (${totalCount})`;
  periodFilter.appendChild(allOpt);

  for (const idx of sortedIdxs) {
    const { period, count } = byPeriod.get(idx);
    const opt = document.createElement('option');
    opt.value = String(idx);
    const isCurrent = (idx === curIdx);
    opt.textContent = isCurrent
      ? `${period.label} · current (${count})`
      : `${period.label} (${count})`;
    periodFilter.appendChild(opt);
  }

  let target;
  if (selectedPeriodFilter === 'all') {
    target = 'all';
  } else if (typeof selectedPeriodFilter === 'number' && byPeriod.has(selectedPeriodFilter)) {
    target = String(selectedPeriodFilter);
  } else if (curIdx !== null && byPeriod.has(curIdx)) {
    target = String(curIdx);
    selectedPeriodFilter = curIdx;
  } else {
    target = 'all';
    selectedPeriodFilter = 'all';
  }
  periodFilter.value = target;
}

function filterTxnsByPeriod(txns) {
  if (selectedPeriodFilter === 'all' || selectedPeriodFilter === null) return txns;
  return txns.filter(t => {
    const p = periodForTimestamp(t.timestamp);
    return p && p.idx === selectedPeriodFilter;
  });
}

function renderCategories() {
  categoryButtons.innerHTML = '';

  if (store.categories.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-cats-msg';
    msg.textContent = 'No categories loaded. Tap Refresh.';
    categoryButtons.appendChild(msg);
    return;
  }

  const groups = {};
  for (const cat of store.categories) {
    if (!groups[cat.main]) groups[cat.main] = [];
    groups[cat.main].push(cat.sub);
  }

  for (const [main, subs] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'cat-group-label';
    label.textContent = main;
    label.style.gridColumn = '1 / -1';
    categoryButtons.appendChild(label);

    for (const sub of subs) {
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.textContent = sub;
      btn.addEventListener('click', () => {
        if (selectedTimestamp) {
          categorize(selectedTimestamp, sub);
        }
      });
      categoryButtons.appendChild(btn);
    }
  }
}

function renderUndo() {
  const visible = !!store.lastCategorized;
  if (visible) {
    undoText.textContent = `${store.lastCategorized.merchant} → ${store.lastCategorized.category}`;
    undoBar.hidden = false;
  } else {
    undoBar.hidden = true;
  }
  // Keep the sync bar clear of the undo bar when both are visible.
  if (syncBar) syncBar.classList.toggle('above-undo', visible);
}

function renderSyncBar() {
  const count = store.syncQueue.length;
  if (count === 0) {
    syncBar.hidden = true;
    syncBtn.disabled = true;
    syncBtn.textContent = 'Sync';
  } else {
    syncBar.hidden = false;
    syncBarText.textContent = count === 1 ? '1 to sync' : `${count} to sync`;
    syncBtn.disabled = syncInFlight;
    syncBtn.textContent = syncInFlight ? 'Syncing…' : 'Sync';
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

// ================================================================
// ADD CATEGORY
// ================================================================

function openAddCategoryModal() {
  mainCatSelect.innerHTML = '<option value="" disabled selected>Select...</option>';
  const mains = [...new Set(store.categories.map(c => c.main))];
  for (const main of mains) {
    const opt = document.createElement('option');
    opt.value = main;
    opt.textContent = main;
    mainCatSelect.appendChild(opt);
  }
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = 'New...';
  mainCatSelect.appendChild(newOpt);

  newMainGroup.hidden = true;
  newMainInput.value = '';
  subCatInput.value = '';
  addCatModal.hidden = false;
}

function closeAddCategoryModal() {
  addCatModal.hidden = true;
}

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

// ================================================================
// UI HELPERS
// ================================================================

function showLoading(show) {
  loadingEl.hidden = !show;
}
