#!/usr/bin/env node
/**
 * Five cases on today's RepID proof: pass, below the bar, tampered, expired, replayed. Each one leaves evidence that
 * `trustshell trust-report verify` re-checks offline. UNPUBLISHED: this is on a branch, not on any public page.
 *
 *   node demo/zk-walkthrough/run.mjs               uses this checkout's dist/cli/index.js
 *   node demo/zk-walkthrough/run.mjs --cli <path>  another build's dist/cli/index.js
 *   node demo/zk-walkthrough/run.mjs --out <dir>   write the evidence there (a new folder) instead of a temp folder
 *
 * THE PROOF is fixtures/proof-agent.json: a real proof the live engine made on 2026-09-15. Today's proofs are
 * VALIDITY proofs (src/lib/proof-class.ts): they show threshold < score for numbers the statement makes public. So
 * this walkthrough cannot show a hidden score, and it says so in every case. What it can show: what a verified proof
 * does and does not cover, and which cheats it stops.
 *
 * THE GATE (inside each case.mjs) grants a task when the proof verifies, the score meets the bar, and the proof is
 * at most 30 days old by its created_at. created_at is not in the proven statement, which is the replay case.
 *
 * EVIDENCE, per case, in <out>/<case>/:
 *   case.mjs  the presented proof, the gate's policy and the gate itself, in ONE file. Exit 0 GRANTED, 1 DENIED,
 *             2 NOT_CHECKED. Re-run it: `node case.mjs` (needs @hyperdag/proof-verifier 0.2.0; a copy is in
 *             <out>/node_modules).
 *   home/     the TrustShell home whose owner policy pins case.mjs by sha256 (`guard allow tool:node --script`).
 *   report/   `trust-report` over that home: its Guard record names case.mjs by sha256 and how it exited.
 * `trust-report verify report --root <key>` checks the folder is whole, matches its evidence, and was sealed by that
 * key. The sha256 in report/ ties case.mjs to it; re-running case.mjs re-checks the proof itself.
 *
 * NO NETWORK, observed: the CLI and the direct re-runs of case.mjs load demo/guard-carry/no-network.cjs by
 * --require, which refuses and logs any TCP, UDP or DNS call through Node's modules, and a canary must be caught
 * first. The one run of case.mjs inside `trustshell run` cannot carry the preload: Guard refuses node when
 * NODE_OPTIONS is set (it would run code before the pinned script). That run is not observed; its re-run is.
 *
 * SEAM (Lane Z): SCHEMES below holds one entry per proof scheme the gate accepts. The private eligibility proof
 * adds its own entry (its verifier, what a verifier learns, whether its statement carries a time and a verifier
 * challenge); the five cases then run on it unchanged, and the cases that today show a limit should flip.
 *
 * EXIT 0 every case came out as expected and every check held · 1 one did not (printed) · 2 NOT_CHECKED.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const CLI = path.resolve(flag('--cli') ?? path.join(repo, 'dist', 'cli', 'index.js'));
const PRELOAD = path.join(repo, 'demo', 'guard-carry', 'no-network.cjs');
const VERIFIER = path.join(repo, 'node_modules', '@hyperdag', 'proof-verifier');
for (const [what, p] of [['trustshell CLI', CLI], ['no-network preload', PRELOAD], ['@hyperdag/proof-verifier', VERIFIER]]) {
  if (!fs.existsSync(p)) {
    console.log(`NOT_CHECKED no ${what} at ${p}. In a clone: npm ci, then run this again (dist/ is committed).`);
    process.exit(2);
  }
}
const { proofClassOf } = createRequire(import.meta.url)(path.join(path.dirname(CLI), '..', 'lib', 'proof-class.js'));
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'fixtures', 'proof-agent.json'), 'utf8'));

const OUT = flag('--out') ? path.resolve(flag('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'trustshell-proof-walkthrough-'));
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) {
  console.log(`NOT_CHECKED ${OUT} already has files in it. Name a new folder.`);
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
// A copy, never a link: removing OUT must not be able to reach the checkout's node_modules.
const VCOPY = path.join(OUT, 'node_modules', '@hyperdag', 'proof-verifier');
for (const part of ['package.json', 'js', 'pkg-node', 'LICENSE-APACHE']) fs.cpSync(path.join(VERIFIER, part), path.join(VCOPY, part), { recursive: true });

const NET_LOG = path.join(OUT, 'network-attempts.log');
const BASICS = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG']);
// No NODE_OPTIONS: Guard refuses node when it is set. The preload goes on argv instead.
const BASE_ENV = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => BASICS.has(k.toUpperCase()))), GUARD_CARRY_NET_LOG: NET_LOG, NODE_NO_WARNINGS: '1' };
const node = (args, opts) => spawnSync(process.execPath, ['--require', PRELOAD, ...args], { encoding: 'utf8', input: '', timeout: 180000, windowsHide: true, ...opts });
const canary = node(['-e', "require('dns').lookup('example.com', () => {})"], { env: { ...BASE_ENV, GUARD_CARRY_NET_LOG: path.join(OUT, 'canary.log') } });
const canaryCaught = canary.status !== null && fs.existsSync(path.join(OUT, 'canary.log'));

// ── SEAM: the proof schemes the gate accepts ─────────────────────────────────────────────────────────────────────
const SCHEMES = {
  plonky3_range_check: {
    verifier: '@hyperdag/proof-verifier',
    learns: (st) => `the exact score (${st.repid_score}), the threshold (${st.threshold}) and the agent id: all three are in the statement`,
    proves: (st) => `threshold ${st.threshold} < score ${st.repid_score}, for exactly these two numbers`,
    notProven: [
      'that the agent id is this agent: about 1 in 256 other agent ids verify too',
      'the tier label',
      'when the proof was made: created_at sits outside the statement',
      'that the score is the agent\'s real RepID: the verifier takes no issuer key, so that rests on the engine\'s attestation',
      'that the proof was made for this request: the statement carries no verifier challenge',
    ],
  },
};

const MADE = fixture.created_at; // 2026-09-15
const SOON = '2026-09-20T00:00:00Z';
const LATER = '2026-11-17T00:00:00Z';
const honest = { proof_bytes: fixture.proof_bytes, statement: fixture.statement, created_at: MADE, scheme: fixture.scheme };
const flipped = (() => {
  const b = Buffer.from(fixture.proof_bytes, 'base64');
  b[Math.floor(b.length / 2)] ^= 1;
  return b.toString('base64');
})();
const policy = (decided_at, bar) => ({ bar, max_age_days: 30, decided_at });

const CASES = [
  {
    name: 'pass', expect: 'GRANTED', policy: policy(SOON, 999), presented: honest,
    story: 'The agent presents its proof five days after it was made, for a task whose bar is 999.',
  },
  {
    name: 'below-the-bar', expect: 'DENIED', policy: policy(SOON, 5000), presented: honest,
    story: 'The same proof, for a task whose bar is 5000. Then the agent raises the score in the statement to 5000.',
    cheats: [{ what: 'the statement says score 5000 instead of the real one', statement: { ...fixture.statement, repid_score: 5000 }, expect: false }],
  },
  {
    name: 'tampered', expect: 'DENIED', policy: policy(SOON, 999), presented: { ...honest, proof_bytes: flipped },
    story: 'One bit of the proof bytes is flipped in transit.',
  },
  {
    name: 'expired', expect: 'DENIED', policy: policy(LATER, 999), presented: honest,
    story: 'The same proof, presented two months after it was made. The gate accepts proofs up to 30 days old.',
  },
  {
    name: 'replayed', expect: 'GRANTED', policy: policy(LATER, 999), presented: { ...honest, created_at: LATER },
    story: 'The same two-month-old proof, re-presented with its created_at changed to today. Nothing in the proof changed.',
    finding: 'ACCEPTED. The old proof still verifies: the statement has no time and no verifier challenge, so created_at is whatever the presenter says.',
  },
];

// The gate, as written into every case.mjs. It reads only CASE, so the file's sha256 covers everything it decides on.
const GATE = `
const fail = (why) => { console.log(JSON.stringify({ case: CASE.name, decision: 'NOT_CHECKED', why }, null, 2)); process.exit(2); };
let verify;
try { ({ verify } = await import(CASE.scheme.verifier)); } catch (e) { fail('the verifier could not be loaded: ' + e.message); }
const p = CASE.presented, st = p.statement, pol = CASE.policy;
const v = await verify(p.proof_bytes, st);
const reasons = [];
if (!v.verified) reasons.push('the proof does not verify: ' + v.error);
if (st.repid_score < pol.bar) reasons.push('the score ' + st.repid_score + ' is below the bar ' + pol.bar);
const age = (Date.parse(pol.decided_at) - Date.parse(p.created_at)) / 86400000;
if (!(age <= pol.max_age_days)) reasons.push('by its created_at the proof is ' + Math.round(age) + ' days old, over the ' + pol.max_age_days + '-day limit');
const cheats = [];
for (const c of CASE.cheats) {
  const r = await verify(c.proof_bytes ?? p.proof_bytes, c.statement ?? st);
  cheats.push({ what: c.what, verified: r.verified, error: r.error });
}
const decision = reasons.length ? 'DENIED' : 'GRANTED';
console.log(JSON.stringify({
  case: CASE.name, decision, why: reasons.length ? reasons : ['the proof verifies, the score meets the bar, and the proof is within the age limit'],
  verifier: { verified: v.verified, error: v.error, version: v.verifier_version },
  proven: v.verified ? CASE.proves : 'nothing: the proof did not verify',
  stayed_private: CASE.stays_private, learned_by_verifier: CASE.learned, not_proven: CASE.not_proven,
  proof_class: CASE.proof_class, cheats,
}, null, 2));
process.exit(decision === 'GRANTED' ? 0 : 1);
`;

function caseFile(c) {
  const s = SCHEMES[c.presented.scheme];
  const data = {
    name: c.name, story: c.story, policy: c.policy, presented: c.presented, cheats: (c.cheats ?? []).map(({ expect, ...x }) => x),
    scheme: { name: c.presented.scheme, verifier: s.verifier },
    proof_class: proofClassOf({ scheme: c.presented.scheme, proofBytes: c.presented.proof_bytes, statement: c.presented.statement, tier: 'postcard' }).summary, // tier: for builds before #728's cc82d23
    proves: s.proves(c.presented.statement), learned: s.learns(c.presented.statement),
    stays_private: 'nothing: today\'s proof is a validity proof, and the score is in the statement',
    not_proven: s.notProven,
  };
  return `// Case "${c.name}" of the TrustShell proof walkthrough. Generated by demo/zk-walkthrough/run.mjs; do not edit:
// report/ names this file by sha256. Re-check offline: node case.mjs   EXIT 0 GRANTED · 1 DENIED · 2 NOT_CHECKED
const CASE = ${JSON.stringify(data, null, 2)};
${GATE}`;
}

const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
  return ok;
};
const results = [];

for (const c of CASES) {
  const dir = path.join(OUT, c.name);
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(dir, 'case.mjs'), caseFile(c));
  const env = { ...BASE_ENV, HOME: home, USERPROFILE: home, TRUSTSHELL_HOME: path.join(home, '.trustshell') };
  const cli = (...a) => node([CLI, ...a], { cwd: dir, env });
  const want = c.expect === 'GRANTED' ? 0 : 1;

  check(cli('guard', 'init').status === 0, `${c.name}: guard init`);
  check(cli('guard', 'allow', 'tool:node', '--script', 'case.mjs').status === 0, `${c.name}: guard allow tool:node --script case.mjs`);
  const ran = cli('run', '--tool', 'node', '--', process.execPath, 'case.mjs');
  check(ran.status === want, `${c.name}: trustshell run exited ${ran.status}, expected ${want} (${c.expect}). ${ran.stderr.trim().slice(0, 300)}`);
  const made = cli('trust-report', '--out', 'report', '--json', '--title', `Proof walkthrough: ${c.name}`, '--bind', `case.mjs=${c.name}: the gate granted the task`);
  let root = null;
  let report = null;
  try {
    ({ report, root } = JSON.parse(made.stdout));
  } catch {
    check(false, `${c.name}: trust-report did not answer in JSON (exit ${made.status}): ${made.stderr.trim().slice(0, 300)}`);
  }
  const verified = root ? cli('trust-report', 'verify', 'report', '--root', root, '--json') : { status: null, stdout: '' };
  check(verified.status === 0, `${c.name}: trust-report verify exited ${verified.status}: ${verified.stdout.trim().slice(0, 300)}`);
  const bound = report?.inputs?.binds?.[0]?.script_sha256;
  check(bound === sha256(path.join(dir, 'case.mjs')), `${c.name}: report/ does not name case.mjs by its sha256`);
  const claim = report?.bound_claims?.[0]?.status;
  check(claim === (want === 0 ? 'COMMAND_PASSED' : 'CONTRADICTED'), `${c.name}: the bound claim reads ${claim}`);
  // Re-check the proof itself: case.mjs again, directly, with the network refused.
  const again = node(['case.mjs'], { cwd: dir, env: BASE_ENV });
  check(again.status === want, `${c.name}: re-running case.mjs exited ${again.status}, expected ${want}`);
  let out = null;
  try {
    out = JSON.parse(again.stdout);
  } catch {
    check(false, `${c.name}: case.mjs did not answer in JSON: ${again.stdout.slice(0, 200)}`);
  }
  for (const [i, ch] of (c.cheats ?? []).entries()) check(out?.cheats?.[i]?.verified === ch.expect, `${c.name}: cheat "${ch.what}" verified=${out?.cheats?.[i]?.verified}`);
  fs.writeFileSync(path.join(dir, 'decision.json'), again.stdout);
  results.push({ c, out, root, claim });
}

// Non-vacuity: a changed case.mjs must no longer match its report, and a changed report must fail verify.
const tamper = path.join(OUT, 'tamper-check');
fs.cpSync(path.join(OUT, 'pass'), tamper, { recursive: true });
fs.appendFileSync(path.join(tamper, 'case.mjs'), '\n// edited after the report was made\n');
const passBind = results[0]?.root ? JSON.parse(fs.readFileSync(path.join(tamper, 'report', 'report.json'), 'utf8')).inputs.binds[0].script_sha256 : null;
check(passBind !== null && passBind !== sha256(path.join(tamper, 'case.mjs')), 'control: an edited case.mjs still matched its report');
const rj = path.join(tamper, 'report', 'report.json');
fs.writeFileSync(rj, fs.readFileSync(rj, 'utf8').replace('COMMAND_PASSED', 'CONTRADICTED'));
const badVerify = node([CLI, 'trust-report', 'verify', 'report', '--root', results[0]?.root ?? '0x'], { cwd: tamper, env: BASE_ENV });
check(badVerify.status === 1, `control: trust-report verify on an edited report exited ${badVerify.status}, expected 1`);
fs.rmSync(tamper, { recursive: true, force: true });

const netAttempts = fs.existsSync(NET_LOG) ? fs.readFileSync(NET_LOG, 'utf8').trim() : '';
check(canaryCaught, 'no network: the canary lookup was not caught, so an empty log would prove nothing (NOT_CHECKED)');
check(netAttempts === '', `no network: ${netAttempts.split('\n').length} attempt(s) logged in ${NET_LOG}`);

// ── what a reader sees ───────────────────────────────────────────────────────────────────────────────────────────
const md = [
  '# Five cases on today\'s RepID proof',
  '',
  `Proof: a real proof made by the live engine on ${MADE.slice(0, 10)} (\`fixtures/proof-agent.json\`). Class: ${results[0]?.out?.proof_class ?? 'unknown'}.`,
  '',
  'Gate: grant the task when the proof verifies, the score meets the bar, and the proof is at most 30 days old by its created_at.',
  '',
  '| case | what happened | decision | why |',
  '|---|---|---|---|',
  ...results.map(({ c, out }) => {
    const why = [c.finding ?? out?.why?.join('; '), ...(out?.cheats ?? []).map((ch) => `then ${ch.what}: ${ch.verified ? 'it VERIFIES' : 'it does not verify'}`)];
    return `| ${c.name} | ${c.story} | ${out?.decision ?? 'NOT_CHECKED'} | ${why.filter(Boolean).join('; ').replace(/\|/g, '/')} |`;
  }),
  '',
  `What the proof proves when it verifies: ${results[0]?.out?.proven}.`,
  `What stayed private: ${results[0]?.out?.stayed_private}. The verifier learned ${results[0]?.out?.learned_by_verifier}.`,
  '',
  'What a verified proof does not show:',
  ...SCHEMES.plonky3_range_check.notProven.map((n) => `- ${n}`),
  '',
  'Re-check any case offline, from its folder:',
  '',
  '```',
  'trustshell trust-report verify report --root <key below>',
  'node case.mjs',
  '```',
  '',
  ...results.map(({ c, root }) => `- ${c.name}: --root ${root}`),
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'WALKTHROUGH.md'), md);

console.log(md);
console.log(problems.length ? `RESULT  ${problems.length} check(s) did not hold:\n${problems.map((p) => `  - ${p}`).join('\n')}` : `RESULT  5 of 5 cases came out as expected; every report verified; no network (${OUT})`);
process.exit(problems.length ? 1 : 0);
