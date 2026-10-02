/* Content scripts in one manifest entry share one global scope. Each shared script keeps its
   names inside this function so two files can never redeclare the same top-level name. */
(function () {
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

  /** Keep the toast on the reply. No click, no typing, no send. */
  function placeToast(reply, text) {
    if (!reply || typeof reply.appendChild !== 'function' || typeof reply.querySelector !== 'function') {
      return null;
    }
    const existing = reply.querySelector('#trustshell-toast');
    if (!text) {
      if (existing && typeof existing.remove === 'function') existing.remove();
      return null;
    }
    const doc = reply.ownerDocument;
    const toast = existing || (doc && typeof doc.createElement === 'function' ? doc.createElement('div') : null);
    if (!toast) return null;
    toast.id = 'trustshell-toast';
    toast.className = 'ts-toast';
    if (typeof toast.setAttribute === 'function') toast.setAttribute('role', 'status');
    toast.textContent = text;
    if (!existing) reply.appendChild(toast);
    return toast;
  }

  const api = { CAUGHT, toastFor, placeToast };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellToast = api;
})();
