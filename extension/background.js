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
