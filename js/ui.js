// Shared UI helpers used across views. The error/success toast element
// lives in the shell (index.html) because any view can raise an error.

let errorTimeout;
function toast() { return document.getElementById('error-toast'); }

export function showError(message) {
  const t = toast();
  if (!t) return;
  t.classList.remove('success');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => { t.hidden = true; }, 5000);
}

export function showSuccess(message) {
  const t = toast();
  if (!t) return;
  t.classList.add('success');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => { t.hidden = true; }, 5000);
}

// Visibility control for the three header action buttons. Views call this
// on mount so the shell doesn't need to know which buttons each view uses.
export function setHeaderActions({ refresh = false, sync = false, settings = true } = {}) {
  const r = document.getElementById('refresh-btn');
  const s = document.getElementById('sync-btn');
  const g = document.getElementById('settings-btn');
  if (r) r.hidden = !refresh;
  if (s) s.hidden = !sync;
  if (g) g.hidden = !settings;
}
