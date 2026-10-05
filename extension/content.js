/* Content scripts in one manifest entry share one global scope. Each shared script keeps its
   names inside this function so two files can never redeclare the same top-level name. */
(function () {
  'use strict';

  /**
   * Reads the last assistant reply on chatgpt.com and draws one stamp under it.
   * The stamp is the classifier's label. The reply's own words are never the label:
   * a reply that ends in "veto" is not a veto unless the classifier says veto.
   * A missing reply, a missing classifier, a timeout, and an empty body are not-checked.
   * While the call is out the stamp says Checking; it is never left blank, because unmarked
   * text reads as true. classify.js owns the words (paintStamp).
   * This script does not click, type, or send.
   */

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

  /** True when the stamp already shows this state. Without classify.js only Not checked is shown. */
  function shows(stamp, word) {
    var api = load('trustshellClassify', './classify.js');
    if (api && typeof api.stampShows === 'function') return api.stampShows(stamp, word);
    return Boolean(stamp && stamp.dataset && stamp.dataset.stamp === 'not-checked' && stamp.textContent === 'Not checked');
  }

  /** classify.js owns the words. If it did not load, nothing was checked, whatever word arrived. */
  function setState(stamp, word) {
    var api = load('trustshellClassify', './classify.js');
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
    var api = load('trustshellClassify', './classify.js');
    return Boolean(api && typeof api.knownRow === 'function' && api.knownRow(text));
  }

  /** A veto shows the toast. A pass, a timeout, not-checked and checking show nothing. */
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
    if (shows(stamp, word)) {
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
    setState(stamp, word);

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

  /** Each draw takes a number. Only the newest may paint its answer. */
  var drawSeq = 0;

  function draw(doc, options) {
    if (!doc) return Promise.resolve(null);
    var mine = ++drawSeq;
    var nodes = assistantNodes(doc);
    var last = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    var text = last ? readText(last) : '';
    if (text && !alreadyKnown(text, options)) paint(doc, last, { label: 'checking', latency_ms: 0 });
    return classifyRow(text, options).then(function (row) {
      // A newer draw owns the stamp. Painting this older answer would label text it never read.
      if (mine !== drawSeq) return doc.getElementById(STAMP_ID);
      return paint(doc, last, row);
    });
  }

  function install(doc) {
    if (!doc || !doc.documentElement) return;
    function schedule() {
      var api = load('trustshellClassify', './classify.js');
      if (api && typeof api.whenSettled === 'function') api.whenSettled(function () { draw(doc); });
      else draw(doc);
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
})();
