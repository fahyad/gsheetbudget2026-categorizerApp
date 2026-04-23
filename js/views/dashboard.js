// Dashboard view — per-period category breakdown + current-period
// Ready-to-Assign summary + saving-goal progress. Read-only.
//
// Data: lib/budget.js handles fetching, parsing, caching. This view just
// picks a period, renders, and re-renders on dropdown change.

import { showError } from '../ui.js';
import { allPeriods, currentPeriod } from '../periods.js';
import { getDashboardData, formatCurrency } from '../lib/budget.js';

const TEMPLATE = `
  <section id="dashboard-section">
    <div id="dashboard-header">
      <label for="period-select">Period:</label>
      <select id="period-select" aria-label="Select pay period"></select>
      <button id="dashboard-refresh" title="Refresh" aria-label="Refresh">⟳</button>
    </div>

    <div id="dashboard-body">
      <div id="dashboard-loading" class="dashboard-placeholder">
        <div class="spinner"></div>
        <span>Loading dashboard…</span>
      </div>
    </div>
  </section>
`;

let selectedPeriodLabel = null;
let cachedData = null;
let refreshInFlight = false;

let periodSelect, refreshBtn, body;

export default {
  async mount(root) {
    root.innerHTML = TEMPLATE;

    periodSelect = root.querySelector('#period-select');
    refreshBtn = root.querySelector('#dashboard-refresh');
    body = root.querySelector('#dashboard-body');

    populatePeriodDropdown();

    periodSelect.addEventListener('change', () => {
      selectedPeriodLabel = periodSelect.value;
      renderBody();
    });

    refreshBtn.addEventListener('click', () => load({ forceRefresh: true }));

    await load({ forceRefresh: false });
  },

  unmount() {
    // In-view DOM is wiped by the router; nothing shell-level to detach.
  },
};

function populatePeriodDropdown() {
  const periods = allPeriods();
  const cur = currentPeriod();
  const curLabel = cur ? cur.label : null;

  periodSelect.innerHTML = '';
  for (const p of periods) {
    const opt = document.createElement('option');
    opt.value = p.label;
    opt.textContent = (p.label === curLabel) ? `${p.label} · current` : p.label;
    periodSelect.appendChild(opt);
  }

  // Default to today's period if we haven't picked one this session.
  if (!selectedPeriodLabel && curLabel) {
    selectedPeriodLabel = curLabel;
  }
  if (selectedPeriodLabel) {
    periodSelect.value = selectedPeriodLabel;
  }
}

async function load({ forceRefresh }) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  refreshBtn.disabled = true;

  if (!cachedData) {
    body.innerHTML = '<div id="dashboard-loading" class="dashboard-placeholder"><div class="spinner"></div><span>Loading dashboard…</span></div>';
  }

  try {
    const { data, stale, error } = await getDashboardData({ forceRefresh });
    cachedData = data;
    if (stale) {
      showError('Showing cached dashboard — refresh failed: ' + (error?.message || 'offline'));
    }
    renderBody();
  } catch (err) {
    body.innerHTML = `
      <div class="dashboard-placeholder dashboard-error">
        <p>Could not load dashboard.</p>
        <p class="hint">${escapeHtml(err.message || String(err))}</p>
      </div>
    `;
  } finally {
    refreshInFlight = false;
    refreshBtn.disabled = false;
  }
}

function renderBody() {
  if (!cachedData) return;

  const period = selectedPeriodLabel;
  const data = cachedData;

  const summary = data.summaryCurrent;
  const summaryIsForSelected = data.sheetPeriod === period;
  const cats = data.categoriesByPeriod[period] || [];
  const goals = data.savingGoals || [];

  const catGroups = groupByMain(cats);
  const totalBudgetedForSelected = cats.reduce((s, c) => s + (c.budgeted || 0), 0);
  const totalSpentForSelected = cats.reduce((s, c) => s + (c.spent || 0), 0);

  body.innerHTML = `
    <div class="dashboard-card ready-card">
      <div class="ready-amount ${summary.readyToAssign < 0 ? 'negative' : ''}">${escapeHtml(formatCurrency(summary.readyToAssign))}</div>
      <div class="ready-label">Ready to Assign</div>
      ${summaryIsForSelected ? '' : `<div class="ready-hint">Summary reflects sheet period: <b>${escapeHtml(data.sheetPeriod || '—')}</b></div>`}
      ${data.progress ? `<div class="ready-progress">${escapeHtml(data.progress)}</div>` : ''}
    </div>

    <div class="dashboard-card summary-strip">
      <div class="summary-row"><span>Income</span><span>${escapeHtml(formatCurrency(summary.netIncome))}</span></div>
      <div class="summary-row"><span>Fixed</span><span class="neg">−${escapeHtml(formatCurrency(summary.fixedExpenses))}</span></div>
      <div class="summary-row"><span>Budgeted</span><span class="neg">−${escapeHtml(formatCurrency(summary.totalBudgeted))}</span></div>
    </div>

    <div class="dashboard-section-heading">
      <span>Categories</span>
      <span class="section-totals">${escapeHtml(formatCurrency(totalSpentForSelected))} / ${escapeHtml(formatCurrency(totalBudgetedForSelected))}</span>
    </div>

    <div id="category-cards">
      ${cats.length === 0
        ? '<div class="dashboard-placeholder"><p>No category data for this period.</p></div>'
        : Object.entries(catGroups).map(([main, subs]) => renderGroup(main, subs)).join('')}
    </div>

    <div class="dashboard-section-heading">
      <span>Saving Goals</span>
      <span class="section-totals">${goals.length} goal${goals.length === 1 ? '' : 's'}</span>
    </div>

    <div id="goal-cards">
      ${goals.length === 0
        ? '<div class="dashboard-placeholder"><p>No saving goals yet.</p></div>'
        : goals.map(renderGoal).join('')}
    </div>
  `;

  // Delegate expand/collapse on goal cards.
  body.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  });
}

function groupByMain(cats) {
  const out = {};
  for (const c of cats) {
    const key = c.main || '—';
    if (!out[key]) out[key] = [];
    out[key].push(c);
  }
  return out;
}

function renderGroup(main, subs) {
  return `
    <div class="cat-group">
      <div class="cat-group-header">${escapeHtml(main)}</div>
      ${subs.map(renderCategory).join('')}
    </div>
  `;
}

function renderCategory(c) {
  const budgeted = c.budgeted || 0;
  const spent = c.spent || 0;
  const pct = budgeted > 0 ? Math.min(spent / budgeted, 1) : 0;
  const overspent = budgeted > 0 && spent > budgeted;
  const near = budgeted > 0 && spent >= 0.8 * budgeted && !overspent;
  const barClass = overspent ? 'over' : (near ? 'near' : 'ok');
  const widthPct = budgeted > 0 ? (pct * 100).toFixed(1) : 0;
  const availClass = c.available < 0 ? 'neg' : '';

  return `
    <div class="cat-card">
      <div class="cat-card-row">
        <span class="cat-name">${escapeHtml(c.sub)}</span>
        <span class="cat-amounts">${escapeHtml(formatCurrency(spent))} / ${escapeHtml(formatCurrency(budgeted))}</span>
      </div>
      <div class="cat-bar"><div class="cat-bar-fill ${barClass}" style="width:${widthPct}%"></div></div>
      <div class="cat-card-row cat-avail">
        <span>Available</span>
        <span class="${availClass}">${escapeHtml(formatCurrency(c.available))}</span>
      </div>
    </div>
  `;
}

function renderGoal(g) {
  const target = g.target || 0;
  const saved = g.currentlySaved || 0;
  const pct = target > 0 ? Math.min(saved / target, 1) : 0;
  const widthPct = target > 0 ? (pct * 100).toFixed(1) : 0;
  const reached = target > 0 && saved >= target;

  return `
    <div class="goal-card">
      <div class="goal-head">
        <span class="goal-name">${escapeHtml(g.name)}${reached ? ' <span class="goal-reached">✓</span>' : ''}</span>
        <span class="goal-caret">▸</span>
      </div>
      <div class="goal-bar"><div class="goal-bar-fill" style="width:${widthPct}%"></div></div>
      <div class="goal-row">
        <span>${escapeHtml(formatCurrency(saved))} / ${escapeHtml(formatCurrency(target))}</span>
        <span class="goal-target-period">${escapeHtml(g.targetPeriod || '—')}</span>
      </div>
      <div class="goal-details">
        ${g.linkedCategory ? `<div class="goal-detail-row"><span>Linked category</span><span>${escapeHtml(g.linkedCategory)}</span></div>` : ''}
        <div class="goal-detail-row"><span>Allocated this period</span><span>${escapeHtml(formatCurrency(g.allocatedThisPeriod))}</span></div>
        <div class="goal-detail-row"><span>Periods remaining</span><span>${g.periodsRemaining || 0}</span></div>
        <div class="goal-detail-row"><span>Needed / future period</span><span>${escapeHtml(formatCurrency(g.neededFuturePeriods))}</span></div>
        ${g.notes ? `<div class="goal-detail-row goal-notes"><span>Notes</span><span>${escapeHtml(g.notes)}</span></div>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
