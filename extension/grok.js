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

/** The classifier decides. A timeout or a miss is not-checked, never 0. */
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
  if (typeof text !== 'string' || text.trim().length === 0) return { label: 'not-checked', latency_ms: 0 };
  const row = await classifyReply(text, options);
  const label = row && row.label;
  const safe = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
  return {
    label: safe,
    latency_ms: row && typeof row.latency_ms === 'number' ? row.latency_ms : 0,
  };
}

/** Stamp the last grok reply. A call over 3 seconds paints not-checked and the check line. */
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
  if (opts.element) {
    paint(opts.element, shown);
    if (api && typeof api.showCheckLine === 'function' && opts.doc) api.showCheckLine(opts.doc, opts.element, line);
    else if (line) opts.element.textContent = shown + '\n' + line;
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
  let scheduled = false;
  let pending = '';
  let painted = '';

  async function draw() {
    const node = lastAssistant(doc);
    const text = node ? readText(node) : '';
    const stamp = ensureStamp(doc, node);
    if (!text) {
      paint(stamp, 'not-checked');
      const api = classifyApi();
      if (api && typeof api.showCheckLine === 'function') api.showCheckLine(doc, stamp, '');
      return;
    }
    if (text === painted || text === pending) return;
    pending = text;
    await stampText(text, { element: stamp, doc: doc });
    if (pending !== text) return;
    painted = text;
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
