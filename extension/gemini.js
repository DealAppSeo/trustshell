/**
 * Reads the last assistant reply on gemini.google.com.
 * A missing or empty reply is not-checked.
 * This script does not click, type, or send.
 */
'use strict';

var SELECTOR = 'model-response, message-content.model-response-text, .model-response-text';

function outermost(nodes) {
  return nodes.filter(function (node) {
    return !nodes.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function lastGemini(doc) {
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

var CLASSIFY_LABELS = ['pass', 'veto', 'not-checked'];

/**
 * One classifier call. The last line is not read as a label.
 * A missing endpoint, a timeout, and an empty body are not-checked, never 0, never pass.
 * The reply text is not printed.
 */
function classifyReply(text, options) {
  var opts = options || {};
  var started = Date.now();
  function finish(label) {
    var safe = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
    return { label: safe, latency_ms: Date.now() - started };
  }
  var endpoint = Object.prototype.hasOwnProperty.call(opts, 'endpoint')
    ? opts.endpoint
    : String(opts.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '') + '/api/v1/classify';
  var fetchImpl = opts.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (typeof endpoint !== 'string' || endpoint.trim() === '' || /anthropic/i.test(endpoint) || typeof fetchImpl !== 'function') {
    return Promise.resolve(finish('not-checked'));
  }
  var timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () {
    if (controller) controller.abort();
  }, timeoutMs);
  return Promise.resolve()
    .then(function () {
      return fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(text == null ? '' : text), labels: CLASSIFY_LABELS }),
        signal: controller ? controller.signal : undefined,
      });
    })
    .then(function (res) {
      if (!res || res.status !== 200 || typeof res.json !== 'function') return finish('not-checked');
      return Promise.resolve()
        .then(function () { return res.json(); })
        .then(function (body) {
          if (body == null || body === '' || typeof body !== 'object') return finish('not-checked');
          return finish(typeof body.label === 'string' ? body.label.trim().toLowerCase() : 'not-checked');
        })
        .catch(function () { return finish('not-checked'); });
    })
    .catch(function () { return finish('not-checked'); })
    .then(function (row) {
      clearTimeout(timer);
      return row;
    });
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

/** A missing reply is not-checked and is not sent to verify.js. */
function geminiReply(doc, options) {
  var node = lastGemini(doc);
  var text = node ? readText(node) : '';
  if (!node || text.length === 0) return { text: '', stamp: 'not-checked', node: node };
  return ask(text, options).then(function (stamp) {
    return { text: text, stamp: stamp, node: node };
  });
}

function draw(doc, options) {
  if (!doc) return Promise.resolve(null);
  var read = geminiReply(doc, options);
  if (!read || typeof read.then !== 'function') return Promise.resolve(paint(doc, read.node, read.stamp));
  return read.then(function (row) {
    return paint(doc, row.node, row.stamp);
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
  lastGemini: lastGemini,
  readText: readText,
  classifyReply: classifyReply,
  geminiReply: geminiReply,
  draw: draw,
  install: install,
};
if (typeof module === 'object' && module && module.exports) {
  module.exports = api;
} else if (typeof document !== 'undefined') {
  install(document);
}
