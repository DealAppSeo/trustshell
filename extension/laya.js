'use strict';

/**
 * Laya: Convai's single-pass classifier (Apache 2.0).
 * Sends the reply text and the three labels. Returns { label, latency_ms }.
 * A missing model, a timeout, a non-200 or an empty body is not-checked, never a pass.
 * The reply is never printed and never returned. Anthropic is not called.
 */
const PASS = 'pass';
const VETO = 'veto';
const NOT_CHECKED = 'not-checked';
const LABELS = [PASS, VETO, NOT_CHECKED];

/** Over this, the answer is too late to count. It is not-checked, never a pass. */
const SLOW_MS = 3000;
const SLOW_LINE = 'Still checking';

/** Stop waiting just past SLOW_MS. A later answer could not count anyway. */
const TIMEOUT_MS = SLOW_MS + 100;

/** A label is one short word. A larger body is not an answer. */
const MAX_BODY_CHARS = 64 * 1024;

function clock() {
  if (typeof performance === 'object' && performance && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** Only Laya's answer decides the label. The reply's own words never do. */
function labelOf(body) {
  if (!body || typeof body !== 'object') return NOT_CHECKED;
  const raw = typeof body.label === 'string' ? body.label.trim().toLowerCase() : '';
  return LABELS.includes(raw) ? raw : NOT_CHECKED;
}

/** http or https only. Anything else, or an Anthropic host, is no model. */
function modelUrlOf(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || /anthropic/i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * options.modelUrl  the Laya endpoint, http or https. Missing is not-checked.
 * options.fetchImpl defaults to fetch.
 * options.timeoutMs defaults to TIMEOUT_MS, just past SLOW_MS.
 * options.now       a local clock, for tests.
 * Over SLOW_MS, the label is not-checked and line is 'Still checking'.
 */
async function callLaya(text, options) {
  const opts = options || {};
  const now = typeof opts.now === 'function' ? opts.now : clock;
  const start = now();
  const done = (label) => {
    const latency_ms = Math.max(0, Math.round(now() - start));
    if (latency_ms > SLOW_MS) return { label: NOT_CHECKED, latency_ms, line: SLOW_LINE };
    return { label, latency_ms };
  };

  const url = modelUrlOf(opts.modelUrl);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!url || typeof fetchImpl !== 'function') return done(NOT_CHECKED);

  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : TIMEOUT_MS;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const call = (async () => {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(text ?? ''), labels: LABELS }),
        signal: controller.signal,
        // No cookies ride along with the reply, and a redirect cannot move it to another host.
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      if (!res || res.status !== 200) return null;
      const raw = await res.text();
      if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_BODY_CHARS) return null;
      return JSON.parse(raw);
    })();
    return done(labelOf(await Promise.race([call, timeout])));
  } catch {
    return done(NOT_CHECKED);
  } finally {
    clearTimeout(timer);
  }
}

const api = { PASS, VETO, NOT_CHECKED, LABELS, SLOW_MS, SLOW_LINE, TIMEOUT_MS, callLaya };

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellLaya = api;
