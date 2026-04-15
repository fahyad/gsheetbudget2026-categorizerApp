const CATEGORIES_KEY = 'budget_categories';
const KNOWN_TS_KEY = 'budget_known_timestamps';

export const store = {
  transactions: [],
  categories: [],
  knownTimestamps: new Set(),
  lastCategorized: null,

  loadCache() {
    try {
      const cats = localStorage.getItem(CATEGORIES_KEY);
      if (cats) this.categories = JSON.parse(cats);

      const known = localStorage.getItem(KNOWN_TS_KEY);
      if (known) this.knownTimestamps = new Set(JSON.parse(known));
    } catch (e) {
      // Corrupted cache — start fresh
    }
  },

  saveCache() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(this.categories));
    localStorage.setItem(KNOWN_TS_KEY, JSON.stringify(Array.from(this.knownTimestamps)));
  },

  setCategories(list) {
    this.categories = list;
    this.saveCache();
  },

  addTransactions(newTxns) {
    for (const txn of newTxns) {
      // Avoid duplicates in current list
      if (!this.transactions.some(t => t.timestamp === txn.timestamp)) {
        this.transactions.push(txn);
      }
      this.knownTimestamps.add(txn.timestamp);
    }
    // Sort oldest first (yyyy-mm-dd hh:mm:ss string sort works)
    this.transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    this.saveCache();
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

  setLastCategorized(data) {
    this.lastCategorized = data;
  },

  clearLastCategorized() {
    this.lastCategorized = null;
  }
};
