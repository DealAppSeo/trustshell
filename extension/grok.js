'use strict';

/** grok.com reader. The evaluate call lives in verify.js. This file does not copy it. */
const STAMP_ID = 'trustshell-stamp';

function verifyApi() {
  if (typeof require === 'function') {
    try {
      return require('./verify.js');
    } catch (_err) {
      /* content script has no resolver */
    }
  }
  return globalThis.trustshellVerify;
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
  const opts = options || {};
  if (typeof text !== 'string' || text.trim().length === 0) return 'not-checked';
  if (opts.fetchImpl || opts.timeoutMs != null || opts.baseUrl || opts.verify) {
    const api = opts.verify || verifyApi();
    return api.verifyLastReply(text, opts);
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'trustshell-verify', text }, (res) => {
        resolve(res && res.stamp ? res.stamp : 'not-checked');
      });
    });
  }
  return verifyApi().verifyLastReply(text, opts);
}

/** Stamp the last grok reply. A timeout from verify.js paints not-checked, never pass. */
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
  module.exports = { stampText, lastAssistant, readText };
}
