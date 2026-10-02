'use strict';

function loadRoute() {
  if (typeof require === 'function') {
    try {
      return require('./route.js');
    } catch (_err) {
      /* options page loads route.js first */
    }
  }
  return globalThis.trustshellRoute;
}

/** One line each: what the switch does. */
function lines() {
  return [
    'My model: the check still runs.',
    'Cheap first: open-source hosts first, their model only checks.',
  ];
}

function bind(doc, storage) {
  const local = storage && storage.local;
  const inputs = doc.querySelectorAll('input[name="route"]');
  if (local && typeof local.get === 'function') {
    local.get(['route'], (stored) => {
      const selected = loadRoute().settingOf(stored && stored.route);
      for (let i = 0; i < inputs.length; i++) {
        inputs[i].checked = inputs[i].value === selected;
      }
    });
  }
  for (let i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('change', () => {
      if (!inputs[i].checked || !local || typeof local.set !== 'function') return;
      local.set({ route: loadRoute().settingOf(inputs[i].value) });
    });
  }
}

if (typeof document !== 'undefined' && !(typeof module === 'object' && module && module.exports)) {
  bind(document, typeof chrome !== 'undefined' ? chrome.storage : null);
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { lines, bind };
}
