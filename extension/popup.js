/* Service worker scripts share one global scope. Names stay inside this function. */
(function () {
'use strict';

const POPUP_KEY = 'popupLine';

/** Classifier label: pass, veto, or not-checked. A miss is not-checked, not 0. */
function popupLine(word) {
  if (word === 0 || word === '0') return 'not-checked';
  if (word === 'pass' || word === 'veto' || word === 'not-checked') return word;
  return 'not-checked';
}

function render(doc, word) {
  const line = popupLine(word);
  const node = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#popup-line') : null;
  if (node) node.textContent = line;
  return line;
}

function load(doc, storage) {
  const local = storage && storage.local;
  if (!local || typeof local.get !== 'function') return render(doc, undefined);
  local.get([POPUP_KEY], (stored) => {
    render(doc, stored && stored[POPUP_KEY]);
  });
  return popupLine(undefined);
}

if (typeof document !== 'undefined' && !(typeof module === 'object' && module && module.exports)) {
  load(document, typeof chrome !== 'undefined' ? chrome.storage : null);
}

const api = { POPUP_KEY, popupLine, render, load };
if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellPopup = api;
})();
