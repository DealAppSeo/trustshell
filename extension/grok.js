'use strict';

/** grok.com reader. One classifier call paints the label. This file does not sort the reply locally. */
const STAMP_ID = 'trustshell-stamp';

function classifyApi() {
  if (typeof globalThis !== 'undefined' && globalThis.trustshellClassify && globalThis.trustshellClassify.classifyReply) {
    return globalThis.trustshellClassify;
  }
  if (typeof require === 'function') {
    try {
      return require('./classify.js');
    } catch (_err) {
      return null;
    }
  }
  return null;
}

/** Paint the classifier label. The last line of the reply is not a label. */
function classifyReply(text, options) {
  const api = classifyApi();
  if (!api) return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
  return api.classifyReply(text, options);
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

/** The classifier decides. A timeout or a miss is not-checked, never 0. checking is the call in flight. */
function shownStamp(word) {
  if (word === 0 || word === '0') return 'not-checked';
  return word === 'pass' || word === 'veto' || word === 'checking' || word === 'ask' ? word : 'not-checked';
}

/** classify.js owns the words. If it did not load, nothing was checked, whatever word arrived. */
function paint(element, word) {
  const api = classifyApi();
  if (!api || typeof api.paintStamp !== 'function') {
    element.dataset.stamp = 'not-checked';
    element.textContent = 'Not checked';
    element.title = 'not-checked';
    return 'not-checked';
  }
  const shown = shownStamp(word);
  api.paintStamp(element, shown);
  return shown;
}

/** Options that change the call itself. Without any, this is the browser path: classify.js's own. */
const CALL_OPTIONS = ['fetchImpl', 'baseUrl', 'endpoint', 'timeoutMs'];

async function ask(text, options) {
  if (typeof text !== 'string' || text.trim().length === 0) return { label: 'not-checked', latency_ms: 0 };
  // The page's draw passes where to paint (element, doc, current), not how to call. Those must not
  // reach classify.js as call options: with none, the call takes the browser path every other host
  // takes, the one that honours Only when I click and reports the stamp to the record.
  const opts = options || {};
  const call = CALL_OPTIONS.some((k) => Object.prototype.hasOwnProperty.call(opts, k)) ? opts : undefined;
  const row = await classifyReply(text, call);
  const label = row && row.label;
  const known = label === 'pass' || label === 'veto' || label === 'not-checked';
  // ask is Check this reply (Only when I click): nothing was sent, and the stamp says so.
  const out = {
    label: known || label === 'ask' ? label : 'not-checked',
    latency_ms: row && typeof row.latency_ms === 'number' ? row.latency_ms : 0,
  };
  // What produced the label (the line under the stamp) rides only with a label the endpoint sent.
  const api = classifyApi();
  return known && api ? api.copyPath(row, out) : out;
}

/**
 * Stamp the last grok reply. A call over 3 seconds paints not-checked and the check line.
 * options.current, when given, says whether this answer is still the newest; an older answer
 * is not painted, so it can never label a reply it did not read.
 */
async function stampText(text, options) {
  const opts = options || {};
  let row = { label: 'not-checked', latency_ms: 0 };
  try {
    row = await ask(text, opts);
  } catch (_err) {
    row = { label: 'not-checked', latency_ms: 0 };
  }
  const shown = shownStamp(row.label);
  const api = classifyApi();
  const line = api && typeof api.lineFor === 'function' ? api.lineFor(row) : '';
  if (opts.element && (typeof opts.current !== 'function' || opts.current())) {
    paint(opts.element, shown);
    if (api && typeof api.showCheckLine === 'function' && opts.doc) api.showCheckLine(opts.doc, opts.element, line);
    else if (line) opts.element.textContent = opts.element.textContent + '\n' + line;
  }
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
  let pending = '';
  let painted = '';
  // The text whose stamp reads Check this reply (Only when I click).
  let offered = '';

  async function draw() {
    const node = lastAssistant(doc);
    const text = node ? readText(node) : '';
    const stamp = ensureStamp(doc, node);
    if (!text) {
      // Nothing to read now, so no answer still out may paint over this.
      pending = '';
      paint(stamp, 'not-checked');
      const api = classifyApi();
      if (api && typeof api.showCheckLine === 'function') api.showCheckLine(doc, stamp, '');
      return;
    }
    const cls = classifyApi();
    const known = cls && typeof cls.knownRow === 'function' ? cls.knownRow(text) : null;
    const asking = Boolean(known && known.label === 'ask');
    // Clicked: the reply that was offered is no longer offered, so draw it again and send it.
    if (offered === text && !asking) offered = painted = pending = '';
    if (text === painted || text === pending) return;
    pending = text;
    // The call is out: say so, rather than leave the reply unmarked while it runs. A reply that
    // will only be offered (Check this reply) sends nothing, so it is never shown as Checking.
    if (!asking) paint(stamp, 'checking');
    const api = classifyApi();
    if (api && typeof api.showCheckLine === 'function') api.showCheckLine(doc, stamp, '');
    const shown = await stampText(text, { element: stamp, doc: doc, current: () => pending === text });
    if (pending !== text) return;
    painted = text;
    offered = shown === 'ask' ? text : '';
  }

  function schedule() {
    const api = classifyApi();
    if (api && typeof api.whenSettled === 'function') api.whenSettled(() => { draw(); });
    else draw();
  }

  schedule();
  new MutationObserver(schedule).observe(doc.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined' && !(typeof module === 'object' && module && module.exports)) {
  install(document);
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { stampText, lastAssistant, readText, classifyReply, install };
}
