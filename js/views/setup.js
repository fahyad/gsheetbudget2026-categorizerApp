// Setup view — config form (API URL + key) + version info panel.
// Extracted verbatim from the pre-v0.12 app.js setup section.

import * as config from '../config.js';
import { APP_VERSION, APP_LAST_EDITED } from '../config.js';
import * as api from '../api.js';
import { setHeaderActions } from '../ui.js';
import { navigate } from '../router.js';

const TEMPLATE = `
  <section id="config-section">
    <h2>Setup</h2>
    <p>Enter your API key to connect to your budget.</p>
    <form id="config-form">
      <label for="config-key">API Key</label>
      <input type="text" id="config-key" placeholder="Your API key" required autocomplete="off">
      <details class="advanced-config">
        <summary>Advanced: custom API URL</summary>
        <label for="config-url">API URL (optional override)</label>
        <input type="url" id="config-url" placeholder="Leave blank to use default">
      </details>
      <button type="submit">Save</button>
    </form>

    <div id="version-info">
      <h3>Version info</h3>
      <div class="version-row">
        <span class="version-label">PWA</span>
        <span id="pwa-version-display">—</span>
      </div>
      <div class="version-row">
        <span class="version-label">Apps Script</span>
        <span id="as-version-display">—</span>
      </div>
      <div class="version-row" id="update-status-row" hidden>
        <span class="version-label">Update needed</span>
        <span id="update-status-display"></span>
      </div>
    </div>
  </section>
`;

export default {
  mount(root) {
    setHeaderActions({ refresh: false, sync: false, settings: false });
    root.innerHTML = TEMPLATE;

    const form = root.querySelector('#config-form');
    const urlInput = root.querySelector('#config-url');
    const keyInput = root.querySelector('#config-key');

    // Pre-fill with existing values so re-opening Settings shows current config.
    urlInput.value = localStorage.getItem('budget_api_url') || '';
    keyInput.value = config.getApiKey() || '';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      config.save(urlInput.value, keyInput.value);
      navigate('#/categorize');
    });

    populateVersionInfo(root);
  },

  unmount() {
    // Re-show header actions so subsequent views start from a known state.
    setHeaderActions({ settings: true });
  },
};

async function populateVersionInfo(root) {
  const pwaEl = root.querySelector('#pwa-version-display');
  const asEl = root.querySelector('#as-version-display');
  const statusRow = root.querySelector('#update-status-row');
  const statusEl = root.querySelector('#update-status-display');

  pwaEl.textContent = `${APP_VERSION} (last edited ${APP_LAST_EDITED})`;
  asEl.textContent = 'checking…';
  statusRow.hidden = true;

  if (!config.isConfigured()) {
    asEl.textContent = '(set API key first)';
    return;
  }

  try {
    const data = await api.fetchVersion();
    const v = data.appsScript;

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
  } catch (err) {
    asEl.textContent = '⚠ could not connect (check API key)';
    statusRow.hidden = true;
  }
}
