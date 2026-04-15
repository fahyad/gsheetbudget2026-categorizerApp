import { getApiUrl, getApiKey } from './config.js';

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
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
  const url = getApiUrl();
  const key = getApiKey();
  return request(`${url}?action=categories&apiKey=${encodeURIComponent(key)}`);
}

export async function parseAndFetch(knownTimestamps) {
  const url = getApiUrl();
  const key = getApiKey();
  let endpoint = `${url}?action=parseAndFetch&apiKey=${encodeURIComponent(key)}`;
  if (knownTimestamps && knownTimestamps.length > 0) {
    const joined = Array.from(knownTimestamps).join(',');
    endpoint += `&knownTimestamps=${encodeURIComponent(joined)}`;
  }
  return request(endpoint);
}

export async function categorize(timestamp, category) {
  const url = getApiUrl();
  const key = getApiKey();
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'categorize', apiKey: key, timestamp, category })
  });
}

export async function addCategory(mainCategory, subCategory) {
  const url = getApiUrl();
  const key = getApiKey();
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'addCategory', apiKey: key, mainCategory, subCategory })
  });
}

export async function uncategorize(timestamp, merchant, amount, category) {
  const url = getApiUrl();
  const key = getApiKey();
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'uncategorize', apiKey: key, timestamp, merchant, amount, category })
  });
}
