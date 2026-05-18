// Period derivation for the PWA period filter (Phase 5).
//
// Mirrors the bi-weekly pay period structure defined in apps-script/Code.js
// (around line 1575). The Sheet's PayPeriods setup has 26 periods covering
// 2026 (and a few days on either side):
//   - Period 0: Dec 25, 2025 - Jan 20, 2026 (special long start, 27 days)
//   - Periods 1-25: bi-weekly (14 days each) anchored at Jan 21, 2026
//
// We compute periods on demand instead of enumerating all 26 — only one
// special case (period 0) plus a single arithmetic anchor for everything
// else. Labels match the Sheet's TEXT formula exactly:
//   - Same month: "Apr 15 - 28"
//   - Different months: "Apr 29 - May 12"
//
// Annual rollover (Jan 2027): bump PERIOD_REGULAR_ANCHOR + PERIOD_0
// constants. Same touch as bumping BUDGET_YEAR / PayPeriods array on the
// backend.

const PERIOD_LENGTH_DAYS = 14;
const PERIOD_LENGTH_MS = PERIOD_LENGTH_DAYS * 24 * 60 * 60 * 1000;
const NUM_PERIODS = 26;

// First day of period 1 (the start of the regular bi-weekly cadence).
// Period 0 (Dec 25 - Jan 20) is the special long lead-in.
const PERIOD_REGULAR_ANCHOR_MS = Date.UTC(2026, 0, 21); // Jan 21, 2026

const PERIOD_0 = {
  startMs: Date.UTC(2025, 11, 25), // Dec 25, 2025
  endMs:   Date.UTC(2026, 0, 20),  // Jan 20, 2026 (last day inclusive)
};

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Format matches the Sheet's `TEXT(A,"MMM D")&" - "&IF(MONTH(A)=MONTH(B),...)`.
function formatLabel(start, end) {
  const sM = start.getUTCMonth();
  const eM = end.getUTCMonth();
  const sD = start.getUTCDate();
  const eD = end.getUTCDate();
  if (sM === eM) {
    return `${SHORT_MONTHS[sM]} ${sD} - ${eD}`;
  }
  return `${SHORT_MONTHS[sM]} ${sD} - ${SHORT_MONTHS[eM]} ${eD}`;
}

function periodFromMs(ts) {
  if (ts < PERIOD_0.startMs) return null; // before our budget

  // Period 0 — special long lead-in.
  if (ts < PERIOD_REGULAR_ANCHOR_MS) {
    const start = new Date(PERIOD_0.startMs);
    const end = new Date(PERIOD_0.endMs);
    return { idx: 0, start, end, label: formatLabel(start, end) };
  }

  // Periods 1-25 — clean bi-weekly cycle from anchor.
  const offsetMs = ts - PERIOD_REGULAR_ANCHOR_MS;
  const periodFromAnchor = Math.floor(offsetMs / PERIOD_LENGTH_MS);
  const idx = 1 + periodFromAnchor;
  if (idx >= NUM_PERIODS) return null; // after our budget

  const startMs = PERIOD_REGULAR_ANCHOR_MS + periodFromAnchor * PERIOD_LENGTH_MS;
  const endMs = startMs + PERIOD_LENGTH_MS - 86400000; // last day inclusive
  const start = new Date(startMs);
  const end = new Date(endMs);
  return { idx, start, end, label: formatLabel(start, end) };
}

/**
 * Returns the period containing the given date, or null if outside 2026.
 * Accepts a Date object or anything `new Date(...)` can parse.
 */
export function periodForDate(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return periodFromMs(d.getTime());
}

/**
 * Returns the period containing today (the user's local "now").
 */
export function currentPeriod() {
  return periodFromMs(Date.now());
}

/**
 * Enumerates every period (0..25). Used by the dashboard dropdown so we
 * can list all 26 periods without a round-trip to the sheet.
 */
export function allPeriods() {
  const out = [];
  // Period 0 — special long lead-in.
  const p0Start = new Date(PERIOD_0.startMs);
  const p0End = new Date(PERIOD_0.endMs);
  out.push({ idx: 0, start: p0Start, end: p0End, label: formatLabel(p0Start, p0End) });
  for (let i = 1; i < NUM_PERIODS; i++) {
    const startMs = PERIOD_REGULAR_ANCHOR_MS + (i - 1) * PERIOD_LENGTH_MS;
    const endMs = startMs + PERIOD_LENGTH_MS - 86400000;
    const start = new Date(startMs);
    const end = new Date(endMs);
    out.push({ idx: i, start, end, label: formatLabel(start, end) });
  }
  return out;
}

/**
 * Returns the period containing a transaction, derived from its `timestamp`
 * field (format "YYYY-MM-DD HH:MM:SS#hex"). Uses the date portion only —
 * locale-independent, never ambiguous.
 *
 * Returns null if timestamp is missing/malformed or falls outside 2026.
 */
export function periodForTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string' || timestamp.length < 10) {
    return null;
  }
  const datePart = timestamp.slice(0, 10); // "YYYY-MM-DD"
  // Parse as UTC midnight so DST and TZ shifts don't push txns into adjacent
  // periods at boundaries. Sheet's PayPeriods are date-only too.
  const ms = Date.parse(datePart + 'T00:00:00Z');
  if (isNaN(ms)) return null;
  return periodFromMs(ms);
}

// ============================================================================
// Fixed Monthly Expenses — period matching (added 2026-05-09 for v0.17.2)
// ============================================================================
//
// Mirrors the sheet's `buildFixedExpensesFormula_` logic exactly so the
// PWA's fixed-expense breakdown total reconciles with Budget tab B4 (which
// renders via that formula). The sheet iterates m=1..13 with a fixed
// BUDGET_YEAR constant, computing DATE(BUDGET_YEAR, m, dueDay) and counting
// hits that fall within [period.start, period.end]. We do the same below.
//
// IMPORTANT: BUDGET_YEAR here MUST match `var BUDGET_YEAR = 2026;` in
// apps-script/Code.js (around line 40). Bump both together at annual
// rollover. Mismatched values would mean the PWA's breakdown total
// disagrees with the dashboard's Fixed cell — silently wrong.

export const BUDGET_YEAR = 2026;

/**
 * Returns the Date(s) when a fixed expense with the given dueDay falls
 * inside the given period. For our 14-day pay periods this returns 0 or 1
 * dates (rare 2 in degenerate cases). The result is sorted chronologically.
 *
 * Inputs:
 *   dueDay      — number 1..31 (the day-of-month from FixedExpenses_DueDay)
 *   periodStart — Date (UTC midnight, inclusive)
 *   periodEnd   — Date (UTC midnight, inclusive)
 *
 * Returns: Date[] (UTC dates), possibly empty.
 *
 * Edge cases handled:
 *   - dueDay 31 in months with <31 days: skipped (Date constructor would
 *     overflow Feb 31 → Mar 3; we detect and discard).
 *   - Period spans two months (typical for bi-weekly periods): both months
 *     checked.
 *   - Period spans two years (Dec → Jan): m=13 in JS rolls to next year's
 *     January, matching the sheet's behavior.
 */
export function dueDatesInPeriod(dueDay, periodStart, periodEnd) {
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return [];
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) return [];
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const dates = [];
  // m runs 0..12 (JS 0-indexed). Sheet's m=13 == JS's m=12 (next-year Jan
  // via constructor rollover). Total 13 iterations matches the sheet.
  for (let m = 0; m <= 12; m++) {
    const candidate = new Date(Date.UTC(BUDGET_YEAR, m, dueDay));
    // Overflow detection: if dueDay overflowed (Feb 31 → Mar 3), the
    // constructor's resulting day != dueDay. Skip those silently — they
    // mean "this date doesn't exist in this month."
    if (candidate.getUTCDate() !== dueDay) continue;
    const ts = candidate.getTime();
    if (ts >= startMs && ts <= endMs) dates.push(candidate);
  }
  return dates;
}
