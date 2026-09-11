#!/usr/bin/env node
/**
 * PAI first-run: interview (max 3) → register on production → local .trustshell JSON.
 * Non-interactive: --name and --answers "job|cost|brain"
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const interview = require('../lib/interview.js');

const DIR = '.trustshell';

async function askInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];
  for (const q of interview.QUESTIONS) {
    const a = await new Promise((res) => rl.question(q + '\n> ', res));
    answers.push(String(a).trim());
    if (answers.length >= 3) break;
  }
  rl.close();
  return answers;
}

async function loadTrustShell() {
  try {
    return (await import('../dist/lib/index.js')).TrustShell;
  } catch {
    return (await import('@hyperdag/trustshell')).TrustShell;
  }
}

const { name, answers: argvAnswers } = interview.parseArgv(process.argv);
const answers = argvAnswers ?? (await askInteractive());
const job = answers[0] || '';
const cost = answers[1] || '';
const brain = answers[2] || '';
const pack = interview.toolPack(job);

const TrustShell = await loadTrustShell();
const { client, health } = await TrustShell.init({ timeout: 60_000 });
if (!health?.ok) {
  console.error('init failed: backend not ok', health);
  process.exit(1);
}

const reg = await client.register({ agentName: name });
mkdirSync(DIR, { recursive: true });
writeFileSync(
  join(DIR, 'credentials.json'),
  JSON.stringify(
    { agentId: reg.agentId, apiKey: reg.apiKey, erc8004TokenId: reg.erc8004TokenId ?? null, createdAt: new Date().toISOString() },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(DIR, 'profile.json'),
  JSON.stringify(
    {
      job,
      cost,
      brain,
      toolPack: pack,
      suggestedMcp: pack,
      agentName: name,
      agentId: reg.agentId,
    },
    null,
    2,
  ) + '\n',
);
console.log('wrote', join(DIR, 'credentials.json'), 'and', join(DIR, 'profile.json'));

const paris = await client.verifyOutput('The capital of France is Paris.');
console.log('verify Paris:', paris.verdict);
const rome = await client.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log('verify Rome:', rome.verdict);
if (rome.verdict === 'VETO') {
  console.log('Harness blocked a false claim before you saw it.');
}

const rep = await client.getRepID(reg.agentId);
console.log('RepID', rep.repid, rep.tier, '(score moves; do not freeze)');

console.log('- private files on this device: .trustshell/credentials.json + profile.json (gitignored)');
console.log('- HAL catch: a false claim is VETO before you act on it');
console.log('- ERC-8004 passport: register is NOT_MINTED until a keyed mint');
console.log('- x402+cap wallet: pay path needs a funded Base Sepolia key and an explicit cap');

process.exit(0);
