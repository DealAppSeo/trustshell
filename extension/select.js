/* Service worker script. Names stay inside this function so importScripts cannot redeclare them. */
(function () {
  'use strict';

  var MENU_ID = 'trustshell-check';
  var MENU_TITLE = 'Check with TrustShell';
  var CLASSIFY_URL = 'https://repid-engine-production.up.railway.app/api/v1/classify';
  var LABELS = ['pass', 'veto', 'not-checked'];
  var wired = false;

  function layaApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellLaya && globalThis.trustshellLaya.callLaya) {
      return globalThis.trustshellLaya;
    }
    if (typeof require === 'function') {
      try {
        return require('./laya.js');
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  function labelOf(row) {
    var label = row && row.label;
    return LABELS.indexOf(label) >= 0 ? label : 'not-checked';
  }

  /** classify.js owns the stamp words, so the toast and the stamp cannot disagree. */
  function classifyApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellClassify) return globalThis.trustshellClassify;
    if (typeof require === 'function') {
      try {
        return require('./classify.js');
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  /**
   * What the toast says: the stamp's words (Checks out / Caught / Not checked), then the line
   * saying what produced the label when the endpoint said so. The machine label goes in the
   * tooltip. Without classify.js the toast falls back to the machine label, which is still true.
   */
  function toastText(row) {
    var word = labelOf(row);
    var api = classifyApi();
    var words = api && typeof api.stampText === 'function' ? api.stampText(word) : word;
    var line = api && typeof api.lineFor === 'function' ? api.lineFor(row) : '';
    return line ? words + '\n' + line : words;
  }

  /**
   * Painted in the page after a menu click. Chrome copies this function alone,
   * so it must not use anything defined outside it. `text` is what a person reads;
   * `label` (pass / veto / not-checked) goes in the tooltip and data-label.
   */
  function paintLabel(text, label) {
    var word = label === 'pass' || label === 'veto' || label === 'not-checked' ? label : 'not-checked';
    var shown = typeof text === 'string' && text.length > 0 ? text : word;
    var doc = document;
    if (!doc || typeof doc.createElement !== 'function') return word;
    var node = typeof doc.getElementById === 'function' ? doc.getElementById('trustshell-selection-toast') : null;
    if (!node) {
      node = doc.createElement('div');
      node.id = 'trustshell-selection-toast';
      if (typeof node.setAttribute === 'function') node.setAttribute('role', 'status');
      node.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:8px 12px;max-width:320px;white-space:pre-line;background:#111827;color:#fff;font:600 13px/1.4 ui-sans-serif,system-ui,sans-serif;border-radius:4px;pointer-events:none;';
      var parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === 'function') parent.appendChild(node);
    }
    node.textContent = shown;
    node.title = word;
    if (typeof node.setAttribute === 'function') node.setAttribute('data-label', word);
    return word;
  }

  function checkSelection(text, _tab, deps) {
    var options = deps || {};
    var body = typeof text === 'string' ? text.trim() : '';
    if (!body) return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
    var laya = options.laya || layaApi();
    if (!laya || typeof laya.callLaya !== 'function') return Promise.resolve({ label: 'not-checked', latency_ms: 0 });
    return Promise.resolve()
      .then(function () {
        return laya.callLaya(body, {
          modelUrl: options.modelUrl || CLASSIFY_URL,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
          now: options.now,
        });
      })
      .then(function (row) {
        var label = labelOf(row);
        var out = {
          label: label,
          latency_ms: row && typeof row.latency_ms === 'number' ? row.latency_ms : 0,
        };
        // What produced the label rides only with a label the endpoint sent.
        var api = classifyApi();
        return row && row.label === label && api ? api.copyPath(row, out) : out;
      })
      .catch(function () {
        return { label: 'not-checked', latency_ms: 0 };
      });
  }

  /** `answer` is the row from checkSelection, or a bare label. */
  function showOnTab(tab, answer, scripting) {
    var row = answer && typeof answer === 'object' ? answer : { label: answer };
    var word = labelOf(row);
    var text = toastText(row);
    var api = scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
    if (!api || typeof api.executeScript !== 'function' || !tab || typeof tab.id !== 'number') {
      return Promise.resolve(word);
    }
    return Promise.resolve()
      .then(function () {
        return api.executeScript({
          target: { tabId: tab.id },
          func: paintLabel,
          args: [text, word],
        });
      })
      .then(function () {
        return word;
      })
      .catch(function () {
        return word;
      });
  }

  function onMenuClick(info, tab, deps) {
    var selected = info && typeof info.selectionText === 'string' ? info.selectionText : '';
    return checkSelection(selected, tab, deps).then(function (row) {
      var scripting = deps && deps.scripting;
      return showOnTab(tab, row, scripting).then(function (shown) {
        return { label: row.label, latency_ms: row.latency_ms, shown: shown };
      });
    });
  }

  function install(chromeApi) {
    var menus = chromeApi && chromeApi.contextMenus;
    if (!menus || typeof menus.create !== 'function') return;
    function create() {
      var make = function () {
        menus.create({ id: MENU_ID, title: MENU_TITLE, contexts: ['selection'] });
      };
      if (typeof menus.removeAll === 'function') menus.removeAll(make);
      else make();
    }
    if (!wired && menus.onClicked && typeof menus.onClicked.addListener === 'function') {
      wired = true;
      menus.onClicked.addListener(function (info, tab) {
        onMenuClick(info, tab);
      });
    }
    create();
  }

  var api = {
    MENU_ID: MENU_ID,
    MENU_TITLE: MENU_TITLE,
    CLASSIFY_URL: CLASSIFY_URL,
    paintLabel: paintLabel,
    toastText: toastText,
    checkSelection: checkSelection,
    showOnTab: showOnTab,
    onMenuClick: onMenuClick,
    install: install,
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellSelect = api;
  if (typeof chrome !== 'undefined' && chrome.contextMenus) install(chrome);
})();
