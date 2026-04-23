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
