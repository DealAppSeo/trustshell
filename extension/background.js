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
  const routeApi = globalThis.trustshellRoute;
  const storageKey = routeApi && routeApi.STORAGE_KEY ? routeApi.STORAGE_KEY : 'route';
  const keyName = routeApi && routeApi.KEY_STORAGE ? routeApi.KEY_STORAGE : 'hostKey';
  const storedSetting = read
    ? new Promise((resolve) => chrome.storage.local.get([storageKey, keyName], (stored) => {
      const setting = stored && stored[storageKey];
      const key = stored && typeof stored[keyName] === 'string' ? stored[keyName] : '';
      resolve({ setting, key });
    }))
    : Promise.resolve({ setting: undefined, key: '' });
  storedSetting.then((saved) => api.verifyLastReply(message.text, { setting: saved && saved.setting, key: saved && saved.key })).then(
    (word) => sendResponse({ stamp: word === 'pass' || word === 'veto' ? word : 'not-checked' }),
    () => sendResponse({ stamp: 'not-checked' }),
  );
  return true;
});
