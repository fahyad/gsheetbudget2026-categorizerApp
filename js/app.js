import * as config from './config.js';
import * as api from './api.js';
import { store } from './store.js';

// DOM elements
const configSection = document.getElementById('config-section');
const appSection = document.getElementById('app-section');
const configForm = document.getElementById('config-form');
const configUrl = document.getElementById('config-url');
const configKey = document.getElementById('config-key');
const refreshBtn = document.getElementById('refresh-btn');
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

let selectedTimestamp = null;
let categorizeInFlight = false;

// ================================================================
// INIT
// ================================================================

async function init() {
  store.loadCache();
  bindEvents();

  if (!config.isConfigured()) {
    showConfig();
    return;
  }

  showApp();
  renderCategories();

  // Fetch fresh categories in background
  api.fetchCategories()
    .then(data => {
      store.setCategories(data.categories);
      renderCategories();
    })
    .catch(() => {}); // Silently use cached categories

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

  settingsBtn.addEventListener('click', () => {
    configUrl.value = config.getApiUrl() || '';
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
}

// ================================================================
// REFRESH
// ================================================================

async function refresh() {
  showLoading(true);
  deselectTransaction();

  try {
    const data = await api.parseAndFetch(store.knownTimestamps);
    store.addTransactions(data.transactions);
    renderTransactions();
  } catch (err) {
    showError('Failed to load transactions: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ================================================================
// CATEGORIZE (optimistic)
// ================================================================

async function categorize(timestamp, category) {
  if (categorizeInFlight) return;

  const removedTxn = store.removeTransaction(timestamp);
  if (!removedTxn) return;

  store.setLastCategorized({ ...removedTxn, category });
  deselectTransaction();
  renderTransactions();
  renderUndo();

  categorizeInFlight = true;
  undoBtn.disabled = true;

  try {
    await api.categorize(timestamp, category);
    store.knownTimestamps.add(timestamp);
    store.saveCache();
  } catch (err) {
    // Rollback
    store.restoreTransaction(removedTxn);
    store.clearLastCategorized();
    renderTransactions();
    renderUndo();
    showError('Failed to categorize: ' + err.message);
  } finally {
    categorizeInFlight = false;
    undoBtn.disabled = false;
  }
}

// ================================================================
// UNDO (optimistic)
// ================================================================

async function undo() {
  if (categorizeInFlight) return;

  const last = store.lastCategorized;
  if (!last) return;

  const { timestamp, date, merchant, amount, category } = last;
  const txn = { timestamp, date, merchant, amount };

  store.restoreTransaction(txn);
  store.clearLastCategorized();
  renderTransactions();
  renderUndo();

  try {
    await api.uncategorize(timestamp, merchant, amount, category);
    store.knownTimestamps.delete(timestamp);
    store.saveCache();
  } catch (err) {
    // Rollback the undo
    store.removeTransaction(timestamp);
    store.setLastCategorized(last);
    renderTransactions();
    renderUndo();
    showError('Failed to undo: ' + err.message);
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
    undoText.textContent = `${store.lastCategorized.merchant} → ${store.lastCategorized.category}`;
    undoBar.hidden = false;
  } else {
    undoBar.hidden = true;
  }
}

function selectTransaction(txn) {
  selectedTimestamp = txn.timestamp;
  selectedMerchantEl.textContent = txn.merchant + ' · $' + Math.abs(txn.amount).toFixed(2);

  // Highlight selected
  document.querySelectorAll('.txn-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.timestamp === txn.timestamp);
  });

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
// UI HELPERS
// ================================================================

function showConfig() {
  configSection.hidden = false;
  appSection.hidden = true;
  emptyState.hidden = true;
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
