/* Content scripts, the service worker and the Options page share this file. Names stay inside
   this function so importScripts and the manifest can never redeclare them. */
(function () {
  'use strict';

  /**
   * YOUR TRUSTSHELL (the Options page). Two things live in chrome.storage.local on this device
   * and are never sent anywhere:
   *
   * - `settings`: which chat sites are checked, and whether a reply is checked automatically or
   *   only when the person clicks Check this reply. Missing means every site on, automatically:
   *   what the extension did before the page existed.
   * - `record`: counts of each stamp, and the last RECENT_MAX stamps with the site and the time.
   *   Never the text. The site comes from the URL of the tab that painted the stamp, never from
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
  const BY = ['arithmetic', 'votes', 'skipped', 'deadline'];
  const VOTER_ID = /^[a-z0-9-]{1,24}$/;

  /** A site is off only when it was switched off. The mode is click only when it was chosen. */
  function normalSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const stored = r.sites && typeof r.sites === 'object' ? r.sites : {};
    const sites = {};
    for (let i = 0; i < SITES.length; i++) sites[SITES[i].id] = stored[SITES[i].id] !== false;
    return { sites, mode: r.mode === CLICK ? CLICK : AUTO };
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
