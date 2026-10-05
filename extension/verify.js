/* Service worker scripts share one global scope. Names stay inside this function. */
(function () {
'use strict';

/** Same POST the CLI verify command uses. */
const VERIFY_PATH = '/api/v1/hal/evaluate';

/** Same origin the CLI uses when TRUSTSHELL_API_URL is unset. */
const DEFAULT_BASE = 'https://repid-engine-production.up.railway.app';

const NOT_CHECKED = 'not-checked';

function loadRoute() {
  if (typeof require === 'function') {
    try {
      return require('./route.js');
    } catch (_err) {
      /* service worker loads route.js via importScripts */
    }
  }
  return globalThis.trustshellRoute;
}

function hasLateVote(body) {
  const responses = Array.isArray(body.provider_responses) ? body.provider_responses : [];
  if (responses.some((row) => row && row.late === true)) return true;
  const nested = body.signals && body.signals.provider_health;
  if (nested && Array.isArray(nested.late) && nested.late.length > 0) return true;
  const health = body.provider_health;
  if (health && Array.isArray(health.late) && health.late.length > 0) return true;
  return false;
}

/**
 * True when the providers' answers are listed and none said TRUE or FALSE. Same rule as
 * src/lib/trustshell.ts noProviderDecided: nobody judged the claim, so a "vetoed" built on
 * all-UNCERTAIN answers is not a veto.
 */
function noProviderDecided(body) {
  const responses = body.provider_responses;
  if (!Array.isArray(responses) || responses.length === 0) return false;
  return !responses.some((r) => {
    const v = r && typeof r === 'object' ? String(r.verdict == null ? '' : r.verdict).toUpperCase() : '';
    return v === 'TRUE' || v === 'FALSE';
  });
}

/** pass, veto, or not-checked. A late vote is not-checked, never a pass. */
function mapBody(body) {
  if (!body || typeof body !== 'object') return NOT_CHECKED;
  if (hasLateVote(body)) return NOT_CHECKED;
  if (noProviderDecided(body)) return NOT_CHECKED;
  const decision = body.decision ?? body.hal_verdict;
  if (decision === 'vetoed' || decision === 'VETO') return 'veto';
  if (decision === 'clean' || decision === 'PASS') return 'pass';
  return NOT_CHECKED;
}

/** The scrubber (scrub.js), as in laya.js. Missing means nothing is sent. */
function scrubberFor(opts) {
  if (typeof opts.scrub === 'function') return opts.scrub;
  const g = typeof globalThis === 'object' ? globalThis.trustshellScrub : null;
  if (g && typeof g.redact === 'function') return g.redact;
  if (typeof module === 'object' && module && typeof require === 'function') {
    try {
      return require('./scrub.js').redact;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Send the last reply text to the CLI verify path, with known secret and personal-data formats
 * removed first (scrub.js).
 * A timeout or a non-200 is not-checked, never 0 and never a pass.
 * No key is read or prompted.
 */
async function verifyLastReply(text, options) {
  const opts = options || {};
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const fromEnv = typeof process === 'object' && process.env ? process.env.TRUSTSHELL_API_URL : '';
  const base = String(opts.baseUrl || fromEnv || DEFAULT_BASE).replace(/\/$/, '');
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const route = loadRoute();
  const setting = route.settingOf(opts.setting);
  let order = route.orderFor(setting).map((row) => row.host).filter((host) => !/anthropic/i.test(host));
  try {
    if (/anthropic/i.test(base)) return NOT_CHECKED;
    const scrub = scrubberFor(opts);
    if (typeof scrub !== 'function') return NOT_CHECKED;
    const cleaned = scrub(String(text ?? ''));
    if (cleaned.trim() === '') return NOT_CHECKED;
    if (typeof opts.key === 'string' && opts.key.trim() === '') return NOT_CHECKED;
    if (opts.keys && typeof opts.keys === 'object') {
      order = order.filter((host) => route.keyStamp(host, opts.keys) === 'present');
      if (order.length === 0) return NOT_CHECKED;
    }
    const res = await fetchImpl(base + VERIFY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned, strictness: 2, route: setting, order }),
      signal: controller.signal,
    });
    if (!res || res.status !== 200) return NOT_CHECKED;
    const body = await res.json();
    return mapBody(body);
  } catch {
    return NOT_CHECKED;
  } finally {
    clearTimeout(timer);
  }
}

const api = { VERIFY_PATH, verifyLastReply };
if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellVerify = api;
})();
