'use strict';

importScripts('verify.js');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'trustshell-verify') return;
  const api = globalThis.trustshellVerify;
  if (!api || typeof api.verifyLastReply !== 'function') {
    sendResponse({ stamp: 'not-checked' });
    return;
  }
  api.verifyLastReply(message.text).then(
    (word) => sendResponse({ stamp: word === 'pass' || word === 'veto' ? word : 'not-checked' }),
    () => sendResponse({ stamp: 'not-checked' }),
  );
  return true;
});
