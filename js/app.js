// PWA shell — thin entrypoint. Owns:
//   - header version label
//   - settings-btn -> navigate('#/setup')
//   - initial route selection (forces #/setup if unconfigured)
//   - beforeunload warning when syncQueue has unsent items
// Everything else lives in a view module under js/views/.

import * as config from './config.js';
import { APP_VERSION } from './config.js';
import { store } from './store.js';
import { start, navigate } from './router.js';

// Version label in header.
const headerVersion = document.getElementById('header-version');
if (headerVersion) headerVersion.textContent = APP_VERSION;

// Load persistent state once so views see the same singleton on mount.
store.loadCache();

// Global: warn before unload if unsent categorizations are queued.
// B4: both preventDefault() and returnValue assignment are required for the
// browser prompt to actually fire in current Chrome/Firefox/Safari.
window.addEventListener('beforeunload', (e) => {
  if (store.syncQueue.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Settings button — always navigates to the setup route.
document.getElementById('settings-btn').addEventListener('click', () => {
  navigate('#/setup');
});

// Initial route: force setup if not yet configured and no explicit route.
if (!config.isConfigured() && !window.location.hash.startsWith('#/setup')) {
  history.replaceState(null, '', '#/setup');
}

start(document.getElementById('view-root'));
