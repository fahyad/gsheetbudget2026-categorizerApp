// Dashboard view — v0.15 redesign (Minimal Monochrome).
//
// Layout:
//   - Period bar at the top (calendar dropdown + "Day X of Y" in the right slot).
//   - 4-column summary: Income / Fixed / Budgeted / Ready.
//   - Categories grouped by Main (Living, Nice Things, Savings). Each group has
//     a collapsible header with a +/− toggle. Sub-rows show the sub name on the
//     left, "left/over" primary + "spent / budgeted" secondary on the right,
//     and a 1px progress bar. Colors: black (positive), amber (zero), red (over).
//   - Saving Goals section: one row per goal; tap to expand details.

import { showError } from '../ui.js';
import { allPeriods, currentPeriod, dueDatesInPeriod } from '../periods.js';
import { getDashboardData, formatCurrency, peekDashboardCache } from '../lib/budget.js';

// v0.17.2: persistence key for the summary-cell accordion state. Currently
// only Fixed is expandable; future cells (Income, Budgeted) can join.
const EXPANDED_SUMMARY_KEY = 'budget_dashboard_summary_expanded';
const SHORT_MONTHS_UC = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const TEMPLATE = `
  <section id="dashboard-section">
    <div id="period-bar-host"></div>

    <div id="dashboard-body">
      <div id="dashboard-loading" class="empty-state">
        <div class="spinner"></div>
        <span>Loading…</span>
      </div>
    </div>
  </section>
`;

// Module-level state.
let calendarOpen = false;
let selectedPeriodIdx = null;    // number | null (null = sheet-current)
let cachedData = null;
let refreshInFlight = false;
const expandedGroups = {};       // main name -> bool
let expandedGoalIdx = null;      // which goal card is expanded

// v0.17.2: which summary cells are accordion-expanded. Mirrors the
// expandedGroups pattern but persisted to localStorage (survives reloads).
// Default: nothing expanded (concise dashboard glance).
const expandedSummary = readExpandedSummary_();

// DOM refs.
let periodBarHost, body;

export default {
  async mount(root) {
    root.innerHTML = TEMPLATE;
    periodBarHost = root.querySelector('#period-bar-host');
    body = root.querySelector('#dashboard-body');

    const cur = currentPeriod();
    if (cur && selectedPeriodIdx == null) selectedPeriodIdx = cur.idx;

    // v0.19.7: cache-first paint. If localStorage has dashboard data
    // (even past the 10-min TTL), paint it immediately and refresh in
    // the background. Saves the ~5-7s spinner on cold open with a
    // stale cache — same pattern as store.transactions got in v0.15.4.
    // getDashboardData inside load() returns cached data if still within
    // TTL, falls through to network fetch otherwise; either way the
    // pre-painted screen stays visible until fresh data arrives.
    const peeked = peekDashboardCache();
    if (peeked) {
      cachedData = peeked.data;
      cachedData._fetchedAt = peeked.fetchedAt;
      renderPeriodBar();
      renderBody();
      load({ forceRefresh: false }).catch(err => console.error('Dashboard refresh failed', err));
    } else {
      renderPeriodBar();
      await load({ forceRefresh: false });
    }
  },

  // Persistent-view lifecycle (v0.16.0). The router keeps the Dashboard's
  // DOM mounted after first visit and calls onShow() each time the user
  // returns. We re-render from cachedData immediately (instant), then —
  // only if the cache is older than the TTL — kick off a background
  // refresh so the user eventually sees fresh data without waiting.
  onShow() {
    if (cachedData) {
      renderPeriodBar();
      renderBody();
    }
    if (isCacheStale_()) {
      load({ forceRefresh: false }).catch(err => console.error('Dashboard background refresh failed', err));
    }
  },

  // Hide cleanup — close any open dropdowns so the user returning later
  // doesn't see a half-open calendar.
  onHide() {
    calendarOpen = false;
  },

  // Kept for source compatibility — no longer called by the router (views
  // persist for the app lifetime).
  unmount() {
    calendarOpen = false;
  },
};

// Cache TTL — re-fetch dashboard data in the background if cachedData is
// older than this. 60s is the sweet spot: tab-switch perceived speed wins
// for normal use (you don't usually wait 60s between tab switches), but
// background refresh kicks in when the user returns from a long stay
// elsewhere. v0.16.0.
const CACHE_TTL_MS = 60 * 1000;

function isCacheStale_() {
  if (!cachedData) return true;
  // getDashboardData returns { data, fetchedAt } — fetchedAt may be on
  // the wrapper or directly on data depending on the lib's shape. Tolerate
  // either; treat missing timestamp as fresh enough (no spurious refresh).
  const t = cachedData.fetchedAt || cachedData._fetchedAt || null;
  if (!t) return false;
  return (Date.now() - t) > CACHE_TTL_MS;
}

// ======================================================================
// PERIOD BAR (identical shape to categorize.js; right slot shows progress)
// ======================================================================

function pickPeriod() {
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
  // Same block also in categorize.js renderPeriodBar — keep the two in sync.
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
  if (cachedData?.progress) {
    const prog = document.createElement('div');
    prog.className = 'period-progress';
    prog.textContent = cachedData.progress;
    right.appendChild(prog);
  }

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
  renderPeriodBar();
  renderBody();
}

function renderCalendar(period) {
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  const todayIso = new Date().toISOString().slice(0, 10);
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();
  const ONE_DAY = 86400000;

  for (let ms = startMs; ms <= endMs; ms += ONE_DAY) {
    const d = new Date(ms);
    const iso = d.toISOString().slice(0, 10);
    const isToday = iso === todayIso;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell' + (isToday ? ' today' : '');
    const num = document.createElement('div');
    num.style.lineHeight = '1';
    num.textContent = String(d.getUTCDate());
    cell.appendChild(num);
    grid.appendChild(cell);
  }

  return grid;
}

// ======================================================================
// DATA LOAD
// ======================================================================

async function load({ forceRefresh }) {
  if (refreshInFlight) return;
  refreshInFlight = true;

  if (!cachedData) {
    body.innerHTML = '<div class="empty-state"><div class="spinner"></div><span>Loading…</span></div>';
  }

  try {
    const { data, stale, error } = await getDashboardData({ forceRefresh });
    cachedData = data;
    if (stale) {
      showError('Showing cached dashboard — refresh failed: ' + (error?.message || 'offline'));
    }
    renderPeriodBar();
    renderBody();
  } catch (err) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="glyph">—</div>
        <p>Could not load dashboard.</p>
        <p class="hint">${escapeHtml(err.message || String(err))}</p>
      </div>
    `;
  } finally {
    refreshInFlight = false;
  }
}

// ======================================================================
// BODY RENDER
// ======================================================================

function renderBody() {
  if (!cachedData) return;

  const data = cachedData;
  const selected = pickPeriod();
  const summary = data.summaryCurrent;
  const allCats = (selected && data.categoriesByPeriod[selected.label]) || [];
  const goals = data.savingGoals || [];

  // Hide categories that belong to a saving goal — they render below in
  // the Goals section with richer info (target, periods remaining, needed
  // per period). The match is on sub-category name, which is what the
  // Saving tab's goal.linkedCategory field stores; "Savings" main is the
  // common case but we don't hardcode it — any goal-linked category is
  // suppressed from the Budget section.
  const linkedSubs = new Set(goals.map(g => g.linkedCategory).filter(Boolean));
  const cats = allCats.filter(c => !linkedSubs.has(c.sub));

  body.innerHTML = '';

  // 4-col summary. Fixed cell is an accordion button (v0.17.2).
  const strip = document.createElement('div');
  strip.className = 'summary-strip';
  strip.appendChild(summaryCell('Income', summary.netIncome, false));
  strip.appendChild(summaryCell('Fixed', summary.fixedExpenses, true, false, {
    expandable: true,
    panelId: 'fixed-panel',
    expandedKey: 'fixed',
    onToggle: toggleFixedExpand,
  }));
  strip.appendChild(summaryCell('Budgeted', summary.totalBudgeted, true));
  strip.appendChild(summaryCell('Ready', summary.readyToAssign, false, true));
  body.appendChild(strip);

  // FIXED accordion panel (always present in DOM; `hidden` toggles
  // visibility per WAI-ARIA APG accordion pattern). renderFixedPanel
  // populates content from cachedData.fixedMonthlyExpenses + the period.
  const fixedPanel = renderFixedPanel(selected);
  body.appendChild(fixedPanel);

  // Category groups
  const groups = {};
  const order = [];
  for (const c of cats) {
    const key = c.main || '—';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(c);
  }
  for (const main of order) {
    if (!(main in expandedGroups)) expandedGroups[main] = true;
    body.appendChild(renderGroup(main, groups[main]));
  }

  if (cats.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="glyph">—</div><p>No category data for this period.</p>';
    body.appendChild(empty);
  }

  // Goals
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Saving Goals';
  body.appendChild(eyebrow);

  if (goals.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>No saving goals yet.</p>';
    body.appendChild(empty);
  } else {
    goals.forEach((g, i) => body.appendChild(renderGoal(g, i)));
  }

  const tail = document.createElement('div');
  tail.style.height = '20px';
  body.appendChild(tail);
}

function summaryCell(label, amount, showMinus, ready = false, accordion = null) {
  // v0.17.2: when `accordion` is provided, the cell becomes a real
  // <button> with WAI-ARIA accordion attributes (aria-expanded,
  // aria-controls). Whole cell is the tap target (touch-action:
  // manipulation in CSS to kill 300ms double-tap delay). Default
  // <button> chrome (border, bg, font) is overridden in CSS so the
  // visual still reads as the original .summary-cell layout.
  //
  // Pattern from WAI-ARIA APG accordion (https://www.w3.org/WAI/ARIA/apg/patterns/accordion/):
  //   button + aria-expanded + aria-controls → panel + role="region" + aria-labelledby.
  // Skipped <details>/<summary> per known iOS Safari bugs in grid contexts.
  const cell = document.createElement(accordion ? 'button' : 'div');
  cell.className = 'summary-cell' + (ready ? ' ready' : '');
  if (accordion) {
    cell.classList.add('summary-cell-toggle');
    cell.type = 'button';
    cell.id = label.toLowerCase() + '-button';
    cell.setAttribute('aria-controls', accordion.panelId);
    cell.setAttribute('aria-expanded', String(!!expandedSummary[accordion.expandedKey]));
    cell.addEventListener('click', accordion.onToggle);
  }

  const lab = document.createElement('div');
  lab.className = 'label';
  lab.textContent = label;

  if (accordion) {
    // Append chevron inside the label so it sits next to "FIXED" rather
    // than next to the dollar value. ▸ collapsed / ▾ expanded.
    const chev = document.createElement('span');
    chev.className = 'summary-chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = expandedSummary[accordion.expandedKey] ? ' ▾' : ' ▸';
    lab.appendChild(chev);
  }

  const val = document.createElement('div');
  val.className = 'value' + (ready && amount < 0 ? ' negative' : '');
  const sign = showMinus && amount !== 0 ? '−' : '';
  val.textContent = sign + formatCurrency(Math.abs(amount));

  cell.appendChild(lab);
  cell.appendChild(val);
  return cell;
}

// ============================================================================
// FIXED accordion panel (v0.17.2)
// ============================================================================
//
// Tap the FIXED summary cell → expandedSummary.fixed flips → re-render.
// Persisted to localStorage so the user's preference survives reloads.
// Reconciliation: client total (sum of items rendered here) should equal
// summary.fixedExpenses (sheet's Budget!B4); we surface a small ⚠ if not.

function toggleFixedExpand() {
  expandedSummary.fixed = !expandedSummary.fixed;
  writeExpandedSummary_();
  renderBody();
}

function renderFixedPanel(period) {
  const expanded = !!expandedSummary.fixed;
  const panel = document.createElement('div');
  panel.id = 'fixed-panel';
  panel.className = 'fixed-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'fixed-button');
  panel.hidden = !expanded;

  if (!expanded) return panel;

  const items = (cachedData?.fixedMonthlyExpenses || [])
    .map(e => ({ ...e, dueDates: dueDatesInPeriod(e.dueDay, period.start, period.end) }));

  const dueRows = items
    .filter(e => e.dueDates.length > 0)
    .flatMap(e => e.dueDates.map(date => ({ name: e.name, amount: e.amount, date })))
    .sort((a, b) => a.date - b.date);

  const clientTotal = dueRows.reduce((s, r) => s + r.amount, 0);
  const sheetTotal = (cachedData?.summaryCurrent?.fixedExpenses) || 0;
  const reconcileMismatch = Math.abs(clientTotal - sheetTotal) > 0.01;

  // v0.19.6: removed the .fixed-panel-head element ("FIXED EXPENSES ·
  // <period> · <total>"). The total was already visible in the FIXED
  // summary cell above; the period was already in the period bar.
  // Header was visual noise; rows alone are cleaner.

  // Reconciliation warning (rare; means dueDatesInPeriod disagrees with
  // sheet's buildFixedExpensesFormula_ — usually a BUDGET_YEAR mismatch).
  if (reconcileMismatch) {
    const warn = document.createElement('div');
    warn.className = 'fixed-panel-warn';
    warn.textContent = `⚠ List total $${Math.abs(clientTotal).toFixed(2)} doesn't match dashboard's $${Math.abs(sheetTotal).toFixed(2)}. periods.js BUDGET_YEAR may be out of sync with apps-script/Code.js.`;
    panel.appendChild(warn);
  }

  if (dueRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fixed-panel-empty';
    empty.textContent = 'No fixed expenses due this period.';
    panel.appendChild(empty);
    return panel;
  }

  for (const r of dueRows) {
    const row = document.createElement('div');
    row.className = 'fixed-row';

    const dateEl = document.createElement('span');
    dateEl.className = 'fixed-row-date';
    const m = SHORT_MONTHS_UC[r.date.getUTCMonth()];
    const d = r.date.getUTCDate();
    dateEl.textContent = `${m} ${d}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'fixed-row-name';
    nameEl.textContent = r.name;

    const amtEl = document.createElement('span');
    amtEl.className = 'fixed-row-amount' + (r.amount < 0 ? ' negative' : '');
    const sign = r.amount < 0 ? '−' : '';
    amtEl.textContent = sign + formatCurrency(Math.abs(r.amount));

    row.appendChild(dateEl);
    row.appendChild(nameEl);
    row.appendChild(amtEl);
    panel.appendChild(row);
  }

  return panel;
}

// ----- expandedSummary persistence helpers -----

function readExpandedSummary_() {
  try {
    const raw = localStorage.getItem(EXPANDED_SUMMARY_KEY);
    if (!raw) return { fixed: false };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { fixed: !!parsed.fixed };
    }
  } catch (e) { /* QuotaExceededError, SecurityError (private mode), JSON parse — ignore */ }
  return { fixed: false };
}

function writeExpandedSummary_() {
  try {
    localStorage.setItem(EXPANDED_SUMMARY_KEY, JSON.stringify(expandedSummary));
  } catch (e) {
    console.warn('expandedSummary persist failed (quota or private mode):', e);
  }
}

function renderGroup(main, subs) {
  const wrap = document.createElement('div');
  wrap.className = 'cat-group';

  const header = document.createElement('div');
  header.className = 'cat-group-header';
  header.addEventListener('click', () => {
    expandedGroups[main] = !expandedGroups[main];
    renderBody();
  });

  const leftEl = document.createElement('div');
  leftEl.className = 'left';
  const glyph = document.createElement('span');
  glyph.className = 'toggle-glyph';
  glyph.textContent = expandedGroups[main] ? '−' : '+';
  const name = document.createElement('div');
  name.className = 'group-name';
  name.textContent = main;
  leftEl.appendChild(glyph);
  leftEl.appendChild(name);

  const countEl = document.createElement('div');
  countEl.className = 'group-count';
  countEl.textContent = `${subs.length} ${subs.length === 1 ? 'category' : 'categories'}`;

  header.appendChild(leftEl);
  header.appendChild(countEl);
  wrap.appendChild(header);

  if (expandedGroups[main]) {
    for (const c of subs) wrap.appendChild(renderSub(c));
  }
  return wrap;
}

function renderSub(c) {
  const wrap = document.createElement('div');
  wrap.className = 'cat-sub';

  const row = document.createElement('div');
  row.className = 'cat-sub-row';

  const name = document.createElement('div');
  name.className = 'cat-sub-name';
  name.textContent = c.sub;

  const amounts = document.createElement('div');
  amounts.className = 'cat-sub-amounts';

  const over = c.available < 0;
  const zero = Math.abs(c.available) < 0.005;
  const state = over ? 'over' : zero ? 'zero' : 'pos';

  const avail = document.createElement('div');
  avail.className = 'cat-sub-avail ' + state;
  const sign = over ? '−' : '';
  avail.textContent = sign + formatCurrency(Math.abs(c.available)) + ' ' + (over ? 'over' : 'left');

  const spent = document.createElement('div');
  spent.className = 'cat-sub-spent';
  // v0.19.2: labeled "$X spent / $Y budget" instead of bare "$X / $Y" —
  // the bare form was too cryptic when the available amount above it is
  // negative or zero (e.g. seeing "$0.00 LEFT" with "$0 / $98" beneath
  // didn't make obvious why available was zero — answer is overspend
  // carried over from a prior period). Labels make the relationship
  // explicit without needing to remember which number is which.
  spent.textContent = '$' + (c.spent || 0).toFixed(0) + ' spent / $' + (c.budgeted || 0).toFixed(0) + ' budget';

  amounts.appendChild(avail);
  amounts.appendChild(spent);

  row.appendChild(name);
  row.appendChild(amounts);
  wrap.appendChild(row);

  const bar = document.createElement('div');
  bar.className = 'cat-bar';
  const fill = document.createElement('div');
  fill.className = 'cat-bar-fill' + (over ? ' over' : zero ? ' zero' : '');
  const budget = c.budgeted || 0;
  const pct = budget > 0 ? Math.min((c.spent || 0) / budget, 1) : 0;
  fill.style.width = (pct * 100).toFixed(1) + '%';
  bar.appendChild(fill);
  wrap.appendChild(bar);

  return wrap;
}

function renderGoal(g, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'goal-card' + (expandedGoalIdx === idx ? ' expanded' : '');
  wrap.addEventListener('click', () => {
    expandedGoalIdx = expandedGoalIdx === idx ? null : idx;
    renderBody();
  });

  const head = document.createElement('div');
  head.className = 'goal-head';

  const name = document.createElement('div');
  name.className = 'goal-name';
  name.textContent = g.name;
  const target = g.target || 0;
  const saved = g.currentlySaved || 0;
  if (target > 0 && saved >= target) {
    const mark = document.createElement('span');
    mark.className = 'done-mark';
    mark.textContent = '✓';
    name.appendChild(mark);
  }

  const amount = document.createElement('div');
  amount.className = 'goal-amount';
  const savedEl = document.createElement('span');
  savedEl.textContent = '$' + saved.toFixed(0) + ' ';
  const muted = document.createElement('span');
  muted.className = 'muted';
  muted.textContent = '/ $' + target.toFixed(0);
  amount.appendChild(savedEl);
  amount.appendChild(muted);

  head.appendChild(name);
  head.appendChild(amount);
  wrap.appendChild(head);

  const bar = document.createElement('div');
  bar.className = 'goal-bar';
  const fill = document.createElement('div');
  fill.className = 'goal-bar-fill';
  fill.style.width = (target > 0 ? Math.min(saved / target, 1) * 100 : 0).toFixed(1) + '%';
  bar.appendChild(fill);
  wrap.appendChild(bar);

  const meta = document.createElement('div');
  meta.className = 'goal-meta';
  const left = document.createElement('span');
  left.textContent = g.targetPeriod || '—';
  const right = document.createElement('span');
  right.textContent = '$' + (g.neededFuturePeriods || 0).toFixed(0) + '/period';
  meta.appendChild(left);
  meta.appendChild(right);
  wrap.appendChild(meta);

  const details = document.createElement('div');
  details.className = 'goal-details';
  if (g.linkedCategory) {
    details.appendChild(detailRow('Linked category', g.linkedCategory));
  }
  details.appendChild(detailRow('Allocated this period', formatCurrency(g.allocatedThisPeriod || 0)));
  details.appendChild(detailRow('Periods remaining', String(g.periodsRemaining || 0)));
  details.appendChild(detailRow('Needed / future period', formatCurrency(g.neededFuturePeriods || 0)));
  if (g.notes) {
    const r = detailRow('Notes', g.notes);
    r.classList.add('goal-notes');
    details.appendChild(r);
  }
  wrap.appendChild(details);

  return wrap;
}

function detailRow(label, value) {
  const r = document.createElement('div');
  r.className = 'goal-detail-row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.textContent = value;
  r.appendChild(l);
  r.appendChild(v);
  return r;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
