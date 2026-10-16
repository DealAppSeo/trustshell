'use strict';

importScripts('settings.js', 'scrub.js', 'laya.js', 'classify.js', 'select.js');

/**
 * The record on the Options page (Your TrustShell). A chat-site tab reports a stamp it painted:
 * the label, how it was reached and who decided. The site is read from that tab's own URL, never
 * from the message, and the message carries no text. This is the one writer, so two tabs stamping
 * at once cannot overwrite each other's entry.
 */
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'trustshell-record') return;
  if (!sender || sender.id !== chrome.runtime.id) return;
  const api = globalThis.trustshellSettings;
  const local = chrome.storage && chrome.storage.local;
  if (!api || !local) return;
  const entry = api.recordEntry(message, sender.url || (sender.tab && sender.tab.url), Date.now());
  if (entry) api.addToRecord(local, entry);
});

/**
 * SEC F1 (2026-10-16): a fresh install sends nothing. Every chat site is off and checks run only on a
 * click until the person switches a site on, on the Options page, which says first what is sent and
 * where. So that page opens by itself when nothing has been chosen yet: at install, and at an update
 * of an install that never saved a choice (its sites just went from on to off, and it should see why).
 * An install that saved settings keeps them and opens nothing.
 */
if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    const reason = details && details.reason;
    if (reason !== 'install' && reason !== 'update') return;
    const api = globalThis.trustshellSettings;
    const local = chrome.storage && chrome.storage.local;
    if (!api || !local) return;
    local.get([api.SETTINGS_KEY], (stored) => {
      if (chrome.runtime.lastError) return;
      if (stored && stored[api.SETTINGS_KEY] !== undefined) return;
      // A tab of its own, not openOptionsPage: that opens the small dialog inside chrome://extensions,
      // and this page is meant to be read before anything is switched on.
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    });
  });
}
