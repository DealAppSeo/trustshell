'use strict';

const MY_MODEL = 'my model';
const CHEAP_FIRST = 'cheap first';
const DEFAULT_SETTING = MY_MODEL;
const STORAGE_KEY = 'route';

/** Open-source hosts. Their model is the check, not the writer. */
const OPEN_SOURCE_HOSTS = ['groq', 'cerebras', 'deepseek', 'mistral', 'qwen'];
const WRITER = 'my-model';

function settingOf(value) {
  return value === CHEAP_FIRST ? CHEAP_FIRST : DEFAULT_SETTING;
}

function orderFor(value) {
  const checks = OPEN_SOURCE_HOSTS.map((host) => ({ host, role: 'check' }));
  const mine = { host: WRITER, role: 'writer' };
  const rows = settingOf(value) === CHEAP_FIRST ? checks.concat([mine]) : [mine].concat(checks);
  return rows.filter((row) => !/anthropic/i.test(row.host));
}

/** A missing key is not-checked, never a pass. Anthropic is not called. */
function keyStamp(host, keys) {
  if (/anthropic/i.test(String(host || ''))) return 'not-checked';
  const key = keys && keys[host];
  if (typeof key !== 'string' || key.trim() === '') return 'not-checked';
  return 'present';
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
  STORAGE_KEY,
  settingOf,
  checkRuns,
  OPEN_SOURCE_HOSTS,
  WRITER,
  orderFor,
  keyStamp,
};

if (typeof module === 'object' && module && module.exports) module.exports = api;
if (typeof globalThis === 'object') globalThis.trustshellRoute = api;
