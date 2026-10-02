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

/** pass, veto, or not-checked. A late vote is not-checked, never a pass. */
function mapBody(body) {
  if (!body || typeof body !== 'object') return NOT_CHECKED;
  if (hasLateVote(body)) return NOT_CHECKED;
  const decision = body.decision ?? body.hal_verdict;
  if (decision === 'vetoed' || decision === 'VETO') return 'veto';
  if (decision === 'clean' || decision === 'PASS') return 'pass';
  return NOT_CHECKED;
}

/**
 * Send the last reply text to the CLI verify path.
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
  const order = route.orderFor(setting).map((row) => row.host);
  try {
    const res = await fetchImpl(base + VERIFY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text ?? ''), strictness: 2, route: setting, order }),
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
