'use strict';

/**
 * One classifier call. Labels are pass, veto, and not-checked.
 * A missing endpoint, a timeout, and an empty body are not-checked, never 0, never pass.
 * The reply text is not printed.
 */
const LABELS = ['pass', 'veto', 'not-checked'];
const SLOW_MS = 3000;
const SLOW_LINE = 'Still checking. One question would help.';

function finish(started, label) {
  const elapsed = Date.now() - started;
  let safe = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
  if (elapsed >= SLOW_MS) safe = 'not-checked';
  return { label: safe, latency_ms: elapsed };
}

function classifyReply(text, options) {
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
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : SLOW_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, timeoutMs);
  return Promise.resolve()
    .then(() => fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text == null ? '' : text), labels: LABELS }),
      signal: controller ? controller.signal : undefined,
    }))
    .then((res) => {
      if (!res || res.status !== 200 || typeof res.json !== 'function') return finish(started, 'not-checked');
      return Promise.resolve()
        .then(() => res.json())
        .then((body) => {
          if (body == null || body === '' || typeof body !== 'object') return finish(started, 'not-checked');
          return finish(started, typeof body.label === 'string' ? body.label.trim().toLowerCase() : 'not-checked');
        })
        .catch(() => finish(started, 'not-checked'));
    })
    .catch(() => finish(started, 'not-checked'))
    .then((row) => {
      clearTimeout(timer);
      return row;
    });
}

/** The one line shown when the call took 3 seconds or more. */
function lineFor(row) {
  if (!row || row.label !== 'not-checked') return '';
  if (typeof row.latency_ms !== 'number' || row.latency_ms < SLOW_MS) return '';
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
