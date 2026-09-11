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
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.slice(0, 3);
}

function parseArgv(argv) {
  let name = 'pai-agent';
  let answers = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--name' && argv[i + 1]) name = argv[++i];
    else if (argv[i] === '--answers' && argv[i + 1]) answers = parseAnswers(argv[++i]);
  }
  return { name, answers, questions: QUESTIONS };
}

function toolPack(job) {
  const pack = ['verify', 'present_proof'];
  if (/pay|market/i.test(job || '')) pack.push('x402-cap');
  return pack;
}

module.exports = { QUESTIONS, parseAnswers, parseArgv, toolPack };
