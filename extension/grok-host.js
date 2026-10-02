/**
 * Reads the last assistant reply on grok.com.
 * A missing or empty reply is not-checked.
 * This script does not click, type, or send.
 */
'use strict';

function outermost(nodes) {
  return nodes.filter(function (node) {
    return !nodes.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function lastGrok(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  var marked = outermost(
    Array.prototype.slice.call(doc.querySelectorAll('[data-testid="assistant-message"]'))
  );
  if (marked.length) return marked[marked.length - 1];
  var turns = Array.prototype.slice.call(doc.querySelectorAll('[id^="response-"]')).filter(function (node) {
    var cls = String(node.className || '');
    return cls.indexOf('items-start') !== -1 && cls.indexOf('items-end') === -1;
  });
  if (!turns.length) return null;
  var last = turns[turns.length - 1];
  var inner = typeof last.querySelector === 'function' ? last.querySelector('.response-content-markdown') : null;
  return inner || last;
}

function readText(node) {
  if (!node || typeof node.cloneNode !== 'function') return '';
  var copy = node.cloneNode(true);
  if (copy && typeof copy.querySelectorAll === 'function') {
    var stamps = copy.querySelectorAll('#trustshell-stamp, .ts-stamp, #trustshell-toast, .ts-toast');
    for (var i = 0; i < stamps.length; i++) {
      if (stamps[i] && typeof stamps[i].remove === 'function') stamps[i].remove();
    }
  }
  return ((copy && copy.textContent) || '').trim();
}

function stampWord(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return 'not-checked';
  var lines = text.split(/\r?\n/);
  var last = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim().toLowerCase();
    if (line.length > 0) last = line;
  }
  if (last === 'pass' || last === 'veto' || last === 'not-checked') return last;
  return 'not-checked';
}

function toastApi() {
  if (typeof globalThis !== 'undefined' && globalThis.trustshellToast) return globalThis.trustshellToast;
  if (typeof require === 'function') {
    try {
      return require('./toast.js');
    } catch (err) {
      return null;
    }
  }
  return null;
}

/** A veto shows the toast. A pass, a timeout, and not-checked show nothing. */
function showToast(reply, word) {
  var toast = toastApi();
  if (!toast || !reply || typeof toast.placeToast !== 'function' || typeof toast.toastFor !== 'function') return;
  toast.placeToast(reply, toast.toastFor(word));
}

function paint(doc, reply, word) {
  var stamp = typeof doc.getElementById === 'function' ? doc.getElementById('trustshell-stamp') : null;
  var placed = false;
  if (stamp && stamp.dataset && stamp.dataset.stamp === word && stamp.textContent === word) {
    if (reply) placed = stamp.previousElementSibling === reply;
    else placed = stamp.parentNode === ((doc.querySelector && doc.querySelector('main')) || doc.body);
  }
  if (placed) return stamp;

  if (!stamp && typeof doc.createElement === 'function') {
    stamp = doc.createElement('div');
    stamp.id = 'trustshell-stamp';
    stamp.className = 'ts-stamp';
    if (typeof stamp.setAttribute === 'function') stamp.setAttribute('role', 'status');
  }
  if (!stamp) return null;
  if (!stamp.dataset) stamp.dataset = {};
  stamp.dataset.stamp = word;
  stamp.textContent = word;

  if (reply && typeof reply.insertAdjacentElement === 'function') {
    reply.insertAdjacentElement('afterend', stamp);
    showToast(reply, word);
    return stamp;
  }
  var host = (typeof doc.querySelector === 'function' && doc.querySelector('main')) || doc.body;
  if (host && typeof host.appendChild === 'function') host.appendChild(stamp);
  return stamp;
}

/** A missing reply is not-checked. A present reply uses the chatgpt.com last-line stamp. */
function grokReply(doc) {
  var node = lastGrok(doc);
  var text = node ? readText(node) : '';
  if (!node || text.length === 0) return { text: '', stamp: 'not-checked', node: node };
  return { text: text, stamp: stampWord(text), node: node };
}

function draw(doc) {
  if (!doc) return null;
  var read = grokReply(doc);
  return paint(doc, read.node, read.stamp);
}

function install(doc) {
  if (!doc || !doc.documentElement) return;
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var view = doc.defaultView;
    var raf = view && view.requestAnimationFrame;
    if (typeof raf === 'function') {
      raf.call(view, function () {
        scheduled = false;
        draw(doc);
      });
      return;
    }
    scheduled = false;
    draw(doc);
  }
  schedule();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

var api = {
  lastGrok: lastGrok,
  readText: readText,
  stampWord: stampWord,
  grokReply: grokReply,
  draw: draw,
  install: install,
};
if (typeof module === 'object' && module && module.exports) {
  module.exports = api;
} else if (typeof document !== 'undefined') {
  install(document);
}
