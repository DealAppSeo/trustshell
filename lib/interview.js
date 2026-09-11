'use strict';
/** At most 3 interview answers. Non-interactive via --answers "a|b|c". */

const QUESTIONS = [
  'What job should this agent do?',
  'What does a wasted hour cost you?',
  'What brain / model do you want?',
];

function parseAnswers(raw) {
  const parts = String(raw ?? '')
    .split('|')
    .map((s) => s.trim());
  return parts.slice(0, 3);
}

function parseArgv(argv) {
  let name = 'pai-agent';
  let answers = null;
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--name' && argv[i + 1]) name = argv[++i];
    else if (argv[i] === '--answers' && argv[i + 1]) answers = parseAnswers(argv[++i]);
    else if (argv[i] === '--force') force = true;
  }
  return { name, answers, questions: QUESTIONS, force };
}

function toolPack(job) {
  const pack = ['verify', 'present_proof'];
  if (/\b(pay|market)\b/i.test(job || '')) pack.push('x402-cap');
  return pack;
}

/** Same-name local creds resume; a different name needs --force or the old key is lost. */
function existingCreds({ local, name, force }) {
  if (!local || !local.agentId) return { action: 'register' };
  if (local.agentName === name) return { action: 'reuse', local };
  if (force) return { action: 'register' };
  return {
    action: 'exists',
    message: `existing .trustshell credentials for ${local.agentName}; pass --force to replace`,
  };
}

/** 429 / name-taken: reuse local creds or stop cleanly — never stack-trace. */
function reuseOrNameTaken({ name, err, local }) {
  const status = err && (err.status ?? err.statusCode);
  const msg = String((err && err.message) || '');
  const busy = status === 429 || /\b429\b/.test(msg);
  const taken = status === 409 || /taken|already exists|conflict/i.test(msg);
  if (!busy && !taken) return { action: 'throw' };
  if (local && local.agentName === name && local.agentId) {
    return { action: 'reuse', local };
  }
  if (taken) return { action: 'name_taken', message: 'name taken, pick another' };
  return { action: 'busy', message: 'name taken, pick another' };
}

/**
 * Owner-only write. Refuse if dir or path is a symlink so writeFileSync cannot
 * follow a planted link and dump the one-time API key to an attacker path.
 */
function writePrivate(file, text) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const dirStat = fs.lstatSync(dir);
  if (dirStat.isSymbolicLink()) {
    throw new Error(`${dir} is a symlink; refusing to write credentials`);
  }
  if (!dirStat.isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
  try { fs.chmodSync(dir, 0o700); } catch { /* windows */ }
  try {
    if (fs.lstatSync(file).isSymbolicLink()) {
      throw new Error(`${file} is a symlink; refusing to write credentials`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_TRUNC |
    (fs.constants.O_NOFOLLOW || 0);
  let fd;
  try {
    fd = fs.openSync(file, flags, 0o600);
  } catch (e) {
    if (e.code === 'ELOOP') {
      throw new Error(`${file} is a symlink; refusing to write credentials`);
    }
    throw e;
  }
  try {
    try { fs.fchmodSync(fd, 0o600); } catch { /* windows */ }
    fs.writeSync(fd, text);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  QUESTIONS,
  parseAnswers,
  parseArgv,
  toolPack,
  existingCreds,
  reuseOrNameTaken,
  writePrivate,
};
