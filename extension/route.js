'use strict';

const MY_MODEL = 'my model';
const CHEAP_FIRST = 'cheap first';
const DEFAULT_SETTING = MY_MODEL;

function settingOf(value) {
  return value === CHEAP_FIRST ? CHEAP_FIRST : DEFAULT_SETTING;
}

/** Either setting still runs the check. */
function checkRuns(value) {
  settingOf(value);
  return true;
}

const api = {
  MY_MODEL,
  CHEAP_FIRST,
  DEFAULT_SETTING,
  settingOf,
  checkRuns,
};

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellRoute = api;
