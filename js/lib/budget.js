// Dashboard data layer. One module owns fetching + parsing + caching for
// the Dashboard view (and, later, the auto-suggest swipe deck).
//
// Source of truth: two dumpSheet calls in parallel (Budget + Saving). The
// spreadsheet has already computed spent / available / saving-goal totals
// per period via SUMIFS — we just read, parse to numbers, and cache.
//
// Cache: localStorage with a 10-min TTL. Invalidated manually after a
// successful batchCategorize (spent totals shift). The view calls
// getDashboardData({ forceRefresh }) on mount; forceRefresh is the ⟳ btn.

import * as api from '../api.js';
import { recordEvent } from './metrics.js';

// v0.17.2: bumped cache key to v3 because the parsed dashboard data now
// includes a fixedMonthlyExpenses field (added for the FIXED accordion).
// Pre-v0.17.2 cached data lacks the field; force a fresh fetch on first
// load so the dropdown isn't empty until TTL expires.
//
// History: v0.17.1 bumped to v2 for the Budget tab Rolled Over column
// shift (v11.19). The bump pattern is: every parseDashboard shape change
// → cache key suffix bump → returning users get a clean re-fetch.
const CACHE_KEY = 'budget_dashboard_cache_v3';
const FETCHED_AT_KEY = 'budget_dashboard_fetched_at_v3';
const TTL_MS = 10 * 60 * 1000;

// Layouts match apps-script/Code.js (rebuildBudgetInternal_ / rebuildSavingInternal_ / Fixed Monthly Expenses tab).
// Budget extended to col G in v11.19 (Rolled Over inserted at F).
const BUDGET_RANGE = 'A1:G215';
const SAVING_RANGE = 'A1:I105';
// Fixed Monthly Expenses tab: col A = name, B = amount, C = due day. Up to 50 rows.
const FIXED_RANGE = 'A2:C50';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Parses "$1,234.56" / "($50.00)" / "" / "  " → number. Tolerant of the
// display-formatted strings dumpSheet returns for currency cells.
export function parseCurrency(raw) {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined || raw === '') return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Paren-style negatives: "($50.00)" -> "-50.00"
  const signed = s.startsWith('(') && s.endsWith(')') ? '-' + s.slice(1, -1) : s;
  const cleaned = signed.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(n) {
  if (!Number.isFinite(n)) return '—';
  return currencyFormatter.format(n);
}

export function invalidateDashboardCache() {
  localStorage.removeItem(FETCHED_AT_KEY);
}

/**
 * v0.19.0 — synchronous accessor for already-cached dashboard data
 * without firing a network fetch. Returns null if no cache exists.
 *
 * Used by Categorize's chip rail to render budgeted/spent info on
 * cold open. Chips render name-only when this returns null; an
 * async getDashboardData() call updates them when fetch resolves.
 */
export function peekDashboardCache() {
  const cached = readCache();
  if (!cached) return null;
  return { data: cached.data, fetchedAt: cached.fetchedAt };
}

function readCache() {
  const at = parseInt(localStorage.getItem(FETCHED_AT_KEY) || '0', 10);
  if (!at) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { data, fetchedAt: at };
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  const fetchedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(FETCHED_AT_KEY, String(fetchedAt));
  } catch (e) {
    // Quota exceeded — drop cache silently. getDashboardData will still
    // return the freshly-parsed data; next reload just pays the network
    // cost again. Acceptable.
    console.warn('Dashboard cache write failed (quota?):', e);
  }
  return fetchedAt;
}

/**
 * Core fetch + parse. Returns normalized dashboard data.
 *
 * v0.17.2: third parallel dumpSheet for "Fixed Monthly Expenses" — adds
 * ~100 ms server time but runs concurrent with the existing two so user-
 * perceived cost is ~0. Used by the FIXED accordion dropdown to render the
 * per-period breakdown that reconciles to Budget tab B4.
 */
async function fetchFresh() {
  const [budget, saving, fixed] = await Promise.all([
    api.dumpSheet('Budget', BUDGET_RANGE),
    api.dumpSheet('Saving', SAVING_RANGE),
    api.dumpSheet('Fixed Monthly Expenses', FIXED_RANGE),
  ]);
  return parseDashboard(budget.values, saving.values, fixed.values);
}

/**
 * Parses the raw 2D arrays from dumpSheet into the view's data shape.
 * Budget rows: 1-indexed in the sheet; 0-indexed in the array we get.
 *   - row 0 (sheet row 1): PERIOD: | <period dropdown value> | | | PROGRESS: | Day X of Y
 *   - row 2 (sheet row 3): labels — Net Income | Fixed Expenses | Total Budgeted | | | READY TO ASSIGN
 *   - row 3 (sheet row 4): values for the selected period (B1)
 *   - row 6 (sheet row 7): header — Period | Main | Category | Budgeted | Spent | Available
 *   - row 7+ (sheet row 8+): data — period-first ordering, 8 categories per period
 *
 * Saving rows:
 *   - row 2 (sheet row 3): Today | current period | #goals | total saved | needed future | target total
 *   - row 4 (sheet row 5): header row
 *   - row 5+ (sheet row 6+): goal rows (name, cat, target, targetPeriod, ...)
 */
function parseDashboard(budgetRows, savingRows, fixedRows) {
  const sheetPeriod = String(budgetRows[0]?.[1] ?? '').trim();
  const progress = String(budgetRows[0]?.[5] ?? '').trim();

  const r4 = budgetRows[3] || [];
  const summaryCurrent = {
    netIncome: parseCurrency(r4[0]),
    fixedExpenses: parseCurrency(r4[1]),
    totalBudgeted: parseCurrency(r4[2]),
    readyToAssign: parseCurrency(r4[5]),
  };

  const categoriesByPeriod = {};
  // Sheet rows 8+ (array index 7+) — stop at first blank period cell.
  for (let i = 7; i < budgetRows.length; i++) {
    const row = budgetRows[i];
    const period = String(row[0] ?? '').trim();
    const sub = String(row[2] ?? '').trim();
    if (!period || !sub) continue;
    // v0.17.1 (paired with Apps Script v11.19): Budget tab gained a
    // "Rolled Over" column at F, shifting Available from F → G. Read
    // both — rolledOver is exposed for future use (cat-sub label
    // enhancement to show "$X spent / $Y budget · ±$Z rolled").
    // Pre-v11.19 sheets won't have row[6] populated; parseCurrency on
    // undefined returns 0 — degrades to "no rollover info" instead of
    // breaking. See `docs/findings.md` "Budget Tab Schema Evolution".
    const entry = {
      main: String(row[1] ?? '').trim(),
      sub,
      budgeted: parseCurrency(row[3]),
      spent: parseCurrency(row[4]),
      rolledOver: parseCurrency(row[5]),
      available: parseCurrency(row[6]),
    };
    if (!categoriesByPeriod[period]) categoriesByPeriod[period] = [];
    categoriesByPeriod[period].push(entry);
  }

  const savingGoals = [];
  // Sheet rows 6+ (array index 5+) — name in col A; blank = empty slot.
  for (let i = 5; i < savingRows.length; i++) {
    const row = savingRows[i];
    const name = String(row[0] ?? '').trim();
    if (!name) continue;
    savingGoals.push({
      name,
      linkedCategory: String(row[1] ?? '').trim(),
      target: parseCurrency(row[2]),
      targetPeriod: String(row[3] ?? '').trim(),
      currentlySaved: parseCurrency(row[4]),
      allocatedThisPeriod: parseCurrency(row[5]),
      periodsRemaining: parseInt(row[6], 10) || 0,
      neededFuturePeriods: parseCurrency(row[7]),
      notes: String(row[8] ?? '').trim(),
    });
  }

  // v0.17.2: Fixed Monthly Expenses — array of { name, amount, dueDay }.
  // Skip blank rows (caller already passes A2:C50, so no header to skip).
  // Amount is parsed as currency (negative); dueDay as int 1..31.
  // Used by dashboard.js's FIXED accordion to render the per-period
  // breakdown via periods.js `dueDatesInPeriod`. Reconciles to
  // summaryCurrent.fixedExpenses (sheet's Budget!B4).
  const fixedMonthlyExpenses = [];
  for (let i = 0; i < (fixedRows || []).length; i++) {
    const row = fixedRows[i];
    const name = String(row[0] ?? '').trim();
    if (!name) continue; // blank row → end of data (or gap; either way skip)
    const amount = parseCurrency(row[1]);
    const dueDay = parseInt(row[2], 10);
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) continue;
    fixedMonthlyExpenses.push({ name, amount, dueDay });
  }

  return {
    sheetPeriod,
    progress,
    summaryCurrent,
    categoriesByPeriod,
    savingGoals,
    fixedMonthlyExpenses,
  };
}

/**
 * Main entrypoint for the Dashboard view.
 *
 * Returns { data, fetchedAt, fromCache }. Uses the 10-min TTL by default.
 * forceRefresh bypasses the TTL (manual ⟳ button).
 */
export async function getDashboardData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      recordEvent('cache-hit:dashboard', { cached: true, note: 'ageMs=' + (Date.now() - cached.fetchedAt) });
      return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true };
    }
  }
  recordEvent('cache-miss:dashboard', { cached: false, note: forceRefresh ? 'forceRefresh' : 'stale-or-empty' });
  try {
    const data = await fetchFresh();
    const fetchedAt = writeCache(data);
    return { data, fetchedAt, fromCache: false };
  } catch (err) {
    // Fetch failed — fall back to any cached copy, even if stale.
    const cached = readCache();
    if (cached) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, error: err };
    }
    throw err;
  }
}
