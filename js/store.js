const CATEGORIES_KEY = 'budget_categories';
const SYNC_QUEUE_KEY = 'budget_sync_queue';

// A9: wrap localStorage.setItem so QuotaExceededError doesn't crash the app
// and we can attempt a recovery for the sync queue (which is the only state
// we actually care about persisting — categories will just re-fetch).
function safeSetItem_(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // QuotaExceededError detection across browsers (name/code/legacy)
    const isQuota =
      e && (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e.code === 22 || e.code === 1014
      );
    if (isQuota) {
      console.error('localStorage quota exceeded for key:', key, '- data not persisted this call');
      return false;
    }
    throw e;
  }
}

export const store = {
  transactions: [],
  categories: [],
  syncQueue: [],          // Persisted to localStorage — survives page close
  lastCategorized: null,
  persistFailed: false,   // A9: set true if syncQueue recovery fails — caller can warn user

  loadCache() {
    try {
      const cats = localStorage.getItem(CATEGORIES_KEY);
      if (cats) this.categories = JSON.parse(cats);
    } catch (e) {
      // Corrupted cache — start fresh
    }
    try {
      const q = localStorage.getItem(SYNC_QUEUE_KEY);
      if (q) this.syncQueue = JSON.parse(q);
    } catch (e) {
      this.syncQueue = [];
    }
    // Clear stale keys from older versions
    localStorage.removeItem('budget_known_timestamps');
  },

  saveCache() {
    // Categories cache is non-critical — silent best-effort. If it fails,
    // we'll just re-fetch on next refresh (network call); no data loss.
    safeSetItem_(CATEGORIES_KEY, JSON.stringify(this.categories));
  },

  saveSyncQueue() {
    // A9: syncQueue is critical (unsent categorizations live here). If
    // setItem fails, attempt one recovery: drop the categories cache and
    // retry. If still failing, set persistFailed so callers can warn.
    if (safeSetItem_(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue))) {
      this.persistFailed = false;
      return;
    }
    console.warn('Quota recovery: dropping cached categories to make room for syncQueue');
    localStorage.removeItem(CATEGORIES_KEY);
    if (safeSetItem_(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue))) {
      this.persistFailed = false;
      return;
    }
    console.error('localStorage recovery FAILED: syncQueue is in memory only. ' +
      'Reload will lose ' + this.syncQueue.length + ' unsent categorizations.');
    this.persistFailed = true;
  },

  setCategories(list) {
    this.categories = list;
    this.saveCache();
  },

  addTransactions(newTxns) {
    for (const txn of newTxns) {
      if (!this.transactions.some(t => t.timestamp === txn.timestamp)) {
        this.transactions.push(txn);
      }
    }
    this.transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  removeTransaction(timestamp) {
    const idx = this.transactions.findIndex(t => t.timestamp === timestamp);
    if (idx === -1) return null;
    return this.transactions.splice(idx, 1)[0];
  },

  restoreTransaction(txn) {
    this.transactions.push(txn);
    this.transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  // ── Sync Queue ──

  addToSyncQueue(txn, category) {
    // Replace if same timestamp already queued (user re-categorized via undo + re-pick)
    const existing = this.syncQueue.findIndex(q => q.timestamp === txn.timestamp);
    if (existing !== -1) this.syncQueue.splice(existing, 1);
    this.syncQueue.push({ ...txn, category });
    this.saveSyncQueue();
  },

  removeFromSyncQueue(timestamp) {
    const idx = this.syncQueue.findIndex(q => q.timestamp === timestamp);
    if (idx === -1) return null;
    const removed = this.syncQueue.splice(idx, 1)[0];
    this.saveSyncQueue();
    return removed;
  },

  clearSyncedItems(timestamps) {
    this.syncQueue = this.syncQueue.filter(q => !timestamps.includes(q.timestamp));
    this.saveSyncQueue();
  },

  clearSyncQueue() {
    this.syncQueue = [];
    localStorage.removeItem(SYNC_QUEUE_KEY);
  },

  getSyncQueueTimestamps() {
    return new Set(this.syncQueue.map(q => q.timestamp));
  },

  // ── Categories ──

  addCategory(cat) {
    this.categories.push(cat);
    this.saveCache();
  },

  removeCategory(sub) {
    this.categories = this.categories.filter(c => c.sub !== sub);
    this.saveCache();
  },

  // ── Undo ──

  setLastCategorized(data) {
    this.lastCategorized = data;
  },

  clearLastCategorized() {
    this.lastCategorized = null;
  }
};
