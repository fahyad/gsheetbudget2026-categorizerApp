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
import { allPeriods, currentPeriod } from '../periods.js';
import { getDashboardData, formatCurrency } from '../lib/budget.js';

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

// DOM refs.
let periodBarHost, body;

export default {
  async mount(root) {
    root.innerHTML = TEMPLATE;
    periodBarHost = root.querySelector('#period-bar-host');
    body = root.querySelector('#dashboard-body');

    const cur = currentPeriod();
    if (cur && selectedPeriodIdx == null) selectedPeriodIdx = cur.idx;

    renderPeriodBar();
    await load({ forceRefresh: false });
  },

  unmount() {
    calendarOpen = false;
  },
};

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

  const caret = document.createElement('span');
  caret.className = 'period-caret';
  caret.textContent = '▾';

  toggle.appendChild(label);
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

  // 4-col summary
  const strip = document.createElement('div');
  strip.className = 'summary-strip';
  strip.appendChild(summaryCell('Income', summary.netIncome, false));
  strip.appendChild(summaryCell('Fixed', summary.fixedExpenses, true));
  strip.appendChild(summaryCell('Budgeted', summary.totalBudgeted, true));
  strip.appendChild(summaryCell('Ready', summary.readyToAssign, false, true));
  body.appendChild(strip);

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

function summaryCell(label, amount, showMinus, ready = false) {
  const cell = document.createElement('div');
  cell.className = 'summary-cell' + (ready ? ' ready' : '');

  const lab = document.createElement('div');
  lab.className = 'label';
  lab.textContent = label;

  const val = document.createElement('div');
  val.className = 'value' + (ready && amount < 0 ? ' negative' : '');
  const sign = showMinus && amount !== 0 ? '−' : '';
  val.textContent = sign + formatCurrency(Math.abs(amount));

  cell.appendChild(lab);
  cell.appendChild(val);
  return cell;
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
  spent.textContent = '$' + (c.spent || 0).toFixed(0) + ' / $' + (c.budgeted || 0).toFixed(0);

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
