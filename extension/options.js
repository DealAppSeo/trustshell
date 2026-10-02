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

function apply(doc, value) {
  const selected = loadRoute().settingOf(value);
  const inputs = doc.querySelectorAll('input[name="route"]');
  for (let i = 0; i < inputs.length; i++) {
    inputs[i].checked = inputs[i].value === selected;
  }
  return selected;
}

/** A missing stored switch stays my model. */
function reload(doc, storage) {
  const route = loadRoute();
  const local = storage && storage.local;
  if (!local || typeof local.get !== 'function') {
    apply(doc, undefined);
    return;
  }
  local.get([route.STORAGE_KEY], (stored) => {
    apply(doc, stored && stored[route.STORAGE_KEY]);
  });
}

function save(storage, value) {
  const route = loadRoute();
  const local = storage && storage.local;
  if (!local || typeof local.set !== 'function') return false;
  local.set({ [route.STORAGE_KEY]: route.settingOf(value) });
  return true;
}

function keyField(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const inputs = doc.querySelectorAll('input[name="key"]');
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i] && inputs[i].name === 'key') return inputs[i];
  }
  return null;
}

/** Store the key. The page text stays free of it. */
function saveKey(doc, storage) {
  const route = loadRoute();
  const local = storage && storage.local;
  if (!local || typeof local.set !== 'function') return false;
  const field = keyField(doc);
  const value = field && typeof field.value === 'string' ? field.value : '';
  local.set({ [route.KEY_STORAGE]: value });
  if (field) field.value = '';
  const note = typeof doc.querySelector === 'function' ? doc.querySelector('#key-note') : null;
  if (note) note.textContent = 'Saved.';
  return true;
}

function pageText(doc) {
  if (!doc) return '';
  if (doc.body && typeof doc.body.textContent === 'string') return doc.body.textContent;
  if (typeof doc.textContent === 'string') return doc.textContent;
  const note = typeof doc.querySelector === 'function' ? doc.querySelector('#key-note') : null;
  return note && typeof note.textContent === 'string' ? note.textContent : '';
}

function bind(doc, storage) {
  reload(doc, storage);
  const inputs = doc.querySelectorAll('input[name="route"]');
  for (let i = 0; i < inputs.length; i++) {
    if (!inputs[i] || typeof inputs[i].addEventListener !== 'function') continue;
    if (inputs[i].name === 'key') continue;
    inputs[i].addEventListener('change', () => {
      if (!inputs[i].checked) return;
      save(storage, inputs[i].value);
    });
  }
  const button = typeof doc.querySelector === 'function' ? doc.querySelector('#save-key') : null;
  if (button && typeof button.addEventListener === 'function') {
    button.addEventListener('click', () => {
      saveKey(doc, storage);
    });
  }
}

if (typeof document !== 'undefined' && !(typeof module === 'object' && module && module.exports)) {
  bind(document, typeof chrome !== 'undefined' ? chrome.storage : null);
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { lines, bind, reload, save, saveKey, pageText };
}
