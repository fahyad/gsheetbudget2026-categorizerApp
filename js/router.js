// Minimal hash router. Each route is a lazy import of a view module that
// exports { mount(root), unmount() }. Navigation is via anchor hrefs
// (#/foo) — zero click handlers, browser back/forward just works.
//
// The shell passes a root element; the router clears it and hands it to
// the active view. Views own their DOM subtree.

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

  const mod = await routes[hash]();
  currentView = mod.default;
  try {
    await currentView.mount(rootEl);
  } catch (e) {
    console.error('mount failed', e);
    rootEl.innerHTML = '<div style="padding:24px;color:#c62828">Failed to load view: ' + (e && e.message || e) + '</div>';
  }
}

function updateTabBar(hash) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  // Tab-bar is hidden on the setup route (it's a modal-like screen).
  bar.hidden = (hash === '#/setup');
  bar.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}
