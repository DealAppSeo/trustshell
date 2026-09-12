#!/usr/bin/env node
/**
 * PAI first-run: interview (max 3) → register on production → local .trustshell JSON.
 * Non-interactive: --name and --answers "job|cost|brain"
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';
import { logValueEvent } from './value-events.mjs';

const require = createRequire(import.meta.url);
const interview = require('../lib/interview.js');

// One PAI per store. TRUSTSHELL_HOME selects the store (same env value-events.mjs honors), so a
// second PAI lives in its OWN dir instead of colliding with #1 in the default `.trustshell`.
const DIR = process.env.TRUSTSHELL_HOME || '.trustshell';

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

const { name, answers: argvAnswers, force } = interview.parseArgv(process.argv);
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

function loadLocal() {
  try {
    const cred = JSON.parse(readFileSync(join(DIR, 'credentials.json'), 'utf8'));
    const prof = JSON.parse(readFileSync(join(DIR, 'profile.json'), 'utf8'));
    if (cred.agentId) {
      return { agentName: prof.agentName, agentId: cred.agentId, apiKey: cred.apiKey, erc8004TokenId: cred.erc8004TokenId ?? null };
    }
  } catch {
    /* no local creds */
  }
  return null;
}

function logQuiet(event, data) {
  try {
    logValueEvent(event, data, { dir: DIR });
  } catch (err) {
    console.error('value-events log failed:', err && err.message ? err.message : String(err));
  }
}

const local = loadLocal();
const exist = interview.existingCreds({ local, name, force });
let reg;
let freshRegister = false;
if (exist.action === 'reuse') {
  console.log(`reusing local ${DIR} credentials for`, name);
  reg = exist.local;
} else if (exist.action === 'exists') {
  console.error(exist.message);
  process.exit(1);
} else {
  try {
    reg = await client.register({ agentName: name, origin: 'Cli' }); // provenance: created from the CLI
    freshRegister = true;
  } catch (err) {
    const decision = interview.reuseOrNameTaken({ name, err, local });
    if (decision.action === 'reuse') {
      console.log(`reusing local ${DIR} credentials for`, name);
      reg = decision.local;
    } else if (decision.action === 'name_taken') {
      console.log(decision.message);
      process.exit(0);
    } else if (decision.action === 'busy') {
      console.log(decision.message);
      process.exit(1);
    } else {
      const msg = err && err.message ? err.message : String(err);
      console.error('register failed:', msg);
      process.exit(1);
    }
  }
}

console.log('Name', name);
interview.writePrivate(
  join(DIR, 'credentials.json'),
  JSON.stringify(
    { agentId: reg.agentId, apiKey: reg.apiKey, erc8004TokenId: reg.erc8004TokenId ?? null, createdAt: new Date().toISOString() },
    null,
    2,
  ) + '\n',
);
interview.writePrivate(
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
// Wiki seed — a plain, human-readable page from the interview answers, on-device only. NOT a config
// dump ("not 100 OAuth"): just what this PAI is for, in the person's own words, for them to grow.
// Seed the wiki ONCE. If it already exists we leave it alone — the page invites the user to edit it,
// so a rerun (reuse path) must never clobber their edits.
const wikiPath = join(DIR, 'wiki', 'README.md');
if (!existsSync(wikiPath)) {
  const toolLines = (Array.isArray(pack) ? pack : [pack]).filter(Boolean).map((t) => `- ${t}`).join('\n') || '- (none suggested yet)';
  interview.writePrivate(
    wikiPath,
    `# ${name} — your PAI\n\n` +
      `Your confidential chief of staff. This wiki lives in \`${join(DIR, 'wiki')}/\` on this device and is never uploaded — edit it freely.\n\n` +
      `## What it's for\n${job || '(tell it in the interview)'}\n\n` +
      `## Cost sense\n${cost || '(not set)'}\n\n` +
      `## Brain\n${brain || '(not set)'}\n\n` +
      `## Suggested tools\n${toolLines}\n\n` +
      `## Two guarantees\n- HAL VETOs a false claim before you act on it.\n- A spend with no cap or no policy is refused — it never signs by default.\n\n` +
      `## Grow the fleet\nCreate a specialist (PAI #2+) in its own store — see the pointer at the end of this run. Keep #1 as your chief of staff.\n`,
  );
  console.log('wrote', join(DIR, 'credentials.json') + ',', join(DIR, 'profile.json') + ',', 'and', wikiPath);
} else {
  console.log('wrote', join(DIR, 'credentials.json') + ',', join(DIR, 'profile.json') + '  (kept your existing', wikiPath + ')');
}
if (freshRegister) {
  logQuiet('register_ok', { agentId: reg.agentId, agentName: name });
  // Shown ONCE. The apiKey is saved in credentials.json (gitignored) and never printed again —
  // copy it now if you need it elsewhere. On a reuse run we do NOT reprint it.
  console.log('');
  console.log('  agentId:', reg.agentId);
  console.log('  apiKey :', reg.apiKey, `  (shown once — saved to ${join(DIR, 'credentials.json')})`);
  console.log('');
}

const paris = await client.verifyOutput('The capital of France is Paris.');
console.log('verify Paris:', paris.verdict);
const rome = await client.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log('verify Rome:', rome.verdict);
if (rome.verdict === 'VETO') {
  console.log('Harness blocked a false claim before you saw it.');
  logQuiet('VETO', { claim: 'The Eiffel Tower is located in Rome, Italy.' });
}

const rep = await client.getRepID(reg.agentId);
console.log('RepID', rep.repid, rep.tier, '(score moves; do not freeze)');

console.log(`- private files on this device: ${join(DIR, 'credentials.json')} + ${join(DIR, 'profile.json')} — keep this dir out of git (.trustshell/ and everything under it is gitignored)`);
console.log('- HAL catch: a false claim is VETO before you act on it');
console.log('- ERC-8004 passport: register is NOT_MINTED until a keyed mint');

// Create a second PAI — a LINK only. PAI #1 is your confidential chief of staff; specialists are
// separate PAIs (#2+). Do NOT bolt specialist tools onto #1 — give it a colleague instead.
console.log('');
console.log('Create a second PAI (its own store UNDER the gitignored .trustshell/, so #1 is untouched):');
console.log('  PowerShell:  $env:TRUSTSHELL_HOME=".trustshell/<name>"; node scripts/init-pai.mjs --name <name>');
console.log('  (other shells: set the env var TRUSTSHELL_HOME to .trustshell/<name> before the node command)');
console.log('  (#1 is your chief of staff; #2+ are specialists it can manage — one store each, all gitignored)');

process.exit(0);
