const API_URL_KEY = 'budget_api_url';
const API_KEY_KEY = 'budget_api_key';

export function getApiUrl() {
  return localStorage.getItem(API_URL_KEY);
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY);
}

export function save(url, key) {
  localStorage.setItem(API_URL_KEY, url.trim());
  localStorage.setItem(API_KEY_KEY, key.trim());
}

export function isConfigured() {
  return !!(getApiUrl() && getApiKey());
}
