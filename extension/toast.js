'use strict';

const CAUGHT = 'Caught. This reply did not pass.';

function quiet(result) {
  return result === 'pass' || result === 'timeout' || result === 'not-checked';
}

/**
 * A veto is a catch. A pass, a timeout, and not-checked show nothing.
 * A score below the stated line is the same catch. A missing score is not.
 */
function toastFor(result) {
  if (result === 'veto') return CAUGHT;
  if (quiet(result)) return '';
  if (!result || typeof result !== 'object') return '';
  if (result.result === 'veto' || result.stamp === 'veto') return CAUGHT;
  if (quiet(result.result) || quiet(result.stamp)) return '';
  if (result.score === undefined || result.score === null || result.score === '') return '';
  if (typeof result.score !== 'number' || typeof result.line !== 'number') return '';
  if (result.score < result.line) return CAUGHT;
  return '';
}

const api = { CAUGHT, toastFor };
if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellToast = api;
