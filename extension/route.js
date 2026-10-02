'use strict';

const MY_MODEL = 'my model';
const CHEAP_FIRST = 'cheap first';
const DEFAULT_SETTING = MY_MODEL;

/** Open-source hosts. Their model is the check, not the writer. */
const OPEN_SOURCE_HOSTS = ['groq', 'cerebras', 'deepseek', 'mistral', 'qwen'];
const WRITER = 'my-model';

function settingOf(value) {
  return value === CHEAP_FIRST ? CHEAP_FIRST : DEFAULT_SETTING;
}

function orderFor(value) {
  const checks = OPEN_SOURCE_HOSTS.map((host) => ({ host, role: 'check' }));
  const mine = { host: WRITER, role: 'writer' };
  if (settingOf(value) === CHEAP_FIRST) return checks.concat([mine]);
  return [mine].concat(checks);
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
  OPEN_SOURCE_HOSTS,
  WRITER,
  orderFor,
};

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellRoute = api;
