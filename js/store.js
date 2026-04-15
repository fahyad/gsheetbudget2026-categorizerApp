const CATEGORIES_KEY = 'budget_categories';

export const store = {
  transactions: [],
  categories: [],
  knownTimestamps: new Set(), // In-memory only — not persisted
  lastCategorized: null,

  loadCache() {
    try {
      const cats = localStorage.getItem(CATEGORIES_KEY);
      if (cats) this.categories = JSON.parse(cats);
    } catch (e) {
      // Corrupted cache — start fresh
    }
    // Clear any stale knownTimestamps from older versions
    localStorage.removeItem('budget_known_timestamps');
  },

  saveCache() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(this.categories));
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

  addCategory(cat) {
    this.categories.push(cat);
    this.saveCache();
  },

  removeCategory(sub) {
    this.categories = this.categories.filter(c => c.sub !== sub);
    this.saveCache();
  },

  setLastCategorized(data) {
    this.lastCategorized = data;
  },

  clearLastCategorized() {
    this.lastCategorized = null;
  }
};
