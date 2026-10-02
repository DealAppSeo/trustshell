'use strict';

const { verifyLastReply } = require('./verify.js');

/** One line, shown only after verify.js returns pass or veto. */
const LINE = 'Name this one. It keeps your notes. It does not share them.';

/** chrome.storage.local key. A saved name means do not ask again. */
const STORAGE_KEY = 'name';

function saved(stored) {
  return typeof stored === 'string' && stored.trim().length > 0;
}

/**
 * Hidden until verify.js stamps pass or veto.
 * A keyword, a missing call, and not-checked do not ask.
 * A stored name does not ask again.
 */
async function nameField(input) {
  const box = input || {};
  if (saved(box.stored)) return { hidden: true, line: '' };
  if (typeof box.fetchImpl !== 'function') return { hidden: true, line: '' };
  const stamp = await verifyLastReply(box.text, {
    fetchImpl: box.fetchImpl,
    baseUrl: box.baseUrl,
    timeoutMs: box.timeoutMs,
  });
  if (stamp === 'pass' || stamp === 'veto') return { hidden: false, line: LINE };
  return { hidden: true, line: '' };
}

/** Write the name into extension storage. Blank is not a name. */
function saveName(storage, name) {
  const value = typeof name === 'string' ? name.trim() : '';
  const local = storage && storage.local;
  if (!value || !local || typeof local.set !== 'function') return false;
  local.set({ [STORAGE_KEY]: value });
  return true;
}

module.exports = {
  LINE,
  STORAGE_KEY,
  nameField,
  saveName,
};
