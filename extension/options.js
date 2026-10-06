/* The Options page (Your TrustShell). Names stay inside this function. */
(function () {
  'use strict';

  /**
   * Three things, all in chrome.storage.local on this device, none ever sent:
   * where it checks (a switch per chat site), when it checks (automatically, or only when the
   * person clicks Check this reply), and the record of the last stamps, with Download and Clear.
   * The page redraws whenever storage changes, so a stamp painted in another tab appears here.
   * There is no key box and no route switch: the checkers are the engine's, named on the privacy page.
   */
  function settingsApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellSettings) return globalThis.trustshellSettings;
    return typeof require === 'function' ? require('./settings.js') : null;
  }

  function classifyApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellClassify) return globalThis.trustshellClassify;
    return typeof require === 'function' ? require('./classify.js') : null;
  }

  /** The stamp's own words, from classify.js, so the record and the stamp cannot disagree. */
  function word(label) {
    const api = classifyApi();
    const words = api && api.STAMP_WORDS;
    return (words && words[label]) || 'Not checked';
  }

  function when(at) {
    try {
      return new Date(at).toLocaleString();
    } catch (_err) {
      return '';
    }
  }

  function inputs(doc, name) {
    return Array.prototype.slice.call(doc.querySelectorAll('input[name="' + name + '"]'));
  }

  function renderSettings(doc, raw) {
    const settings = settingsApi().normalSettings(raw);
    for (const box of inputs(doc, 'site')) box.checked = settings.sites[box.value] === true;
    for (const radio of inputs(doc, 'mode')) radio.checked = radio.value === settings.mode;
    return settings;
  }

  function readSettings(doc) {
    const api = settingsApi();
    const sites = {};
    for (const box of inputs(doc, 'site')) sites[box.value] = Boolean(box.checked);
    const click = inputs(doc, 'mode').some((r) => r.checked && r.value === api.CLICK);
    return api.normalSettings({ sites, mode: click ? api.CLICK : api.AUTO });
  }

  /** "Groq and Cerebras both said false." for the last stamp, or '' when it was not votes. */
  function lastLine(entry) {
    const api = classifyApi();
    if (!entry || !entry.by || !api || typeof api.pathLine !== 'function') return '';
    return api.pathLine({ label: entry.label, by: entry.by, deciders: entry.deciders, voters: entry.deciders });
  }

  function renderRecord(doc, raw) {
    const api = settingsApi();
    const record = api.normalRecord(raw);
    const c = record.counts;
    const counts = doc.querySelector('#record-counts');
    if (counts) {
      counts.textContent =
        word('pass') + ' ' + c.pass + ' · ' + word('veto') + ' ' + c.veto + ' · ' + word('not-checked') + ' ' + c['not-checked'];
    }
    const last = doc.querySelector('#record-last');
    const first = record.recent[0];
    if (last) {
      if (!first) last.textContent = 'No stamps yet.';
      else {
        const line = lastLine(first);
        // The stamp's first line only: Caught carries a second line that belongs on the stamp.
        const stamp = word(first.label).split('\n')[0];
        last.textContent =
          'Last stamp: ' + stamp + ' on ' + api.siteName(first.site) + ', ' + when(first.at) + '.' + (line ? ' ' + line : '');
      }
    }
    const list = doc.querySelector('#record-recent');
    if (list) {
      while (list.firstChild) list.removeChild(list.firstChild);
      for (const entry of record.recent) {
        const li = doc.createElement('li');
        li.textContent = word(entry.label).split('\n')[0] + ', ' + api.siteName(entry.site) + ', ' + when(entry.at);
        list.appendChild(li);
      }
    }
    return record;
  }

  /** What Download saves: the record as it is kept, with the stamp words and site names spelled out. */
  function downloadText(raw) {
    const api = settingsApi();
    const record = api.normalRecord(raw);
    return JSON.stringify(
      {
        counts: record.counts,
        recent: record.recent.map((e) => ({
          stamp: word(e.label).split('\n')[0],
          label: e.label,
          site: api.siteName(e.site),
          at: new Date(e.at).toISOString(),
          decided_by: e.by,
          deciders: e.deciders,
        })),
      },
      null,
      2,
    );
  }

  function save(doc, storage) {
    const local = storage && storage.local;
    if (!local || typeof local.set !== 'function') return false;
    local.set({ [settingsApi().SETTINGS_KEY]: readSettings(doc) });
    return true;
  }

  function download(doc, raw) {
    if (typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
    const url = URL.createObjectURL(new Blob([downloadText(raw)], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = 'trustshell-record.json';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  /** Clear takes two clicks, so one stray click cannot erase the record. */
  const CLEAR = 'Clear';
  const CONFIRM = 'Click again to clear';

  function clearClick(button, storage) {
    if (button.textContent !== CONFIRM) {
      button.textContent = CONFIRM;
      setTimeout(() => {
        button.textContent = CLEAR;
      }, 5000);
      return false;
    }
    button.textContent = CLEAR;
    const local = storage && storage.local;
    if (local && typeof local.remove === 'function') local.remove(settingsApi().RECORD_KEY);
    return true;
  }

  function bind(doc, storage, onChanged) {
    const api = settingsApi();
    const local = storage && storage.local;
    let record = null;
    if (local && typeof local.get === 'function') {
      local.get([api.SETTINGS_KEY, api.RECORD_KEY], (stored) => {
        renderSettings(doc, stored && stored[api.SETTINGS_KEY]);
        record = stored && stored[api.RECORD_KEY];
        renderRecord(doc, record);
      });
    } else {
      renderSettings(doc, undefined);
      renderRecord(doc, undefined);
    }
    for (const input of inputs(doc, 'site').concat(inputs(doc, 'mode'))) {
      input.addEventListener('change', () => save(doc, storage));
    }
    const dl = doc.querySelector('#record-download');
    if (dl) dl.addEventListener('click', () => download(doc, record));
    const clear = doc.querySelector('#record-clear');
    if (clear) clear.addEventListener('click', () => clearClick(clear, storage));
    if (onChanged && typeof onChanged.addListener === 'function') {
      onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes) return;
        if (changes[api.RECORD_KEY]) {
          record = changes[api.RECORD_KEY].newValue;
          renderRecord(doc, record);
        }
        if (changes[api.SETTINGS_KEY]) renderSettings(doc, changes[api.SETTINGS_KEY].newValue);
      });
    }
  }

  const api = { renderSettings, readSettings, renderRecord, downloadText, save, clearClick, bind, CLEAR, CONFIRM };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
    bind(document, chrome.storage, chrome.storage && chrome.storage.onChanged);
  }
})();
