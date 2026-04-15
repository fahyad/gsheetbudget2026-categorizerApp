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

export async function parseAndFetch(knownTimestamps) {
  const params = {};
  if (knownTimestamps && knownTimestamps.size > 0) {
    params.knownTimestamps = Array.from(knownTimestamps).join(',');
  }
  return request(buildUrl('parseAndFetch', params));
}

export async function categorize(timestamp, category) {
  return request(buildUrl('categorize', { timestamp, category }));
}

export async function addCategory(mainCategory, subCategory) {
  return request(buildUrl('addCategory', { mainCategory, subCategory }));
}

export async function uncategorize(timestamp, merchant, amount, category) {
  return request(buildUrl('uncategorize', { timestamp, merchant, amount, category }));
}
