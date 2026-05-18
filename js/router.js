// Hash router with PERSISTENT VIEWS (v0.16.0).
//
// Each route lazy-imports a view module that exports a default object.
// The router keeps every view's DOM mounted after its first visit and
// toggles visibility on tab switches — no re-mount, no re-render, no
// re-fetch. Tab switches feel instant because there's no work to do.
//
// View interface:
//   - mount(root)            REQUIRED — runs once, on first visit
//   - onShow()               OPTIONAL — runs on every show after first mount
//                            (light re-renders from store; no API calls)
//   - onHide()               OPTIONAL — runs when the view is hidden
//                            (close modals, pause timers)
//   - unmount()              IGNORED  — kept for source compat; never called
//                            now that views persist for the app lifetime
//
// Why persistent views: every Apps Script roundtrip is a ~2.5s network
// tax (cold container + 302 + TLS) per the ClientMetrics data. Tab
// switches that destroyed the DOM forced a re-render and often a
// re-fetch — the worst possible UX. Now switches are essentially free.

import { store } from './store.js';
import { recordEvent } from './lib/metrics.js';

const routes = {
  '#/categorize': () => import('./views/categorize.js'),
  '#/dashboard':  () => import('./views/dashboard.js'),
  '#/setup':      () => import('./views/setup.js'),
};

const DEFAULT_ROUTE = '#/categorize';

// One entry per visited route, populated lazily on first mount.
//   { hash: { view, container, mountedAt } }
const mounted = {};

let rootEl = null;
let currentHash = null;

export function start(root) {
  rootEl = root;
  window.addEventListener('hashchange', mountFromHash);
  mountFromHash();
}

export function navigate(hash) {
  if (window.location.hash === hash) {
    // Already on that route — re-show the current view (calls onShow). This
    // preserves the old "tap Settings while on Setup → refresh" behavior
    // without doing a full destroy-and-recreate.
    mountFromHash();
    return;
  }
  window.location.hash = hash;
}

// Reflects store.syncQueue.length onto the Categorize tab label so the
// pending count is visible from any view. Called on every route change and
// by categorize.js after it mutates the queue.
export function updateCategorizeBadge() {
  const link = document.querySelector('#tab-bar a[href="#/categorize"]');
  if (!link) return;
  const count = store.syncQueue.length;
  link.textContent = count > 0 ? `Categorize (${count})` : 'Categorize';
}

async function mountFromHash() {
  let hash = window.location.hash;
  if (!routes[hash]) {
    hash = DEFAULT_ROUTE;
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  }

  const previousHash = currentHash;
  currentHash = hash;

  // Hide every container that isn't the active one. Call onHide on the
  // previously-visible view (if it has one).
  for (const h of Object.keys(mounted)) {
    if (h !== hash) {
      mounted[h].container.hidden = true;
      if (h === previousHash && typeof mounted[h].view.onHide === 'function') {
        try { mounted[h].view.onHide(); } catch (e) { console.error('onHide failed', e); }
      }
    }
  }

  if (mounted[hash]) {
    // Already mounted — show it + run onShow for any cheap state refresh.
    showExistingView(hash);
  } else {
    await mountNewView(hash);
  }

  updateTabBar(hash);
  updateCategorizeBadge();
}

function showExistingView(hash) {
  const t0 = performance.now();
  const entry = mounted[hash];
  entry.container.hidden = false;
  if (typeof entry.view.onShow === 'function') {
    try { entry.view.onShow(); } catch (e) { console.error('onShow failed', e); }
  }
  recordEvent('show:' + hash.replace('#/', ''), {
    clientTotalMs: Math.round(performance.now() - t0),
    note: 'cached',
  });
}

async function mountNewView(hash) {
  // First-time visit: lazy-import + create container + mount.
  const t0 = performance.now();
  let mod;
  try {
    mod = await routes[hash]();
  } catch (e) {
    console.error('view import failed', e);
    recordEvent('mount:' + hash.replace('#/', ''), {
      ok: false,
      errorMsg: 'import:' + (e?.message || String(e)),
    });
    rootEl.insertAdjacentHTML(
      'beforeend',
      '<div style="padding:24px;color:#c62828">Failed to load view: ' + (e && e.message || e) + '</div>'
    );
    return;
  }
  const tImported = performance.now();

  const container = document.createElement('div');
  container.dataset.viewRoot = hash.replace('#/', '');
  rootEl.appendChild(container);

  const view = mod.default;
  try {
    await view.mount(container);
    mounted[hash] = { view, container, mountedAt: Date.now() };
    const tMounted = performance.now();
    recordEvent('mount:' + hash.replace('#/', ''), {
      clientTotalMs: Math.round(tMounted - t0),
      note: 'import=' + Math.round(tImported - t0) + 'ms,mount=' + Math.round(tMounted - tImported) + 'ms,first=true',
    });
  } catch (e) {
    console.error('mount failed', e);
    recordEvent('mount:' + hash.replace('#/', ''), {
      ok: false,
      errorMsg: e?.message || String(e),
    });
    container.innerHTML = '<div style="padding:24px;color:#c62828">Failed to load view: ' + (e && e.message || e) + '</div>';
  }
}

function updateTabBar(hash) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}
