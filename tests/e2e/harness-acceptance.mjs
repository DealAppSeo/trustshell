/**
 * THE COLD-INSTALL GATE — can a stranger get all four capabilities working?
 *
 * This is the MVP definition made executable: install the PUBLISHED package into an empty
 * directory with no env vars and no keys, run every advertised entry point, and report one of
 * three verdicts per leg. It answers "does trustshell.dev work for anyone" with an exit code
 * instead of an opinion.
 *
 * WHY IT EXISTS. Two parallel sessions each reported this stack's state and disagreed on nearly
 * every number — 5.6% vs 83% registered, a chain mismatch that turned out to be two disjoint
 * subsystems, a package "missing x402" that ships buildX402Payment. Both sessions were reasoning
 * from a proxy: a DB column, a health field, a format check. The chain and the CLI disagreed with
 * all of it. This file exists so the next such question is settled by running something.
 *
 * THREE OUTCOMES, NEVER TWO.
 *   MEASURED     the leg ran and produced the artifact it promises
 *   NOT_CHECKED  it could not be run here (no egress, no key) — NOT a pass, NOT a failure
 *   FAILED       it ran and did the wrong thing
 * Exit: 0 all MEASURED · 2 nothing FAILED but something NOT_CHECKED · 1 any FAILED.
 * Those codes match this ecosystem's convention (0 VERIFIED / 2 NOT_CHECKED / else FAILED).
 *
 * THE POINT OF NOT_CHECKED HERE. This sandbox's proxy denies sepolia.base.org and every public
 * Base RPC tried (connect_rejected). A gate that treated an unreachable chain as a pass would
 * certify the on-chain legs from a network failure — the exact "green over we-did-not-look" this
 * repo keeps paying for. So the chain assertions degrade to NOT_CHECKED and say what would run
 * them, and the run cannot exit 0 while they do.
 *
 *     node tests/e2e/harness-acceptance.mjs [--version 1.3.0] [--rpc https://...] [--json]
 *
 * No Playwright, no server, no repo checkout: it tests what npm actually serves the public.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VERSION = arg('--version', '1.3.0');
const RPC = arg('--rpc', process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
const AGENT = arg('--agent', 'trinity-sophia');
const JSON_OUT = argv.includes('--json');

// Base Sepolia, from repid-engine src/config/network.ts. Pinned deliberately: if the product
// moves chains this file must fail rather than follow.
const CHAIN_ID = 84532;
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const legs = [];
const record = (leg, verdict, detail, evidence) => {
  legs.push({ leg, verdict, detail, evidence });
  const mark = { MEASURED: 'MEASURED   ', NOT_CHECKED: 'NOT_CHECKED', FAILED: 'FAILED     ' }[verdict];
  if (!JSON_OUT) console.log(`${mark} ${leg}${detail ? ' — ' + detail : ''}`);
};

// --- cold install -----------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'trustshell-cold-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cold', private: true }));
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', timeout: opts.timeout ?? 180000, stdio: ['ignore', 'pipe', 'pipe'] });

try {
  run('npm', ['install', `@hyperdag/trustshell@${VERSION}`, '--no-audit', '--no-fund']);
  record('install', 'MEASURED', `npm i @hyperdag/trustshell@${VERSION} into an empty dir`);
} catch (e) {
  record('install', 'FAILED', String(e.message).slice(0, 200));
  finish();
}

// --- the four advertised capabilities ---------------------------------------
// HAL. A live cross-provider quorum: the assertion is that real providers answered, not merely
// that the process exited 0 — a verdict with an empty evidence list is the failure mode here.
try {
  const out = run('npx', ['trustshell', 'verify', 'The Earth orbits the Sun.', '--json'], { timeout: 180000 });
  const j = JSON.parse(out);
  const providers = (j.evidence ?? j.providers ?? []).length;
  if (!j.verdict && !j.decision) record('hal.verify', 'FAILED', 'no verdict field in --json output');
  else if (providers === 0) record('hal.verify', 'FAILED', 'verdict returned with ZERO provider evidence — a quorum of nobody');
  else record('hal.verify', 'MEASURED', `${j.verdict ?? j.decision}, ${providers} providers responded`);
} catch (e) {
  record('hal.verify', 'FAILED', String(e.stderr || e.message).slice(0, 160));
}

// RepID: keyless read.
let liveScore = null;
try {
  const j = JSON.parse(run('npx', ['trustshell', 'repid', AGENT, '--json'], { timeout: 90000 }));
  liveScore = j.repid ?? j.repid_score ?? j.score ?? null;
  if (liveScore == null) record('repid.read', 'FAILED', 'no score field in --json output');
  else record('repid.read', 'MEASURED', `${AGENT} = ${liveScore} (${j.tier ?? 'no tier'})`);
} catch (e) {
  record('repid.read', 'FAILED', String(e.stderr || e.message).slice(0, 160));
}

// zkRepID: the proof must VERIFY CLIENT-SIDE, not merely be delivered. A proof you fetched but
// did not check is the badge lying in slow motion.
//
// FIELD NAMES ARE `proofBytes` AND `verification.verified`. The first draft of this file guessed
// `proof` and a top-level `verified`, and reported FAILED against a working product — the third
// time in one session that a probe, not the subject, was the bug. It is recorded here because the
// gate's whole value is that a wrong probe fails LOUD instead of passing quietly.
let proofStatement = null, proofCreatedAt = null;
try {
  const j = JSON.parse(run('npx', ['trustshell', 'proof', AGENT, '--verify', '--json'], { timeout: 120000 }));
  const verified = j?.verification?.verified === true;
  proofStatement = typeof j.statement === 'string' ? JSON.parse(j.statement) : j.statement;
  proofCreatedAt = j.createdAt ?? null;
  if (!j.proofBytes) record('zkrepid.proof', 'FAILED', 'no proofBytes returned');
  else if (!verified) record('zkrepid.proof', 'FAILED', `client-side verification did NOT pass: ${j?.verification?.error ?? 'no reason given'}`);
  else record('zkrepid.proof', 'MEASURED', `${j.scheme} verified client-side by ${j.verification.verifierVersion}`);
} catch (e) {
  record('zkrepid.proof', 'FAILED', String(e.stderr || e.message).slice(0, 160));
}

// PRIVACY: a threshold proof must not ship the score.
// The badge's own alt-text reads "The proof attests the threshold, not the score." Measured
// 2026-08-30: statement.repid_score is present in plaintext. The artifact designed to withhold the
// score transmits it, and every consumer that echoes the statement republishes it.
if (proofStatement) {
  if (proofStatement.repid_score !== undefined) {
    record('zkrepid.privacy', 'FAILED',
      'statement carries repid_score in plaintext while the badge claims it attests the threshold, not the score',
      { threshold: proofStatement.threshold, leaked_field: 'statement.repid_score' });
  } else {
    record('zkrepid.privacy', 'MEASURED', 'statement carries the threshold, not the score');
  }
} else {
  record('zkrepid.privacy', 'NOT_CHECKED', 'no statement parsed — see zkrepid.proof');
}

// FRESHNESS: cryptographically valid is not the same as currently true.
// The badge renders green on `verification.verified`, which proves the proof is internally sound —
// never that it still describes the agent. A proof minted when the score was above the threshold
// keeps verifying after the score falls through it, and nothing on the badge says how old it is.
if (proofCreatedAt) {
  const ageDays = (Date.now() - Date.parse(proofCreatedAt)) / 86400000;
  const live = liveScore == null ? null : Number(liveScore);
  const attested = proofStatement?.repid_score ?? null;
  const drifted = live != null && attested != null && live !== attested;
  if (ageDays > 7) {
    record('zkrepid.freshness', 'FAILED',
      `proof is ${ageDays.toFixed(0)} days old and carries no expiry` +
      (drifted ? `; it attests ${attested} while the live score is ${live}` : ''),
      { createdAt: proofCreatedAt, attested, live });
  } else {
    record('zkrepid.freshness', 'MEASURED', `proof is ${ageDays.toFixed(1)} days old`);
  }
} else {
  record('zkrepid.freshness', 'NOT_CHECKED', 'no createdAt on the proof');
}

// Badge: green ONLY on true local verification.
try {
  const svg = run('npx', ['trustshell', 'badge', AGENT], { timeout: 120000 });
  if (!svg.includes('<svg')) record('badge', 'FAILED', 'no SVG emitted');
  else if (!/ZK-verified/i.test(svg)) record('badge', 'FAILED', 'SVG emitted but not in the verified state');
  else record('badge', 'MEASURED', 'self-contained SVG in the verified state');
} catch (e) {
  record('badge', 'FAILED', String(e.stderr || e.message).slice(0, 160));
}

// --- on-chain: the two legs that must never be certified from a network error ---
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(25000),
  });
  return (await res.json());
}

let chainReachable = false;
try {
  const j = await rpc('eth_chainId', []);
  const id = parseInt(j.result, 16);
  if (id !== CHAIN_ID) record('chain.identity', 'FAILED', `RPC is chain ${id}, expected Base Sepolia ${CHAIN_ID}`);
  else { chainReachable = true; record('chain.reachable', 'MEASURED', `Base Sepolia ${CHAIN_ID}`); }
} catch {
  record('chain.reachable', 'NOT_CHECKED',
    `no egress to ${RPC} from here — rerun with --rpc <reachable endpoint>, or from CI/a host with outbound HTTP`);
}

// ERC-8004 identity for a REAL user is the open MVP gate: registration is keyless but does not
// mint, and the only minting route is bearer-gated. Assert the registry is live and that the
// sample agent's identity resolves; a NEW user's identity is asserted by the register leg below.
if (chainReachable) {
  try {
    const code = await rpc('eth_getCode', [IDENTITY_REGISTRY, 'latest']);
    const bytes = ((code.result || '0x').length - 2) / 2;
    if (bytes < 2) record('erc8004.registry', 'FAILED', 'identity registry has no code at the pinned address');
    else record('erc8004.registry', 'MEASURED', `identity registry deployed (${bytes} bytes)`);
  } catch (e) {
    record('erc8004.registry', 'NOT_CHECKED', String(e.message).slice(0, 120));
  }
} else {
  record('erc8004.registry', 'NOT_CHECKED', 'chain unreachable — see chain.reachable');
}

// THE MVP IDENTITY GATE. Measured 2026-08-30 from repid-engine source: POST /api/v1/agents/register
// is keyless and writes `erc8004_address = external:<uuid>` with no token and no mint; the only
// minting route, POST /api/v1/agents/:id/mint, is bearer-gated. So a stranger completing the
// quickstart ends with NO on-chain identity. This leg fails until that link exists — it is the
// difference between "the pieces work" and "it works for anyone".
record('erc8004.identity_for_new_user', 'FAILED',
  'register() is keyless but never mints; POST /agents/:id/mint is bearer-gated — a new user cannot obtain an on-chain identity',
  { registerRoute: 'src/routes/agents-external.ts', mintRoute: 'src/routes/agents-onchain.ts (auth required)' });

function finish() {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  const failed = legs.filter((l) => l.verdict === 'FAILED');
  const unchecked = legs.filter((l) => l.verdict === 'NOT_CHECKED');
  if (JSON_OUT) console.log(JSON.stringify({ version: VERSION, legs }, null, 2));
  else {
    console.log(`\n${legs.filter((l) => l.verdict === 'MEASURED').length} measured · ${unchecked.length} not checked · ${failed.length} failed`);
    if (unchecked.length) console.log('NOT_CHECKED is not a pass. This run cannot certify those legs.');
  }
  process.exit(failed.length ? 1 : unchecked.length ? 2 : 0);
}
finish();
