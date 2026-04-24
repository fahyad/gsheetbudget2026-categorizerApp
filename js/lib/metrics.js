// Client-side API + performance metrics. Captures per-request timings,
// session context, and pitfall detectors (duplicates, cache hits, etc.);
// buffers them in memory; flushes to the sheet's ClientMetrics tab on
// visibility-hidden via sendBeacon.
//
// Goal is diagnosis, not fixes. Once we know the real breakdown of cold
// network vs. Apps Script cold start vs. in-view overhead, we can act.
//
// Design constraints:
//   1. Never block the critical path. All recording is synchronous &
//      O(1); flushing is fire-and-forget.
//   2. The flush call itself is NOT recorded — otherwise we'd log the
//      act of logging and flood the tab.
//   3. Buffer is in-memory only (session-scoped). If the user closes
//      the PWA without sendBeacon firing, the last batch is lost; that
//      is acceptable because this is diagnostics, not durable audit.

import { APP_VERSION, getApiUrl, getApiKey } from '../config.js';

const BUFFER_MAX = 50;       // drop oldest beyond this
const DUP_WINDOW_MS = 2000;  // "duplicate" = same action fires within 2 s

// ---- Session context ----

const SESSION_ID = (() => {
  // Short random id, URL-safe.
  try {
    const a = new Uint8Array(6);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  } catch (_) {
    return Math.random().toString(36).slice(2, 12);
  }
})();

const SESSION_START_MS = Date.now();
let mountCounter = 0;
let prevCompleteMs = 0;
const inFlight = new Set();
const buffer = [];
const lastStartByAction = new Map();

function connectionInfo() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return '';
    return c.effectiveType || c.type || '';
  } catch (_) { return ''; }
}

function pushRecord(rec) {
  if (buffer.length >= BUFFER_MAX) buffer.shift();
  buffer.push(rec);
}

// Expose read-only view for manual inspection via Safari DevTools:
//   window.__apiStats  -> array of records
//   window.__apiStats_session  -> { sessionId, mountCounter, inFlight: n }
try {
  Object.defineProperty(window, '__apiStats', {
    configurable: true,
    get: () => buffer.slice(),
  });
  Object.defineProperty(window, '__apiStats_session', {
    configurable: true,
    get: () => ({
      sessionId: SESSION_ID,
      sessionStartMs: SESSION_START_MS,
      mountCounter,
      inFlight: inFlight.size,
      buffered: buffer.length,
    }),
  });
} catch (_) { /* non-browser env */ }

// ---- Per-request instrumentation ----

/**
 * Starts timing a request. Returns a ticket to pass to recordComplete().
 * Caller: api.js request() wrapper.
 */
export function recordStart(action) {
  const clientStartMs = performance.now();
  const concurrency = inFlight.size;
  const msSincePrev = prevCompleteMs ? (clientStartMs - prevCompleteMs) : -1;

  // Duplicate detection: same action started within DUP_WINDOW_MS of the
  // last start for that action. One flag; analysis of actual overlap is
  // richer but this catches the obvious refetch bug.
  const prevStart = lastStartByAction.get(action) || 0;
  const duplicate = prevStart > 0 && (clientStartMs - prevStart) < DUP_WINDOW_MS;
  lastStartByAction.set(action, clientStartMs);

  const ticket = {
    action,
    clientStartMs,
    inFlightAtStart: concurrency,
    msSincePrev: msSincePrev < 0 ? null : Math.round(msSincePrev),
    duplicateDetected: duplicate,
  };
  inFlight.add(ticket);
  return ticket;
}

/**
 * Completes a ticket. Pass { ok, serverMs, bytes, errorMsg, cached }.
 * - ok: boolean
 * - serverMs: from server response if present (null otherwise)
 * - bytes: response length if known
 * - errorMsg: string if !ok
 * - cached: true if served from client cache (no network) — caller reports
 */
export function recordComplete(ticket, { ok = true, serverMs = null, bytes = null, errorMsg = '', cached = false } = {}) {
  if (!ticket) return;
  inFlight.delete(ticket);
  const endMs = performance.now();
  const clientTotalMs = Math.round(endMs - ticket.clientStartMs);
  const networkMs = (serverMs != null) ? Math.max(0, clientTotalMs - serverMs) : null;
  prevCompleteMs = endMs;

  pushRecord({
    t: new Date().toISOString(),
    sessionId: SESSION_ID,
    mountN: mountCounter,
    appVersion: APP_VERSION,
    connection: connectionInfo(),
    action: ticket.action,
    clientStartMs: Math.round(ticket.clientStartMs),
    clientTotalMs,
    serverMs: serverMs != null ? Math.round(serverMs) : null,
    networkMs,
    inFlightAtStart: ticket.inFlightAtStart,
    msSincePrev: ticket.msSincePrev,
    duplicateDetected: ticket.duplicateDetected,
    cached: !!cached,
    ok,
    errorMsg: errorMsg ? String(errorMsg).slice(0, 200) : '',
    bytes: bytes != null ? bytes : null,
  });
}

/**
 * Records a synthetic metric for things that aren't a request — e.g. a
 * view's mount time, a cache-hit decision. `kind` is logged as the action.
 */
export function recordEvent(kind, data = {}) {
  pushRecord({
    t: new Date().toISOString(),
    sessionId: SESSION_ID,
    mountN: mountCounter,
    appVersion: APP_VERSION,
    connection: connectionInfo(),
    action: kind,
    clientStartMs: Math.round(performance.now()),
    clientTotalMs: data.clientTotalMs != null ? Math.round(data.clientTotalMs) : null,
    serverMs: null,
    networkMs: null,
    inFlightAtStart: inFlight.size,
    msSincePrev: null,
    duplicateDetected: false,
    cached: !!data.cached,
    ok: data.ok !== false,
    errorMsg: data.errorMsg || '',
    bytes: null,
    note: data.note || '',
  });
}

export function noteMount() {
  mountCounter += 1;
  return mountCounter;
}

// ---- Flush ----
// Fires on visibility hidden (iOS PWA background, tab switch) via
// sendBeacon — fire-and-forget, does not block page unload.

let flushing = false;

function flush({ sync = false } = {}) {
  if (flushing || buffer.length === 0) return;
  if (!getApiKey()) return;  // not configured; skip silently

  flushing = true;
  const batch = buffer.splice(0, buffer.length);

  // Apps Script doPost reads `action` and `apiKey` from the JSON body, so
  // we include them there (URL stays clean). text/plain on the Blob keeps
  // sendBeacon in the "CORS simple request" lane — no preflight, which
  // iOS Safari handles unreliably with Apps Script.
  const url = getApiUrl();
  const body = JSON.stringify({
    action: 'logClientMetrics',
    apiKey: getApiKey(),
    session: SESSION_ID,
    records: batch,
  });

  try {
    if (sync && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      const ok = navigator.sendBeacon(url, blob);
      if (!ok) buffer.unshift(...batch);  // beacon refused; put back
    } else {
      // keepalive: allows the request to complete after page unload.
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
        keepalive: true,
      }).catch(() => { /* swallow; diagnostics shouldn't surface errors */ });
    }
  } finally {
    flushing = false;
  }
}

// Install the flush trigger once.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ sync: true });
  });
  window.addEventListener('pagehide', () => flush({ sync: true }));
  // Also flush if the buffer fills mid-session.
  window.setInterval(() => {
    if (buffer.length >= BUFFER_MAX * 0.8) flush({ sync: false });
  }, 30000);
}

// Manual flush for DevTools: window.__apiStatsFlush()
try {
  window.__apiStatsFlush = () => flush({ sync: false });
} catch (_) { /* non-browser env */ }
