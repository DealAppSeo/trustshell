/**
 * Reads the last assistant reply and stamps the evaluate result.
 * A missing reply is not-checked.
 * This script does not click, type, or send the chat.
 */
(function () {
  var STAMP_ID = 'trustshell-stamp';
  var scheduled = false;
  var seq = 0;
  var seenText = null;
  var seenWord = 'not-checked';

  function verifyApi() {
    if (typeof require === 'function') {
      try {
        return require('./verify.js');
      } catch (err) {
        /* A classic content script has no require. */
      }
    }
    if (typeof globalThis !== 'undefined') return globalThis.trustshellVerify;
    return null;
  }

  function outermost(nodes) {
    return nodes.filter(function (node) {
      return !nodes.some(function (other) {
        return other !== node && other.contains && other.contains(node);
      });
    });
  }

  function readChatGpt(doc) {
    return outermost(
      Array.prototype.slice.call(
        doc.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"]')
      )
    );
  }

  function readClaude(doc) {
    return outermost(
      Array.prototype.slice.call(
        doc.querySelectorAll(
          '.font-claude-message, [data-testid="assistant-message"], [data-testid="chat-message-assistant"]'
        )
      )
    );
  }

  function lastNode(doc) {
    var host = doc.location && doc.location.hostname;
    var nodes = host === 'claude.ai' ? readClaude(doc) : readChatGpt(doc);
    return nodes.length > 0 ? nodes[nodes.length - 1] : null;
  }

  function readText(node) {
    var copy = node.cloneNode(true);
    var stamps = copy.querySelectorAll('#' + STAMP_ID + ', .ts-stamp');
    for (var i = 0; i < stamps.length; i++) stamps[i].remove();
    return (copy.textContent || '').trim();
  }

  function asStamp(word) {
    if (word === 'pass' || word === 'veto' || word === 'not-checked') return word;
    return 'not-checked';
  }

  function paint(doc, anchor, word) {
    var safe = asStamp(word);
    var stamp = doc.getElementById(STAMP_ID);
    if (!stamp) {
      stamp = doc.createElement('div');
      stamp.id = STAMP_ID;
      stamp.className = 'ts-stamp';
      if (stamp.setAttribute) stamp.setAttribute('role', 'status');
    }
    stamp.dataset.stamp = safe;
    stamp.textContent = safe;
    if (anchor && anchor.insertAdjacentElement) {
      anchor.insertAdjacentElement('afterend', stamp);
      return stamp;
    }
    var host = (doc.querySelector && doc.querySelector('main')) || doc.body;
    if (host && host.appendChild) host.appendChild(stamp);
    return stamp;
  }

  async function stampLastReply(doc, stillCurrent) {
    var last = lastNode(doc);
    var text = last ? readText(last) : '';
    if (!last || !text) {
      if (stillCurrent && !stillCurrent()) return null;
      return paint(doc, last, 'not-checked');
    }
    var api = verifyApi();
    var word = 'not-checked';
    if (api && typeof api.verifyLastReply === 'function') {
      try {
        word = await api.verifyLastReply(text);
      } catch (err) {
        word = 'not-checked';
      }
    }
    if (stillCurrent && !stillCurrent()) return null;
    return paint(doc, last, word);
  }

  function draw() {
    var ticket = ++seq;
    var last = lastNode(document);
    var text = last ? readText(last) : '';
    if (text && text === seenText) {
      paint(document, last, seenWord);
      return;
    }
    stampLastReply(document, function () { return ticket === seq; }).then(function (stamp) {
      if (!stamp || ticket !== seq) return;
      seenText = text;
      seenWord = asStamp(stamp.dataset && stamp.dataset.stamp);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var frame = globalThis.requestAnimationFrame || function (fn) { return setTimeout(fn, 0); };
    frame(function () {
      scheduled = false;
      draw();
    });
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      stampLastReply: stampLastReply,
      readClaude: readClaude,
      readChatGpt: readChatGpt,
    };
  } else if (typeof document !== 'undefined') {
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
