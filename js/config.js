// PWA version info — bumped manually on each meaningful release.
// Displayed in the Setup screen so the user can confirm the running version.
export const APP_VERSION = 'v0.12.2';
export const APP_LAST_EDITED = '2026-04-23';

// Hardcoded production deployment URL. Safe to expose (public anyway — visible in
// every network request). The API key stays in localStorage (per-device, never
// committed).
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ/exec';

const API_URL_KEY = 'budget_api_url';  // Only used for override; normally unused
const API_KEY_KEY = 'budget_api_key';

export function getApiUrl() {
  // Override via localStorage (for testing against a different deployment);
  // otherwise use the hardcoded default.
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL;
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY);
}

export function save(url, key) {
  // Only persist a URL override if the user explicitly entered something
  // different from the default — avoids stale overrides.
  if (url && url.trim() && url.trim() !== DEFAULT_API_URL) {
    localStorage.setItem(API_URL_KEY, url.trim());
  }
  localStorage.setItem(API_KEY_KEY, key.trim());
}

export function saveKey(key) {
  localStorage.setItem(API_KEY_KEY, key.trim());
}

export function isConfigured() {
  // URL is always configured (hardcoded default); only the key matters.
  return !!getApiKey();
}
