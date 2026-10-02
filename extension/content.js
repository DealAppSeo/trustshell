/**
 * Reads the last assistant reply on chatgpt.com and draws one stamp under it.
 * The stamp is the classifier's label. The reply's own words are never the label:
 * a reply that ends in "veto" is not a veto unless the classifier says veto.
 * A missing reply, a missing classifier, a timeout, and an empty body are not-checked.
 * This script does not click, type, or send.
 */
'use strict';

var STAMP_ID = 'trustshell-stamp';
var LABELS = ['pass', 'veto', 'not-checked'];

function assistantNodes(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  var nodes = Array.prototype.slice.call(
    doc.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"]')
  );
  return nodes.filter(function (node) {
    return !nodes.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function readText(node) {
  if (!node || typeof node.cloneNode !== 'function') return '';
  var copy = node.cloneNode(true);
  if (copy && typeof copy.querySelectorAll === 'function') {
    var stamps = copy.querySelectorAll('#' + STAMP_ID + ', .ts-stamp, #trustshell-toast, .ts-toast');
    for (var i = 0; i < stamps.length; i++) {
      if (stamps[i] && typeof stamps[i].remove === 'function') stamps[i].remove();
    }
  }
  return ((copy && copy.textContent) || '').trim();
}

function load(name, file) {
  if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  if (typeof require === 'function') {
    try {
      return require(file);
    } catch {
      return null;
    }
  }
  return null;
}

/** classify.js is the only source of a label. Not loaded is not-checked. */
function classifyRow(text, options) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
  }
  var api = load('trustshellClassify', './classify.js');
  if (!api || typeof api.classifyReply !== 'function') {
    return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
  }
  return Promise.resolve()
    .then(function () {
      return api.classifyReply(text, options);
    })
    .then(function (row) {
      var label = row && row.label;
      return {
        label: LABELS.indexOf(label) >= 0 ? label : 'not-checked',
        latency_ms: row && typeof row.latency_ms === 'number' ? row.latency_ms : 0,
      };
    })
    .catch(function () {
      return { label: 'not-checked', latency_ms: 0 };
    });
}

/** A veto shows the toast. A pass, a timeout, and not-checked show nothing. */
function showToast(reply, word) {
  var api = load('trustshellToast', './toast.js');
  if (!api || !reply || typeof api.placeToast !== 'function' || typeof api.toastFor !== 'function') return;
  api.placeToast(reply, api.toastFor(word));
}

function showLine(doc, stamp, row) {
  var api = load('trustshellClassify', './classify.js');
  if (!api || typeof api.lineFor !== 'function' || typeof api.showCheckLine !== 'function') return;
  api.showCheckLine(doc, stamp, api.lineFor(row) || '');
}

function paint(doc, last, row) {
  var word = row.label;
  var stamp = doc.getElementById(STAMP_ID);
  var placed = false;
  if (stamp && stamp.dataset && stamp.dataset.stamp === word && stamp.textContent === word) {
    if (last) placed = stamp.previousElementSibling === last;
    else placed = stamp.parentNode === (doc.querySelector('main') || doc.body);
  }
  if (placed) {
    showLine(doc, stamp, row);
    return stamp;
  }

  if (!stamp) {
    stamp = doc.createElement('div');
    stamp.id = STAMP_ID;
    stamp.className = 'ts-stamp';
    stamp.setAttribute('role', 'status');
  }
  if (!stamp.dataset) stamp.dataset = {};
  stamp.dataset.stamp = word;
  stamp.textContent = word;

  if (last) {
    last.insertAdjacentElement('afterend', stamp);
    showToast(last, word);
    showLine(doc, stamp, row);
    return stamp;
  }
  var host = doc.querySelector('main') || doc.body;
  host.appendChild(stamp);
  showLine(doc, stamp, row);
  return stamp;
}

function draw(doc, options) {
  if (!doc) return Promise.resolve(null);
  var nodes = assistantNodes(doc);
  var last = nodes.length > 0 ? nodes[nodes.length - 1] : null;
  var text = last ? readText(last) : '';
  return classifyRow(text, options).then(function (row) {
    return paint(doc, last, row);
  });
}

function install(doc) {
  if (!doc || !doc.documentElement) return;
  var scheduled = false;
  var view = doc.defaultView;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = view && view.requestAnimationFrame;
    var run = function () {
      scheduled = false;
      draw(doc);
    };
    if (typeof raf === 'function') raf.call(view, run);
    else run();
  }
  schedule();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(doc.documentElement, { childList: true, subtree: true });
  }
}

var api = { assistantNodes: assistantNodes, readText: readText, classifyRow: classifyRow, draw: draw, install: install };
if (typeof module === 'object' && module && module.exports) {
  module.exports = api;
} else if (typeof document !== 'undefined') {
  install(document);
}
