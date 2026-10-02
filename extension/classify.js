'use strict';

/**
 * Laya: a local sort. Not a browser, not a judge.
 * Maps text to cheap, escalate, or ask. A missing model is not-checked, never a pass.
 * No paid API is called. No claim text leaves this function.
 */
const CHEAP = 'cheap';
const ESCALATE = 'escalate';
const ASK = 'ask';
const NOT_CHECKED = 'not-checked';
const LABELS = [CHEAP, ESCALATE, ASK];

function localClock() {
  if (typeof performance === 'object' && performance && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * model: a local function (text) => 'cheap' | 'escalate' | 'ask'.
 * Anything else it returns, including 'veto', is not-checked here.
 * The result carries the label and a local latency. It never carries the text.
 */
async function classify(text, options) {
  const opts = options || {};
  const clock = typeof opts.now === 'function' ? opts.now : localClock;
  const start = clock();
  const done = (label) => ({ label, latencyMs: Math.max(0, clock() - start) });

  if (typeof opts.model !== 'function') return done(NOT_CHECKED);
  let out;
  try {
    out = await opts.model(String(text == null ? '' : text));
  } catch {
    return done(NOT_CHECKED);
  }
  const label = typeof out === 'string' ? out.trim().toLowerCase() : '';
  return done(LABELS.includes(label) ? label : NOT_CHECKED);
}

const api = { CHEAP, ESCALATE, ASK, NOT_CHECKED, LABELS, classify };

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellClassify = api;
