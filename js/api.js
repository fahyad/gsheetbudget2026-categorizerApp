import { getApiUrl, getApiKey } from './config.js';
import { recordStart, recordComplete } from './lib/metrics.js';

function buildUrl(action, params = {}) {
  const url = getApiUrl();
  const key = getApiKey();
  const query = new URLSearchParams({ action, apiKey: key, ...params });
  return `${url}?${query.toString()}`;
}

// `metricKey` is the action-name used in the ClientMetrics log. Usually
// equal to the endpoint action, but dumpSheet passes a richer key like
// "dumpSheet:Transactions" so we can distinguish the 8K-cell read from
// the smaller ones in analysis.
//
// `action` in the URL always matches the server's endpoint name.
async function request(metricKey, url) {
  // The flush endpoint itself must not generate metrics — otherwise the
  // act of reporting generates reports-about-reporting.
  const instrument = metricKey !== 'logClientMetrics';
  const ticket = instrument ? recordStart(metricKey) : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      if (ticket) recordComplete(ticket, { ok: false, errorMsg: `HTTP ${res.status}` });
      throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    }

    // Read as text first so we can capture byte length and recover from
    // Apps Script's occasional HTML error pages (which crash res.json()).
    const text = await res.text();
    const bytes = text.length;

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (ticket) recordComplete(ticket, { ok: false, bytes, errorMsg: 'JSON parse' });
      throw e;
    }

    // serverMs is server's self-reported exec time (Apps Script v11.13+
    // echoes `_elapsedMs` in every response). Older servers omit it and
    // we just log null.
    const serverMs = (typeof data._elapsedMs === 'number') ? data._elapsedMs : null;

    if (!data.success) {
      if (ticket) recordComplete(ticket, { ok: false, bytes, serverMs, errorMsg: data.error || 'API request failed' });
      throw new Error(data.error || 'API request failed');
    }

    if (ticket) recordComplete(ticket, { ok: true, bytes, serverMs });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCategories() {
  return request('categories', buildUrl('categories'));
}

// v0.17.0: opts.withParse=true forces an inline Gmail scan before reading
// uncategorized rows. Default (false) is a pure read — the hourly Apps
// Script trigger (v11.16) keeps the sheet fresh, so callers that don't
// need real-time Gmail freshness skip the ~1-3 s scan and get the read
// in ~200 ms server-side. Pass withParse:true from the user's explicit
// "I want fresh now" actions (Parse pill, empty-state Refresh).
export async function parseAndFetch({ withParse = false } = {}) {
  const extra = withParse ? { withParse: '1' } : {};
  return request('parseAndFetch', buildUrl('parseAndFetch', extra));
}

export async function batchCategorize(items) {
  const compact = items.map(i => ({ ts: i.timestamp, cat: i.category }));
  return request('batchCategorize', buildUrl('batchCategorize', { items: JSON.stringify(compact) }));
}

export async function addCategory(mainCategory, subCategory) {
  return request('addCategory', buildUrl('addCategory', { mainCategory, subCategory }));
}

export async function fetchVersion() {
  return request('version', buildUrl('version'));
}

export async function dumpSheet(tab, range) {
  const params = { tab };
  if (range) params.range = range;
  return request('dumpSheet:' + tab, buildUrl('dumpSheet', params));
}

// v0.19.8: combo endpoint that returns categories + parseAndFetch in a
// single round-trip. Halves the cold-mount network cost (the ~2.5s
// 302-redirect+TLS tax is paid once instead of twice). Backward-compatible
// — if the server doesn't know this action it returns
// {success:false, error:"Unknown action: bootstrap"} and the caller can
// fall back to the dual-fetch pattern. See handleBootstrap_ in Code.js.
//
// Honors withParse the same way parseAndFetch() does — only force-refresh
// flows pass true so the inline Gmail scan runs.
export async function bootstrap({ withParse = false } = {}) {
  const extra = withParse ? { withParse: '1' } : {};
  return request('bootstrap', buildUrl('bootstrap', extra));
}
