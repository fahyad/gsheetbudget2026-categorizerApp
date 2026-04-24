// Minimal hash router. Each route is a lazy import of a view module that
// exports { mount(root), unmount() }. Navigation is via anchor hrefs
// (#/foo) — zero click handlers, browser back/forward just works.
//
// The shell passes a root element; the router clears it and hands it to
// the active view. Views own their DOM subtree. The router also owns
// tab-bar chrome (active class + pending-count badge on Categorize) and
// records per-view mount timings for the diagnostics log.

import { store } from './store.js';
import { noteMount, recordEvent } from './lib/metrics.js';

const routes = {
  '#/categorize': () => import('./views/categorize.js'),
  '#/dashboard':  () => import('./views/dashboard.js'),
  '#/setup':      () => import('./views/setup.js'),
};

const DEFAULT_ROUTE = '#/categorize';

let currentView = null;
let rootEl = null;

export function start(root) {
  rootEl = root;
  window.addEventListener('hashchange', mountFromHash);
  mountFromHash();
}

export function navigate(hash) {
  if (window.location.hash === hash) {
    // Already on that route — still re-mount (e.g. Settings tapped from setup).
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

  if (currentView && typeof currentView.unmount === 'function') {
    try { currentView.unmount(); } catch (e) { console.error('unmount failed', e); }
  }

  rootEl.innerHTML = '';
  updateTabBar(hash);
  updateCategorizeBadge();

  noteMount();
  const t0 = performance.now();
  const mod = await routes[hash]();
  const tImported = performance.now();

  currentView = mod.default;
  try {
    await currentView.mount(rootEl);
    const tMounted = performance.now();
    recordEvent('mount:' + hash.replace('#/', ''), {
      clientTotalMs: tMounted - t0,
      note: 'import=' + Math.round(tImported - t0) + 'ms,mount=' + Math.round(tMounted - tImported) + 'ms',
    });
  } catch (e) {
    console.error('mount failed', e);
    recordEvent('mount:' + hash.replace('#/', ''), { ok: false, errorMsg: e?.message || String(e) });
    rootEl.innerHTML = '<div style="padding:24px;color:#c62828">Failed to load view: ' + (e && e.message || e) + '</div>';
  }
}

function updateTabBar(hash) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}
