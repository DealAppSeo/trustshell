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

/** A missing reply is not-checked. A present reply returns its text. */
function geminiReply(doc) {
  var node = lastGemini(doc);
  var text = node ? readText(node) : '';
  if (!node || text.length === 0) return { text: '', stamp: 'not-checked', node: node };
  return { text: text, node: node };
}

var api = { lastGemini: lastGemini, readText: readText, geminiReply: geminiReply };
if (typeof module === 'object' && module && module.exports) module.exports = api;
