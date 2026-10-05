/* Content scripts in one manifest entry share one global scope. Each shared script keeps its
   names inside this function so two files can never redeclare the same top-level name. */
(function () {
  'use strict';


  /**
   * The hardened call to our own classifier: POST /api/v1/classify on repid-engine, which takes
   * two free votes (Groq and Cerebras). Both TRUE is pass, both FALSE is veto, anything else is
   * not-checked. (This header used to call it "Convai's classifier"; it never called Convai.)
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

  /**
   * Which path the endpoint says produced the label (`by`, and `voters` only with 'votes'), or {}
   * when missing or out of contract. All or nothing, as src/lib/claim.ts pathOf: a 'votes' with no
   * usable voter list, or a 'skipped' / 'deadline' claiming pass or veto, reports no path at all.
   */
  const PATHS = ['arithmetic', 'votes', 'skipped', 'deadline'];
  const VOTER_ID = /^[a-z0-9-]{1,32}$/;
  function pathOf(body, label) {
    if (!body || typeof body !== 'object') return {};
    const by = body.by;
    if (typeof by !== 'string' || !PATHS.includes(by)) return {};
    if ((by === 'skipped' || by === 'deadline') && label !== NOT_CHECKED) return {};
    if (by !== 'votes') return { by };
    const voters = body.voters;
    if (!Array.isArray(voters) || voters.length === 0 || voters.length > 8) return {};
    if (!voters.every((v) => typeof v === 'string' && VOTER_ID.test(v))) return {};
    return { by, voters: voters.slice() };
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
  /**
   * The scrubber (extension/scrub.js). In the browser it is a global loaded before this file; under
   * Node tests this file loads it directly. Missing means NOTHING is sent: an unscrubbed reply must
   * never leave because a script failed to load.
   */
  function scrubber(opts) {
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

  async function callLaya(text, options) {
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now : clock;
    const start = now();
    const done = (label, body) => {
      const latency_ms = Math.max(0, Math.round(now() - start));
      if (latency_ms > SLOW_MS) return { label: NOT_CHECKED, latency_ms, line: SLOW_LINE };
      return Object.assign({ label, latency_ms }, body === undefined ? {} : pathOf(body, label));
    };

    const url = modelUrlOf(opts.modelUrl);
    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (!url || typeof fetchImpl !== 'function') return done(NOT_CHECKED);
    // Known secret and personal-data formats are removed before anything is sent (scrub.js).
    const scrub = scrubber(opts);
    if (typeof scrub !== 'function') return done(NOT_CHECKED);
    const cleaned = scrub(String(text ?? ''));
    if (cleaned.trim() === '') return done(NOT_CHECKED);

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
          body: JSON.stringify({ text: cleaned, labels: LABELS }),
          signal: controller.signal,
          // No cookies ride along with the reply, and a redirect cannot move it to another host.
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
        });
        if (!res || res.status !== 200) return null;
        if (typeof res.text !== 'function') {
          // Some callers hand back only json(). An empty or non-object body is still not-checked.
          return typeof res.json === 'function' ? res.json() : null;
        }
        const raw = await res.text();
        if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_BODY_CHARS) return null;
        return JSON.parse(raw);
      })();
      const body = await Promise.race([call, timeout]);
      // The path rides only with a label the endpoint actually sent. An off-contract label becomes
      // not-checked here, and no path is reported for an answer this file decided.
      const own = Boolean(body) && typeof body === 'object' && typeof body.label === 'string' &&
        LABELS.includes(body.label.trim().toLowerCase());
      return done(labelOf(body), own ? body : undefined);
    } catch {
      return done(NOT_CHECKED);
    } finally {
      clearTimeout(timer);
    }
  }

  const api = { PASS, VETO, NOT_CHECKED, LABELS, SLOW_MS, SLOW_LINE, TIMEOUT_MS, callLaya, pathOf };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellLaya = api;
})();
