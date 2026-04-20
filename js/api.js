import { getApiUrl, getApiKey } from './config.js';

function buildUrl(action, params = {}) {
  const url = getApiUrl();
  const key = getApiKey();
  const query = new URLSearchParams({ action, apiKey: key, ...params });
  return `${url}?${query.toString()}`;
}

async function request(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    // A3: surface HTTP errors before we try to parse the body. Apps Script
    // returns HTML error pages on 500s; calling res.json() on HTML throws a
    // cryptic "Unexpected token <" with no clue the server actually 500'd.
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCategories() {
  return request(buildUrl('categories'));
}

export async function parseAndFetch() {
  return request(buildUrl('parseAndFetch'));
}

export async function batchCategorize(items) {
  // items = [{timestamp, category, ...}, ...]
  // Serialize as compact JSON in URL param
  const compact = items.map(i => ({ ts: i.timestamp, cat: i.category }));
  return request(buildUrl('batchCategorize', { items: JSON.stringify(compact) }));
}

export async function addCategory(mainCategory, subCategory) {
  return request(buildUrl('addCategory', { mainCategory, subCategory }));
}

export async function fetchVersion() {
  return request(buildUrl('version'));
}
