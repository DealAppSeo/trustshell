/* Content scripts in one manifest entry share one global scope. Each shared script keeps its
   names inside this function so two files can never redeclare the same top-level name. */
(function () {
  'use strict';


  /**
   * One classifier call. Labels are pass, veto, and not-checked.
   * A missing endpoint, a timeout, and an empty body are not-checked, never 0, never pass.
   * The reply text is not printed.
   */
  const LABELS = ['pass', 'veto', 'not-checked'];
  const SLOW_MS = 3000;
  const SLOW_LINE = 'Still checking';

  function finish(started, label) {
    const elapsed = Date.now() - started;
    let safe = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
    if (elapsed > SLOW_MS) safe = 'not-checked';
    return { label: safe, latency_ms: elapsed };
  }

  /** laya.js is the hardened call: http(s) only, no cookies, no redirects, a body cap. */
  function layaApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellLaya && globalThis.trustshellLaya.callLaya) {
      return globalThis.trustshellLaya;
    }
    if (typeof require === 'function') {
      try {
        return require('./laya.js');
      } catch {
        return null;
      }
    }
    return null;
  }

  function callClassifier(text, options) {
    const opts = options || {};
    const started = Date.now();
    const endpoint = Object.prototype.hasOwnProperty.call(opts, 'endpoint')
      ? opts.endpoint
      : String(opts.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '') + '/api/v1/classify';
    if (typeof endpoint !== 'string' || endpoint.trim() === '' || /anthropic/i.test(endpoint)) {
      return Promise.resolve(finish(started, 'not-checked'));
    }
    const fetchImpl = opts.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
    if (typeof fetchImpl !== 'function') return Promise.resolve(finish(started, 'not-checked'));
    // Unset, laya.js waits just past SLOW_MS so a late answer can still show Still checking.
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined;

    // laya.js makes the call: http(s) only, no cookies, no redirects, a body cap.
    // The manifest loads it before this file on every host. Missing is not-checked.
    const laya = layaApi();
    if (!laya) return Promise.resolve(finish(started, 'not-checked'));
    return laya
      .callLaya(text, { modelUrl: endpoint, fetchImpl, timeoutMs, now: () => Date.now() })
      .then((row) => finish(started, row && row.label))
      .catch(() => finish(started, 'not-checked'));
  }

  /**
   * The hosts redraw on every DOM change, and painting the stamp is itself a DOM change.
   * Without this, one finished reply is sent to the classifier again on every redraw.
   * Only the browser path (no options) is cached: one call in flight per text, and a
   * pass or veto is kept for that text. not-checked is not kept, so the next redraw retries.
   */
  const memo = { text: null, promise: null, row: null };

  function classifyOnce(text) {
    const key = String(text == null ? '' : text);
    if (memo.text === key && memo.row) return Promise.resolve(memo.row);
    if (memo.text === key && memo.promise) return memo.promise;
    memo.text = key;
    memo.row = null;
    const promise = callClassifier(key, {}).then((row) => {
      if (memo.text === key && memo.promise === promise) {
        memo.promise = null;
        if (row.label === 'pass' || row.label === 'veto') memo.row = row;
      }
      return row;
    });
    memo.promise = promise;
    return promise;
  }

  /** The hosts call this with no options in the browser, so they all share the cache. */
  function classifyReply(text, options) {
    return options === undefined ? classifyOnce(text) : callClassifier(text, options);
  }

  /** The one line shown when the call took over 3 seconds. */
  function lineFor(row) {
    if (!row || row.label !== 'not-checked') return '';
    if (typeof row.latency_ms !== 'number' || row.latency_ms <= SLOW_MS) return '';
    return SLOW_LINE;
  }

  function showCheckLine(doc, after, line) {
    if (!doc || typeof doc.getElementById !== 'function') return null;
    const nodeId = 'trustshell-check-line';
    let node = doc.getElementById(nodeId);
    if (!line) {
      if (node && typeof node.remove === 'function') node.remove();
      return null;
    }
    if (!node && typeof doc.createElement === 'function') {
      node = doc.createElement('div');
      node.id = nodeId;
      node.className = 'ts-check-line';
      if (typeof node.setAttribute === 'function') node.setAttribute('role', 'status');
    }
    if (!node) return null;
    node.textContent = line;
    if (after && typeof after.insertAdjacentElement === 'function') after.insertAdjacentElement('afterend', node);
    else if (doc.body && typeof doc.body.appendChild === 'function' && node.parentNode !== doc.body) doc.body.appendChild(node);
    return node;
  }

  const api = { LABELS, SLOW_MS, SLOW_LINE, classifyReply, lineFor, showCheckLine };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellClassify = api;
})();
