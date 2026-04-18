import * as config from './config.js';
import { APP_VERSION, APP_LAST_EDITED } from './config.js';
import * as api from './api.js';
import { store } from './store.js';

// DOM elements
const configSection = document.getElementById('config-section');
const appSection = document.getElementById('app-section');
const configForm = document.getElementById('config-form');
const configUrl = document.getElementById('config-url');
const configKey = document.getElementById('config-key');
const refreshBtn = document.getElementById('refresh-btn');
const syncBtn = document.getElementById('sync-btn');
const settingsBtn = document.getElementById('settings-btn');
const transactionList = document.getElementById('transaction-list');
const categoryPicker = document.getElementById('category-picker');
const categoryButtons = document.getElementById('category-buttons');
const selectedMerchantEl = document.getElementById('selected-merchant');
const cancelPick = document.getElementById('cancel-pick');
const loadingEl = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const emptyRefreshBtn = document.getElementById('empty-refresh-btn');
const undoBar = document.getElementById('undo-bar');
const undoText = document.getElementById('undo-text');
const undoBtn = document.getElementById('undo-btn');
const errorToast = document.getElementById('error-toast');
const addCatBtn = document.getElementById('add-cat-btn');
const addCatModal = document.getElementById('add-cat-modal');
const mainCatSelect = document.getElementById('main-cat-select');
const newMainGroup = document.getElementById('new-main-group');
const newMainInput = document.getElementById('new-main-input');
const subCatInput = document.getElementById('sub-cat-input');
const cancelAddCat = document.getElementById('cancel-add-cat');
const saveAddCat = document.getElementById('save-add-cat');
const pwaVersionDisplay = document.getElementById('pwa-version-display');
const asVersionDisplay = document.getElementById('as-version-display');
const updateStatusRow = document.getElementById('update-status-row');
const updateStatusDisplay = document.getElementById('update-status-display');

let selectedTimestamp = null;

// ================================================================
// INIT
// ================================================================

async function init() {
  store.loadCache(); // Also loads syncQueue from localStorage
  bindEvents();

  if (!config.isConfigured()) {
    showConfig();
    return;
  }

  showApp();
  renderCategories();
  renderSyncButton(); // Show pending count if any from previous session

  // Fetch fresh categories in background
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

  await refresh();
}

// ================================================================
// EVENTS
// ================================================================

function bindEvents() {
  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    config.save(configUrl.value, configKey.value);
    showApp();
    renderCategories();
    refresh();
  });

  refreshBtn.addEventListener('click', () => refresh());
  emptyRefreshBtn.addEventListener('click', () => refresh());
  syncBtn.addEventListener('click', () => sync());

  settingsBtn.addEventListener('click', () => {
    // Only show the URL if user has explicitly overridden it; otherwise leave
    // blank so the form uses the hardcoded default.
    const storedUrl = localStorage.getItem('budget_api_url') || '';
    configUrl.value = storedUrl;
    configKey.value = config.getApiKey() || '';
    showConfig();
  });

  cancelPick.addEventListener('click', () => {
    deselectTransaction();
  });

  undoBtn.addEventListener('click', () => undo());

  addCatBtn.addEventListener('click', () => openAddCategoryModal());
  cancelAddCat.addEventListener('click', () => closeAddCategoryModal());
  addCatModal.querySelector('.modal-overlay').addEventListener('click', () => closeAddCategoryModal());

  mainCatSelect.addEventListener('change', () => {
    newMainGroup.hidden = mainCatSelect.value !== '__new__';
    if (mainCatSelect.value === '__new__') newMainInput.focus();
  });

  saveAddCat.addEventListener('click', () => saveNewCategory());

  // Warn if closing with unsent categorizations
  window.addEventListener('beforeunload', (e) => {
    if (store.syncQueue.length > 0) {
      e.preventDefault();
    }
  });
}

// ================================================================
// REFRESH
// ================================================================

async function refresh() {
  showLoading(true);
  deselectTransaction();

  try {
    // Re-fetch categories too
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

    // Filter out transactions already in the sync queue
    const queuedTimestamps = store.getSyncQueueTimestamps();
    store.transactions = store.transactions.filter(t => !queuedTimestamps.has(t.timestamp));

    renderTransactions();
  } catch (err) {
    showError('Failed to load transactions: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ================================================================
// CATEGORIZE (local only — no API call)
// ================================================================

function categorize(timestamp, category) {
  const removedTxn = store.removeTransaction(timestamp);
  if (!removedTxn) return;

  store.addToSyncQueue(removedTxn, category);
  store.setLastCategorized({ ...removedTxn, category });

  deselectTransaction();
  renderTransactions();
  renderUndo();
  renderSyncButton();
}

// ================================================================
// UNDO (local only — no API call)
// ================================================================

function undo() {
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
  renderSyncButton();
}

// ================================================================
// SYNC (one batch API call)
// ================================================================

async function sync() {
  if (store.syncQueue.length === 0) return;

  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';

  try {
    const data = await api.batchCategorize(store.syncQueue);
    const succeeded = data.results.filter(r => r.success).map(r => r.timestamp);
    const failed = data.results.filter(r => !r.success);

    // Clear succeeded items from queue
    store.clearSyncedItems(succeeded);

    if (failed.length === 0) {
      showError('\u2713 ' + succeeded.length + ' transactions synced');
    } else {
      showError(failed.length + ' failed to sync. Tap Sync to retry.');
    }

    store.clearLastCategorized();
    renderUndo();
  } catch (err) {
    showError('Sync failed: ' + err.message + '. Data saved locally.');
  } finally {
    renderSyncButton();
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
    return;
  }

  appSection.hidden = false;
  emptyState.hidden = true;

  for (const txn of store.transactions) {
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

function renderCategories() {
  categoryButtons.innerHTML = '';

  if (store.categories.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-cats-msg';
    msg.textContent = 'No categories loaded. Tap Refresh.';
    categoryButtons.appendChild(msg);
    return;
  }

  // Group by main category
  const groups = {};
  for (const cat of store.categories) {
    if (!groups[cat.main]) groups[cat.main] = [];
    groups[cat.main].push(cat.sub);
  }

  for (const [main, subs] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'cat-group-label';
    label.textContent = main;
    // Group labels span full width
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
  if (store.lastCategorized) {
    undoText.textContent = `${store.lastCategorized.merchant} \u2192 ${store.lastCategorized.category}`;
    undoBar.hidden = false;
  } else {
    undoBar.hidden = true;
  }
}

function renderSyncButton() {
  const count = store.syncQueue.length;
  syncBtn.textContent = count > 0 ? `Sync (${count})` : 'Sync';
  syncBtn.disabled = count === 0;
  syncBtn.classList.toggle('has-pending', count > 0);
}

function selectTransaction(txn) {
  selectedTimestamp = txn.timestamp;
  selectedMerchantEl.textContent = txn.merchant + ' \u00b7 $' + Math.abs(txn.amount).toFixed(2);

  // Highlight selected
  document.querySelectorAll('.txn-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.timestamp === txn.timestamp);
  });

  renderCategories(); // Always re-render before showing (fixes empty categories bug)
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
  // Populate main category dropdown from existing categories
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
  const mainCategory = mainVal === '__new__' ? newMainInput.value.trim() : mainVal;
  const subCategory = subCatInput.value.trim();

  if (!mainCategory || !subCategory) {
    showError('Both main and sub category are required');
    return;
  }

  // Check local duplicate
  if (store.categories.some(c => c.sub.toLowerCase() === subCategory.toLowerCase())) {
    showError('Category "' + subCategory + '" already exists');
    return;
  }

  closeAddCategoryModal();

  // Optimistic: add to store + re-render
  const newCat = { main: mainCategory, sub: subCategory };
  store.addCategory(newCat);
  renderCategories();

  try {
    await api.addCategory(mainCategory, subCategory);
  } catch (err) {
    // Rollback
    store.removeCategory(subCategory);
    renderCategories();
    showError('Failed to add category: ' + err.message);
  }
}

// ================================================================
// VERSION INFO (Setup screen)
// ================================================================

async function populateVersionInfo() {
  // PWA version is local — always show immediately
  pwaVersionDisplay.textContent = `${APP_VERSION} (last edited ${APP_LAST_EDITED})`;

  // Apps Script version — need API call. Show loading first.
  asVersionDisplay.textContent = 'checking…';
  updateStatusRow.hidden = true;

  if (!config.isConfigured()) {
    asVersionDisplay.textContent = '(set API key first)';
    return;
  }

  try {
    const data = await api.fetchVersion();
    const v = data.appsScript;

    asVersionDisplay.textContent = `${v.version} (last edited ${v.lastEdited})`;

    // Show update status
    updateStatusRow.hidden = false;
    updateStatusDisplay.classList.remove('update-needed', 'up-to-date');

    if (v.error) {
      updateStatusDisplay.textContent = '⚠ could not verify (' + v.error + ')';
    } else if (v.updateNeeded) {
      updateStatusDisplay.textContent = `YES — latest is ${v.latestVersion}`;
      updateStatusDisplay.classList.add('update-needed');
    } else {
      updateStatusDisplay.textContent = `No (latest: ${v.latestVersion})`;
      updateStatusDisplay.classList.add('up-to-date');
    }
  } catch (err) {
    asVersionDisplay.textContent = '⚠ could not connect (check API key)';
    updateStatusRow.hidden = true;
  }
}

// ================================================================
// UI HELPERS
// ================================================================

function showConfig() {
  configSection.hidden = false;
  appSection.hidden = true;
  emptyState.hidden = true;
  // Refresh version info each time the setup screen opens
  populateVersionInfo();
}

function showApp() {
  configSection.hidden = true;
  appSection.hidden = false;
}

function showLoading(show) {
  loadingEl.hidden = !show;
}

let errorTimeout;
function showError(message) {
  errorToast.textContent = message;
  errorToast.hidden = false;
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => { errorToast.hidden = true; }, 5000);
}

// ================================================================
// START
// ================================================================

init();
