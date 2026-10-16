/* Content scripts, the service worker and the Options page share this file. Names stay inside
   this function so importScripts and the manifest can never redeclare them. */
(function () {
  'use strict';

  /**
   * YOUR TRUSTSHELL (the Options page). Two things live in chrome.storage.local on this device
   * and are never sent anywhere:
   *
   * - `settings`: which chat sites are checked, and whether a reply is checked automatically or
   *   only when the person clicks Check this reply. Missing (a fresh install) means every site OFF,
   *   only when clicked: nothing is sent until the person switches a site on, on the page that opens
   *   at install and says what is sent and where (SEC F1, 2026-10-16). Automatically is a choice
   *   they make there, never the default. A mode this code does not recognise asks first (normalMode).
   * - `record`: counts of each stamp, and the last RECENT_MAX stamps with the site, the time and
   *   what decided it (`by`, and up to two `deciders` ids). Never the text. The site comes from the URL of the tab that painted the stamp, never from
   *   what that tab says about itself.
   */
  const SETTINGS_KEY = 'settings';
  const RECORD_KEY = 'record';
  const RECENT_MAX = 20;
  const AUTO = 'auto';
  const CLICK = 'click';

  /** The manifest's content-script hosts, by site. tests/extension-options.test.ts holds them equal. */
  const SITES = [
    { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'] },
    { id: 'claude', name: 'Claude', hosts: ['claude.ai'] },
    { id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'] },
    { id: 'grok', name: 'Grok', hosts: ['grok.com'] },
    { id: 'deepseek', name: 'DeepSeek', hosts: ['deepseek.com', 'chat.deepseek.com'] },
  ];

  const LABELS = ['pass', 'veto', 'not-checked'];
  /** How /classify said the label was reached (its `by`). Anything else is not recorded. */
  const BY = ['arithmetic', 'arithmetic-approx', 'votes', 'skipped', 'deadline'];
  const VOTER_ID = /^[a-z0-9-]{1,24}$/;

  /** Settings someone actually saved: a plain object. Anything else is treated as nothing stored. */
  function isStored(raw) {
    return Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
  }

  /**
   * How a reply is checked. Automatically only for an EXACT stored `auto`. Anything else is ask-first:
   * nothing stored (a fresh install, SEC F1), a wrong-case "Click", a stray word, a null, a missing key,
   * or settings that are not an object. This once read `mode === 'click' ? 'click' : 'auto'`, so every
   * value the code did not recognise FELL THROUGH TO AUTO-SEND (X-2b), and until SEC F1 a fresh install
   * auto-sent every reply on every site before the person had read what is sent where.
   */
  function normalMode(raw) {
    return isStored(raw) && raw.mode === AUTO ? AUTO : CLICK;
  }

  /**
   * Nothing stored (a fresh install): every site OFF until the person switches one on. Stored settings
   * keep their meaning for an existing install: a site is off only when it was switched off.
   */
  function normalSettings(raw) {
    const fresh = !isStored(raw);
    const stored = !fresh && raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
    const sites = {};
    for (let i = 0; i < SITES.length; i++) sites[SITES[i].id] = !fresh && stored[SITES[i].id] !== false;
    return { sites, mode: normalMode(raw) };
  }

  function siteOf(hostname) {
    const h = String(hostname || '').toLowerCase();
    for (let i = 0; i < SITES.length; i++) if (SITES[i].hosts.indexOf(h) >= 0) return SITES[i].id;
    return null;
  }

  function siteName(id) {
    for (let i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i].name;
    return '';
  }

  function siteOn(settings, site) {
    return Boolean(settings && settings.sites && site && settings.sites[site] === true);
  }

  function chromeLocal() {
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) return null;
    return typeof chrome.storage.local.get === 'function' ? chrome.storage.local : null;
  }

  function lastError() {
    return typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome.runtime.lastError : undefined;
  }

  let cached = null;
  let pending = null;

  /**
   * The person's settings, read once and then kept current by storage.onChanged. null when they
   * could not be read: the caller then checks nothing, because a site switched off must never be
   * sent from just because storage was slow to answer.
   */
  function ready(storage) {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    const local = storage ? storage.local : chromeLocal();
    if (!local || typeof local.get !== 'function') return Promise.resolve(null);
    pending = new Promise((resolve) => {
      local.get([SETTINGS_KEY], (stored) => {
        pending = null;
        if (lastError()) return resolve(null);
        cached = normalSettings(stored && stored[SETTINGS_KEY]);
        resolve(cached);
      });
    });
    return pending;
  }

  /** The settings already read, or null. Synchronous, for code that runs after ready(). */
  function current() {
    return cached;
  }

  function watch() {
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes && changes[SETTINGS_KEY]) cached = normalSettings(changes[SETTINGS_KEY].newValue);
    });
  }

  function cleanEntry(raw) {
    if (!raw || typeof raw !== 'object' || LABELS.indexOf(raw.label) < 0 || !siteName(raw.site)) return null;
    if (!Number.isFinite(raw.at)) return null;
    const deciders = Array.isArray(raw.deciders)
      ? raw.deciders.filter((d) => typeof d === 'string' && VOTER_ID.test(d)).slice(0, 2)
      : [];
    return { label: raw.label, site: raw.site, at: raw.at, by: BY.indexOf(raw.by) >= 0 ? raw.by : null, deciders };
  }

  function normalRecord(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const c = r.counts && typeof r.counts === 'object' ? r.counts : {};
    const counts = {};
    for (let i = 0; i < LABELS.length; i++) {
      const n = c[LABELS[i]];
      counts[LABELS[i]] = Number.isInteger(n) && n > 0 ? n : 0;
    }
    const recent = (Array.isArray(r.recent) ? r.recent : []).map(cleanEntry).filter(Boolean).slice(0, RECENT_MAX);
    return { counts, recent };
  }

  /**
   * One stamp a content script reported, as the record keeps it, or null. The site is read from
   * the sender's URL. The message carries no text, and nothing here would keep any.
   */
  function recordEntry(message, senderUrl, at) {
    let host = '';
    try {
      host = new URL(String(senderUrl || '')).hostname;
    } catch (_err) {
      return null;
    }
    const m = message && typeof message === 'object' ? message : {};
    return cleanEntry({ label: m.label, site: siteOf(host), at, by: m.by, deciders: m.deciders });
  }

  let chain = Promise.resolve();

  /** Adds one entry. One writer (the service worker), one write at a time, so no entry is lost. */
  function addToRecord(local, entry) {
    const clean = cleanEntry(entry);
    if (!clean || !local || typeof local.get !== 'function' || typeof local.set !== 'function') return chain;
    chain = chain.then(
      () =>
        new Promise((resolve) => {
          local.get([RECORD_KEY], (stored) => {
            const rec = normalRecord(stored && stored[RECORD_KEY]);
            rec.counts[clean.label] += 1;
            rec.recent = [clean].concat(rec.recent).slice(0, RECENT_MAX);
            local.set({ [RECORD_KEY]: rec }, () => resolve());
          });
        }),
    );
    return chain;
  }

  /** Test hook: forget the settings read so far. */
  function __reset() {
    cached = null;
    pending = null;
    chain = Promise.resolve();
  }

  const api = {
    __reset,
    SETTINGS_KEY,
    RECORD_KEY,
    RECENT_MAX,
    AUTO,
    CLICK,
    SITES,
    normalSettings,
    normalRecord,
    siteOf,
    siteName,
    siteOn,
    ready,
    current,
    recordEntry,
    addToRecord,
  };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    watch();
  }
  if (typeof globalThis === 'object') globalThis.trustshellSettings = api;
})();
