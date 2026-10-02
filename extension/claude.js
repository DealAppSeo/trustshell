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

/** A veto shows the toast. A pass, a timeout, and not-checked show nothing. */
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
  if (stamp && stamp.dataset && stamp.dataset.stamp === word && stamp.textContent === word) {
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
  if (!stamp.dataset) stamp.dataset = {};
  stamp.dataset.stamp = word;
  stamp.textContent = word;

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

function draw(doc, options) {
  if (!doc) return Promise.resolve(null);
  var read = claudeReply(doc, options);
  if (!read || typeof read.then !== 'function') return Promise.resolve(paint(doc, read.node, read.stamp, read.line));
  return read.then(function (row) {
    return paint(doc, row.node, row.stamp, row.line);
  });
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
