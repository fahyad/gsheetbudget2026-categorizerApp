// Setup view — config form (API URL + key) + version info panel.
// Extracted verbatim from the pre-v0.12 app.js setup section.

import * as config from '../config.js';
import { APP_VERSION, APP_LAST_EDITED } from '../config.js';
import * as api from '../api.js';
import { navigate } from '../router.js';

const TEMPLATE = `
  <section id="config-section">
    <form id="config-form">
      <label for="config-key">API Key</label>
      <input type="text" id="config-key" placeholder="Paste your API key" required autocomplete="off">
      <details class="advanced-config">
        <summary>Advanced: custom API URL</summary>
        <label for="config-url">API URL override</label>
        <input type="url" id="config-url" placeholder="Leave blank to use default">
      </details>
      <button type="submit">Save</button>
    </form>

    <div id="version-info">
      <h3>Version</h3>
      <div class="version-row">
        <span class="version-label">PWA</span>
        <span id="pwa-version-display">—</span>
      </div>
      <div class="version-row">
        <span class="version-label">Apps Script</span>
        <span id="as-version-display">—</span>
      </div>
      <div class="version-row" id="update-status-row" hidden>
        <span class="version-label">Update</span>
        <span id="update-status-display"></span>
      </div>
    </div>
  </section>
`;
// v0.19.1: theme toggle UI removed. Branch is pixel-only. The early
// <head> script in index.html forces data-theme="pixel" before any
// CSS parses. Bringing the toggle back is a TEMPLATE + a
// setupThemeToggle_ helper away (see git history for the prior code).

// Stash the mount root so onShow() can re-query within it. The router
// passes the same container on first mount; afterwards the view persists.
let setupRoot = null;

export default {
  mount(root) {
    setupRoot = root;
    root.innerHTML = TEMPLATE;

    const form = root.querySelector('#config-form');
    const urlInput = root.querySelector('#config-url');
    const keyInput = root.querySelector('#config-key');

    urlInput.value = localStorage.getItem('budget_api_url') || '';
    keyInput.value = config.getApiKey() || '';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      config.save(urlInput.value, keyInput.value);
      navigate('#/categorize');
    });

    // v0.19.1: theme toggle removed (branch is pixel-only).
    populateVersionInfo(root);
  },

  // Persistent-view lifecycle (v0.16.0). Returning to Setup re-populates
  // version info from the in-module cache (no API call). If the user
  // changed the API key elsewhere (they can't currently — Setup is the
  // only place — but defensive), the form values stay as they were so
  // any half-typed input survives the trip.
  onShow() {
    if (setupRoot) populateVersionInfo(setupRoot);
  },

  // Kept for source compatibility — no longer called by the router (views
  // persist for the app lifetime).
  unmount() {},
};

// v0.15.4: cache the version response per module lifetime. The ClientMetrics
// log showed `version` calls paying ~2.5 s of network overhead on every
// Setup re-mount despite server exec being <50 ms — identical response,
// so one fetch is enough. Module-level cache clears only on page reload.
let versionCache = null;

async function populateVersionInfo(root) {
  const pwaEl = root.querySelector('#pwa-version-display');
  const asEl = root.querySelector('#as-version-display');
  const statusRow = root.querySelector('#update-status-row');
  const statusEl = root.querySelector('#update-status-display');

  pwaEl.textContent = `${APP_VERSION} (last edited ${APP_LAST_EDITED})`;
  statusRow.hidden = true;

  if (!config.isConfigured()) {
    asEl.textContent = '(set API key first)';
    return;
  }

  // Paint cached value immediately if we have it; else show checking spinner.
  if (versionCache) {
    renderVersion_(asEl, statusRow, statusEl, versionCache);
    return;
  }
  asEl.textContent = 'checking…';

  try {
    const data = await api.fetchVersion();
    versionCache = data.appsScript;
    renderVersion_(asEl, statusRow, statusEl, versionCache);
  } catch (err) {
    asEl.textContent = '⚠ could not connect (check API key)';
    statusRow.hidden = true;
  }
}

function renderVersion_(asEl, statusRow, statusEl, v) {
  asEl.textContent = `${v.version} (last edited ${v.lastEdited})`;
  statusRow.hidden = false;
  statusEl.classList.remove('update-needed', 'up-to-date');
  if (v.error) {
    statusEl.textContent = '⚠ could not verify (' + v.error + ')';
  } else if (v.updateNeeded) {
    statusEl.textContent = `YES — latest is ${v.latestVersion}`;
    statusEl.classList.add('update-needed');
  } else {
    statusEl.textContent = `No (latest: ${v.latestVersion})`;
    statusEl.classList.add('up-to-date');
  }
}
