// Suggestion engine for the Auto sub-tab of the categorize view.
//
// Source of truth: historical categorized transactions on the Transactions
// tab (columns B merchant, C amount, D category). We fetch once, normalize
// each merchant string, count category frequency per normalized key, and
// return the top category if its share is >= threshold.
//
// Design notes:
//   - Local-only. No LLM, no new backend endpoint.
//   - Cache pattern mirrors lib/budget.js (localStorage + TTL + invalidate).
//   - Confidence = topCount / totalSeen; threshold defaults to 0.70.
//   - Normalizer is exported so it can be unit-tested and reused (e.g. a
//     future "see what I'd suggest for this merchant" debug panel).

import * as api from '../api.js';
import { recordEvent } from './metrics.js';

const INDEX_KEY = 'budget_suggest_index';
const FETCHED_AT_KEY = 'budget_suggest_fetched_at';
const TTL_MS = 60 * 60 * 1000; // 1 hour

// Match the dumpSheet range used by categorize + dashboard reads.
const TXN_RANGE = 'A2:H1000';

// Module-level cache populated by ensureIndexReady(). Keys are normalized
// merchant strings; values are { total: n, byCategory: { catName: count } }.
let indexCache = null;
let ensurePromise = null;

/**
 * Normalizes a raw bank transaction description into a stable key. The
 * goal is that variants of the same merchant — different card suffixes,
 * different transaction IDs, same-city noise — produce the same key so
 * they aggregate in the suggestion index.
 *
 * Applied in order:
 *   1. lowercase + trim
 *   2. strip payment-processor prefixes (SQ *, TST*, PAYPAL *, SP *)
 *   3. strip "*alphanumeric" tokens anywhere — card suffixes, txn IDs
 *   4. strip words that contain digits — "123abc", "5th", "98765"
 *   5. strip trailing 2-letter US state code
 *   6. collapse whitespace
 *
 * Exported for unit testing and reuse.
 */
export function normalizeMerchant(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  if (!s) return '';

  s = s.replace(/^(sq|tst|sp|paypal)\s*\*\s*/i, '');
  s = s.replace(/\s*\*[a-z0-9]+/gi, '');
  s = s.replace(/\s*#\w+/g, '');
  s = s.replace(/\S*\d+\S*/g, '');
  s = s.replace(/\s+[a-z]{2}$/i, '');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export function invalidateSuggestIndex() {
  indexCache = null;
  localStorage.removeItem(FETCHED_AT_KEY);
}

function readCache() {
  const at = parseInt(localStorage.getItem(FETCHED_AT_KEY) || '0', 10);
  if (!at) return null;
  if (Date.now() - at >= TTL_MS) return null;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeCache(idx) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    localStorage.setItem(FETCHED_AT_KEY, String(Date.now()));
  } catch (e) {
    // Quota exceeded — we can afford to lose the index cache. Next session
    // just pays the network cost again.
    console.warn('Suggest index cache write failed:', e);
  }
}

/**
 * Builds the normalized merchant → category-frequency index from raw rows
 * out of dumpSheet('Transactions', 'A2:H1000').
 *
 * Row layout (v11.0+): A date | B merchant | C amount | D category
 * We skip rows where category is blank (uncategorized, not training data).
 */
function buildIndex(rows) {
  const idx = {};
  for (const row of rows) {
    if (!row || row.length < 4) continue;
    const merchant = String(row[1] ?? '').trim();
    const category = String(row[3] ?? '').trim();
    if (!merchant || !category) continue;

    const key = normalizeMerchant(merchant);
    if (!key) continue;

    if (!idx[key]) idx[key] = { total: 0, byCategory: {} };
    idx[key].total++;
    idx[key].byCategory[category] = (idx[key].byCategory[category] || 0) + 1;
  }
  return idx;
}

/**
 * Ensures the in-memory + localStorage index is populated. Dedups concurrent
 * callers via ensurePromise so two simultaneous Auto-tab renders only fire
 * one network request.
 */
export async function ensureIndexReady() {
  if (indexCache) {
    recordEvent('cache-hit:suggest', { cached: true, note: 'memory' });
    return indexCache;
  }
  if (ensurePromise) {
    recordEvent('cache-hit:suggest', { cached: true, note: 'in-flight-dedup' });
    return ensurePromise;
  }

  const cached = readCache();
  if (cached) {
    indexCache = cached;
    recordEvent('cache-hit:suggest', { cached: true, note: 'localStorage' });
    return indexCache;
  }
  recordEvent('cache-miss:suggest', { cached: false });

  ensurePromise = (async () => {
    try {
      const data = await api.dumpSheet('Transactions', TXN_RANGE);
      const idx = buildIndex(data.values || []);
      indexCache = idx;
      writeCache(idx);
      return idx;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

/**
 * Returns { category, confidence, count } for the given raw merchant if the
 * top-matching category's share is at or above `threshold`. Returns null if
 * the index isn't ready, the merchant isn't in it, or confidence is below
 * threshold.
 *
 * Synchronous by design — callers await ensureIndexReady() once, then call
 * suggest() for many rows without further awaits.
 */
export function suggest(merchant, { threshold = 0.70 } = {}) {
  if (!indexCache) return null;
  const key = normalizeMerchant(merchant);
  if (!key) return null;

  const entry = indexCache[key];
  if (!entry || entry.total === 0) return null;

  let topCat = null;
  let topCount = 0;
  for (const [cat, count] of Object.entries(entry.byCategory)) {
    if (count > topCount) {
      topCount = count;
      topCat = cat;
    }
  }
  if (!topCat) return null;

  const confidence = topCount / entry.total;
  if (confidence < threshold) return null;

  return { category: topCat, confidence, count: topCount };
}
