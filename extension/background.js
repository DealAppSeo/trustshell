'use strict';

importScripts('route.js', 'verify.js');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'trustshell-verify') return;
  const api = globalThis.trustshellVerify;
  if (!api || typeof api.verifyLastReply !== 'function') {
    sendResponse({ stamp: 'not-checked' });
    return;
  }
  const read = chrome.storage && chrome.storage.local && chrome.storage.local.get;
  const storedSetting = read
    ? new Promise((resolve) => chrome.storage.local.get(['route'], (stored) => resolve(stored && stored.route)))
    : Promise.resolve(undefined);
  storedSetting.then((setting) => api.verifyLastReply(message.text, { setting })).then(
    (word) => sendResponse({ stamp: word === 'pass' || word === 'veto' ? word : 'not-checked' }),
    () => sendResponse({ stamp: 'not-checked' }),
  );
  return true;
});
