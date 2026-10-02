'use strict';

const CAUGHT = 'Caught. This reply did not pass.';

/** A veto is a catch. A pass, a timeout, and not-checked show nothing. */
function toastFor(result) {
  if (result === 'veto') return CAUGHT;
  if (result === 'pass' || result === 'timeout' || result === 'not-checked') return '';
  return '';
}

const api = { CAUGHT, toastFor };
if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellToast = api;
