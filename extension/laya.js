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

/**
 * options.modelUrl  the Laya endpoint. Missing is not-checked.
 * options.fetchImpl defaults to fetch.
 * options.timeoutMs defaults to 10000.
 */
async function callLaya(text, options) {
  const opts = options || {};
  const start = clock();
  const done = (label) => ({ label, latency_ms: Math.max(0, Math.round(clock() - start)) });

  const url = typeof opts.modelUrl === 'string' ? opts.modelUrl.trim() : '';
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!url || /anthropic/i.test(url) || typeof fetchImpl !== 'function') return done(NOT_CHECKED);

  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 10000;
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
      });
      if (!res || res.status !== 200) return null;
      const raw = await res.text();
      if (!raw || raw.trim() === '') return null;
      return JSON.parse(raw);
    })();
    return done(labelOf(await Promise.race([call, timeout])));
  } catch {
    return done(NOT_CHECKED);
  } finally {
    clearTimeout(timer);
  }
}

const api = { PASS, VETO, NOT_CHECKED, LABELS, callLaya };

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellLaya = api;
