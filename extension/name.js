'use strict';

/** One line, shown only after the first pass or veto. */
const LINE = 'Name this one. It keeps your notes. It does not share them.';

/** chrome.storage.local key. A saved name means do not ask again. */
const STORAGE_KEY = 'name';

function text(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/_/g, '-') : '';
}

function stamp(receipt) {
  if (!receipt || typeof receipt !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(receipt, 'stamp')) return text(receipt.stamp);
  if (Object.prototype.hasOwnProperty.call(receipt, 'verdict')) return text(receipt.verdict);
  const hal = receipt.hal;
  if (hal && typeof hal === 'object' && Object.prototype.hasOwnProperty.call(hal, 'verdict')) {
    return text(hal.verdict);
  }
  return '';
}

function asks(receipt) {
  const value = stamp(receipt);
  return value === 'pass' || value === 'veto';
}

function saved(stored) {
  return typeof stored === 'string' && stored.trim().length > 0;
}

/**
 * Hidden until a receipt stamp is pass or veto.
 * A not-checked stamp does not ask. A stored name does not ask again.
 */
function nameField(input) {
  const receipts = input && Array.isArray(input.receipts) ? input.receipts : [];
  const stored = input && input.stored;
  if (saved(stored) || !receipts.some(asks)) return { hidden: true, line: '' };
  return { hidden: false, line: LINE };
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
