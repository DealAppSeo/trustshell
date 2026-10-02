'use strict';

/** grok.com reader. One classifier call paints the label. This file does not sort the reply locally. */
const STAMP_ID = 'trustshell-stamp';

const CLASSIFY_LABELS = ['pass', 'veto', 'not-checked'];

/**
 * One classifier call. The last line is not read as a label.
 * A missing endpoint, a timeout, and an empty body are not-checked, never 0, never pass.
 * The reply text is not printed.
 */
function classifyReply(text, options) {
  const opts = options || {};
  const started = Date.now();
  function finish(label) {
    const safe = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
    return { label: safe, latency_ms: Date.now() - started };
  }
  const endpoint = Object.prototype.hasOwnProperty.call(opts, 'endpoint')
    ? opts.endpoint
    : String(opts.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '') + '/api/v1/classify';
  const fetchImpl = opts.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (typeof endpoint !== 'string' || endpoint.trim() === '' || /anthropic/i.test(endpoint) || typeof fetchImpl !== 'function') {
    return Promise.resolve(finish('not-checked'));
  }
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, timeoutMs);
  return Promise.resolve()
    .then(() => fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text == null ? '' : text), labels: CLASSIFY_LABELS }),
      signal: controller ? controller.signal : undefined,
    }))
    .then((res) => {
      if (!res || res.status !== 200 || typeof res.json !== 'function') return finish('not-checked');
      return Promise.resolve()
        .then(() => res.json())
        .then((body) => {
          if (body == null || body === '' || typeof body !== 'object') return finish('not-checked');
          return finish(typeof body.label === 'string' ? body.label.trim().toLowerCase() : 'not-checked');
        })
        .catch(() => finish('not-checked'));
    })
    .catch(() => finish('not-checked'))
    .then((row) => {
      clearTimeout(timer);
      return row;
    });
}

function lastAssistant(doc) {
  const marked = Array.prototype.slice.call(doc.querySelectorAll('[data-testid="assistant-message"]'));
  if (marked.length) return marked[marked.length - 1];
  const turns = Array.prototype.slice.call(doc.querySelectorAll('[id^="response-"]')).filter((node) => {
    const cls = String(node.className || '');
    return cls.indexOf('items-start') !== -1 && cls.indexOf('items-end') === -1;
  });
  if (!turns.length) return null;
  const last = turns[turns.length - 1];
  return last.querySelector('.response-content-markdown') || last;
}

function readText(node) {
  if (!node) return '';
  const copy = node.cloneNode(true);
  const stamps = copy.querySelectorAll('#' + STAMP_ID + ', .ts-stamp');
  for (let i = 0; i < stamps.length; i++) stamps[i].remove();
  return (copy.textContent || '').trim();
}

/** verify.js decides. A timeout or a miss is not-checked, never 0. */
function shownStamp(word) {
  if (word === 0 || word === '0') return 'not-checked';
  return word === 'pass' || word === 'veto' ? word : 'not-checked';
}

function paint(element, word) {
  const shown = shownStamp(word);
  element.dataset.stamp = shown;
  element.textContent = shown;
  return shown;
}

async function ask(text, options) {
  if (typeof text !== 'string' || text.trim().length === 0) return 'not-checked';
  const row = await classifyReply(text, options);
  const label = row && row.label;
  if (label === 'pass' || label === 'veto' || label === 'not-checked') return label;
  return 'not-checked';
}

/** Stamp the last grok reply. A timeout paints not-checked, never pass. */
async function stampText(text, options) {
  const opts = options || {};
  let word = 'not-checked';
  try {
    word = await ask(text, opts);
  } catch (_err) {
    word = 'not-checked';
  }
  const shown = shownStamp(word);
  if (opts.element) paint(opts.element, shown);
  return shown;
}

function ensureStamp(doc, after) {
  let stamp = doc.getElementById(STAMP_ID);
  if (!stamp) {
    stamp = doc.createElement('div');
    stamp.id = STAMP_ID;
    stamp.className = 'ts-stamp';
    stamp.setAttribute('role', 'status');
  }
  if (after && after.insertAdjacentElement) after.insertAdjacentElement('afterend', stamp);
  else {
    const host = doc.querySelector('main') || doc.body;
    if (host && stamp.parentNode !== host) host.appendChild(stamp);
  }
  return stamp;
}

function install(doc) {
  let scheduled = false;
  let pending = '';
  let painted = '';

  async function draw() {
    const node = lastAssistant(doc);
    const text = node ? readText(node) : '';
    const stamp = ensureStamp(doc, node);
    if (!text) {
      paint(stamp, 'not-checked');
      return;
    }
    if (text === painted || text === pending) return;
    pending = text;
    const word = await stampText(text);
    if (pending !== text) return;
    painted = text;
    paint(stamp, word);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const frame = doc.defaultView && doc.defaultView.requestAnimationFrame;
    const run = () => {
      scheduled = false;
      draw();
    };
    if (frame) frame(run);
    else run();
  }

  schedule();
  new MutationObserver(schedule).observe(doc.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined' && !(typeof module === 'object' && module && module.exports)) {
  install(document);
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { stampText, lastAssistant, readText, classifyReply };
}
