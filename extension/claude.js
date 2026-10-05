/**
 * Reads the last assistant reply on claude.ai.
 * A missing or empty reply is not-checked.
 * This script does not click, type, or send.
 */
'use strict';

var SELECTOR =
  '.font-claude-message, [data-testid="assistant-message"], [data-testid="chat-message-assistant"]';

function outermost(nodes) {
  return nodes.filter(function (node) {
    return !nodes.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function lastClaude(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  var nodes = outermost(Array.prototype.slice.call(doc.querySelectorAll(SELECTOR)));
  return nodes.length > 0 ? nodes[nodes.length - 1] : null;
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

function classifyApi() {
  if (typeof globalThis !== 'undefined' && globalThis.trustshellClassify && globalThis.trustshellClassify.classifyReply) {
    return globalThis.trustshellClassify;
  }
  if (typeof require === 'function') {
    try {
      return require('./classify.js');
    } catch (err) {
      return null;
    }
  }
  return null;
}

/** Paint the classifier label. The last line of the reply is not a label. */
function classifyReply(text, options) {
  var api = classifyApi();
  if (!api) return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
  return api.classifyReply(text, options);
}

function ask(text, options) {
  if (typeof text !== 'string' || text.trim().length === 0) return Promise.resolve('not-checked');
  return classifyReply(text, options).then(function (row) {
    var label = row && row.label;
    if (label === 'pass' || label === 'veto' || label === 'not-checked') return label;
    return 'not-checked';
  });
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

/** True when the stamp already shows this state. Without classify.js only Not checked is shown. */
function shows(stamp, word) {
  var api = classifyApi();
  if (api && typeof api.stampShows === 'function') return api.stampShows(stamp, word);
  return Boolean(stamp && stamp.dataset && stamp.dataset.stamp === 'not-checked' && stamp.textContent === 'Not checked');
}

/** classify.js owns the words. If it did not load, nothing was checked, whatever word arrived. */
function setState(stamp, word) {
  var api = classifyApi();
  if (api && typeof api.paintStamp === 'function') return api.paintStamp(stamp, word);
  if (!stamp.dataset) stamp.dataset = {};
  stamp.dataset.stamp = 'not-checked';
  stamp.textContent = 'Not checked';
  stamp.title = 'not-checked';
  return stamp;
}

/** The browser path (no options) shares classify.js's cache. A row it already holds needs no Checking stamp. */
function alreadyKnown(text, options) {
  if (options !== undefined) return false;
  var api = classifyApi();
  return Boolean(api && typeof api.knownRow === 'function' && api.knownRow(text));
}

/** A veto shows the toast. A pass, a timeout, not-checked and checking show nothing. */
function showToast(reply, word) {
  var toast = toastApi();
  if (!toast || !reply || typeof toast.placeToast !== 'function' || typeof toast.toastFor !== 'function') return;
  toast.placeToast(reply, toast.toastFor(word));
}

function showLine(doc, stamp, line) {
  var api = classifyApi();
  if (api && typeof api.showCheckLine === 'function') api.showCheckLine(doc, stamp, line || '');
}

function paint(doc, reply, word, line) {
  var stamp = typeof doc.getElementById === 'function' ? doc.getElementById('trustshell-stamp') : null;
  var placed = false;
  if (shows(stamp, word)) {
    if (reply) placed = stamp.previousElementSibling === reply;
    else placed = stamp.parentNode === ((doc.querySelector && doc.querySelector('main')) || doc.body);
  }
  if (placed) {
    showLine(doc, stamp, line);
    return stamp;
  }

  if (!stamp && typeof doc.createElement === 'function') {
    stamp = doc.createElement('div');
    stamp.id = 'trustshell-stamp';
    stamp.className = 'ts-stamp';
    if (typeof stamp.setAttribute === 'function') stamp.setAttribute('role', 'status');
  }
  if (!stamp) return null;
  setState(stamp, word);

  if (reply && typeof reply.insertAdjacentElement === 'function') {
    reply.insertAdjacentElement('afterend', stamp);
    showToast(reply, word);
    showLine(doc, stamp, line);
    return stamp;
  }
  var host = (typeof doc.querySelector === 'function' && doc.querySelector('main')) || doc.body;
  if (host && typeof host.appendChild === 'function') host.appendChild(stamp);
  showLine(doc, stamp, line);
  return stamp;
}

/** A missing reply is not-checked and is not sent to verify.js. */
function claudeReply(doc, options) {
  var node = lastClaude(doc);
  var text = node ? readText(node) : '';
  if (!node || text.length === 0) return { text: '', stamp: 'not-checked', node: node, line: '' };
  return classifyReply(text, options).then(function (row) {
    var api = classifyApi();
    var label = row && row.label;
    var stamp = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
    var line = api && typeof api.lineFor === 'function' ? api.lineFor(row) : '';
    return { text: text, stamp: stamp, node: node, line: line };
  });
}

/** Each draw takes a number. Only the newest may paint its answer. */
var drawSeq = 0;

function draw(doc, options) {
  if (!doc) return Promise.resolve(null);
  var mine = ++drawSeq;
  var node = lastClaude(doc);
  var text = node ? readText(node) : '';
  // The call is out: say so, rather than leave the reply unmarked while it runs.
  if (node && text.length > 0 && !alreadyKnown(text, options)) paint(doc, node, 'checking', '');
  var read = claudeReply(doc, options);
  if (!read || typeof read.then !== 'function') return Promise.resolve(paint(doc, read.node, read.stamp, read.line));
  function current() {
    return typeof doc.getElementById === 'function' ? doc.getElementById('trustshell-stamp') : null;
  }
  return read.then(
    function (row) {
      // A newer draw owns the stamp. Painting this older answer would label text it never read.
      if (mine !== drawSeq) return current();
      return paint(doc, row.node, row.stamp, row.line);
    },
    function () {
      // A failure is never left as Checking, and never shown as Checks out.
      if (mine !== drawSeq) return current();
      return paint(doc, node, 'not-checked', '');
    }
  );
}

function install(doc) {
  if (!doc || !doc.documentElement) return;
  function schedule() {
    var api = classifyApi();
    if (api && typeof api.whenSettled === 'function') api.whenSettled(function () { draw(doc); });
    else draw(doc);
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
  lastClaude: lastClaude,
  readText: readText,
  classifyReply: classifyReply,
  claudeReply: claudeReply,
  draw: draw,
  install: install,
};
if (typeof module === 'object' && module && module.exports) {
  module.exports = api;
} else if (typeof document !== 'undefined') {
  install(document);
}
