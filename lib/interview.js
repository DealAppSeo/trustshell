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

module.exports = { QUESTIONS, parseAnswers, parseArgv, toolPack, existingCreds, reuseOrNameTaken };
