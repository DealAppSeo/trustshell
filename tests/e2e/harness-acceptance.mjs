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
      'the exact score is a PUBLIC circuit input while the badge claims it attests the threshold, not the score — ' +
      'fix the copy now; making the score private is a new circuit and a new verifier major, not a payload edit',
      { threshold: proofStatement.threshold, public_input: 'statement.repid_score' });
  } else {
    record('zkrepid.privacy', 'MEASURED', 'statement carries the threshold, not the score');
  }
} else {
  record('zkrepid.privacy', 'NOT_CHECKED', 'no statement parsed — see zkrepid.proof');
}

// TAMPER-EVIDENCE — a positive property, measured, and worth a regression guard.
// The statement is not decoration beside the proof: agent_id, repid_score and threshold are all
// PUBLIC INPUTS to the plonky3 circuit. Falsify any one and verification fails with
// InvalidOpeningArgument(InvalidPowWitness). That is the property that makes the badge meaningful
// at all, and nothing was pinning it.
//
// It is also why "just drop repid_score from the statement to fix the privacy leak" is WRONG and
// is recorded here so nobody tries it: removing the field returns `missing field repid_score` and
// the proof stops verifying entirely. The score is bound into the circuit; taking it out of the
// statement is not a payload edit, it is a new circuit.
try {
  const { verify } = await import(join(dir, 'node_modules', '@hyperdag', 'proof-verifier', 'index.js'))
    .catch(() => import('@hyperdag/proof-verifier'));
  const raw = run('npx', ['trustshell', 'proof', AGENT, '--json'], { timeout: 120000 });
  const pr = JSON.parse(raw);
  const stmt = typeof pr.statement === 'string' ? JSON.parse(pr.statement) : pr.statement;
  const base = await verify(pr.proofBytes, stmt);
  const mutations = {
    repid_score: { ...stmt, repid_score: Number(stmt.repid_score) + 7777 },
    threshold: { ...stmt, threshold: 1 },
    agent_id: { ...stmt, agent_id: '00000000-0000-4000-8000-000000000000' },
  };
  const survived = [];
  for (const [field, mutated] of Object.entries(mutations)) {
    const r = await verify(pr.proofBytes, mutated);
    if (r?.verified === true) survived.push(field);
  }
  if (base?.verified !== true) record('zkrepid.tamper_evidence', 'FAILED', 'the untampered baseline did not verify');
  else if (survived.length) record('zkrepid.tamper_evidence', 'FAILED',
    `verification SURVIVED falsifying: ${survived.join(', ')} — those fields are not bound to the proof`);
  else record('zkrepid.tamper_evidence', 'MEASURED',
    'falsifying agent_id, repid_score or threshold each breaks verification — all three are bound public inputs');
} catch (e) {
  record('zkrepid.tamper_evidence', 'NOT_CHECKED', `could not drive the verifier directly: ${String(e.message).slice(0, 110)}`);
}

// BINDING SCOPE — which statement fields the proof actually commits to, and which it ignores.
//
// This leg exists because the obvious fix for the freshness defect is to add `expires_at` to the
// statement, and MEASURED 2026-08-30 that would be a lie. serde ignores unknown fields, so the
// verifier returns verified:true with expires_at set to a future date, to 1999, to the string
// "whatever i like", or removed entirely. An expiry added that way would render inside a verified
// proof while committing to nothing — a new instance of the precise defect this repo keeps paying
// for, introduced by the fix for another one.
//
// So the scope is pinned: the four canonical keys are bound (falsifying any breaks verification),
// and ANYTHING ELSE is decoration the verifier does not check. A real expiry is a circuit public
// input and a verifier major, not a key in a JSON blob.
let unknownKeysIgnored = null; // null = NOT_CHECKED; true = decoration; false = verifier checks them
try {
  const { verify } = await import(join(dir, 'node_modules', '@hyperdag', 'proof-verifier', 'index.js'))
    .catch(() => import('@hyperdag/proof-verifier'));
  const pr = JSON.parse(run('npx', ['trustshell', 'proof', AGENT, '--json'], { timeout: 120000 }));
  const stmt = typeof pr.statement === 'string' ? JSON.parse(pr.statement) : pr.statement;
  const ignored = [];
  for (const bogus of [
    { expires_at: '1999-01-01T00:00:00Z' },
    { expires_at: 'whatever i like' },
    { not_a_real_field: true },
  ]) {
    const r = await verify(pr.proofBytes, { ...stmt, ...bogus });
    if (r?.verified === true) ignored.push(Object.keys(bogus)[0]);
  }
  unknownKeysIgnored = ignored.length > 0;
  if (ignored.length === 0) {
    record('zkrepid.statement_binding_scope', 'MEASURED', 'the verifier rejects unknown statement keys — an added expiry WOULD be checked');
  } else {
    record('zkrepid.statement_binding_scope', 'MEASURED',
      'unknown statement keys are IGNORED by the verifier — anything beyond the four canonical keys commits to nothing',
      { bound: ['agent_id', 'repid_score', 'threshold'], ignored_examples: [...new Set(ignored)] });
  }
} catch (e) {
  record('zkrepid.statement_binding_scope', 'NOT_CHECKED', String(e.message).slice(0, 110));
}

// FRESHNESS is TWO independent faults, and the first draft of this file lumped them into one leg.
// That was this gate committing the exact defect it exists to catch. The single leg keyed on AGE,
// so the moment a fresh proof is served it records MEASURED — and the unbound-expiry finding, which
// no amount of freshness fixes, disappears from the report along with it. A defect must not be
// retired because an unrelated number improved.
//
//   zkrepid.freshness       OPERATIONAL. Is the proof the user is served CURRENT? Today it is not,
//                           and the cause is known and fixed but not yet deployed: the canonical
//                           store write has failed on every attempt since 2026-08-01 (42804,
//                           repid-engine #549), so every consumer is served the last row that
//                           landed. This leg SHOULD go MEASURED when that deploys — that is the
//                           signal the fix worked, which is why it is worth having on its own.
//
//   zkrepid.expiry_binding  CIRCUIT. Does the proof COMMIT to a validity window? No deploy can fix
//                           this one. `createdAt` travels beside the proof as metadata, not as a
//                           public input, so an age check built on it catches a stale issuer and
//                           never a lying one — a backdated createdAt costs nothing to write.
//
// The second leg deliberately does NOT test for the presence of an expiry key. Measured on
// 2026-08-30 and pinned by zkrepid.statement_binding_scope above: the verifier ignores unknown
// statement fields, so an `expires_at` added to the JSON renders inside a verified proof while
// committing to nothing. Presence would therefore be the WORST evidence available — it reads as
// attested precisely where nothing is attested. This leg reasons from the binding measurement.
if (proofCreatedAt) {
  const ageDays = (Date.now() - Date.parse(proofCreatedAt)) / 86400000;
  const live = liveScore == null ? null : Number(liveScore);
  const attested = proofStatement?.repid_score ?? null;
  const drifted = live != null && attested != null && live !== attested;
  const drift = drifted ? `; it attests ${attested} while the live score is ${live}` : '';
  if (ageDays > 7) {
    record('zkrepid.freshness', 'FAILED',
      `the served proof is ${ageDays.toFixed(0)} days old${drift}` +
      ' — the store write has been failing since 2026-08-01, so consumers get the last row that landed',
      { createdAt: proofCreatedAt, attested, live, ageDays: Number(ageDays.toFixed(1)) });
  } else {
    record('zkrepid.freshness', 'MEASURED', `the served proof is ${ageDays.toFixed(1)} days old${drift}`);
  }
} else {
  record('zkrepid.freshness', 'NOT_CHECKED', 'no createdAt on the proof');
}

if (proofStatement == null) {
  record('zkrepid.expiry_binding', 'NOT_CHECKED', 'no statement parsed — see zkrepid.proof');
} else if (unknownKeysIgnored === null) {
  record('zkrepid.expiry_binding', 'NOT_CHECKED', 'binding scope unmeasured — see zkrepid.statement_binding_scope');
} else {
  const windowKey = ['valid_until', 'expires_at', 'not_after'].find((k) => proofStatement[k] !== undefined);
  if (windowKey && unknownKeysIgnored === false) {
    record('zkrepid.expiry_binding', 'MEASURED', `the statement carries \`${windowKey}\` and the verifier binds it`);
  } else if (windowKey) {
    record('zkrepid.expiry_binding', 'FAILED',
      `the statement carries \`${windowKey}\` but the verifier IGNORES unknown keys — it renders as attested ` +
      'while committing to nothing, which is worse than carrying no expiry at all',
      { window_key: windowKey, bound: false });
  } else {
    record('zkrepid.expiry_binding', 'FAILED',
      'the proof commits to no validity window — a bound window means valid_from/valid_until as circuit ' +
      'public inputs, i.e. a verifier major AND a matching prover, not a key added to the statement JSON',
      { statement_keys: Object.keys(proofStatement), createdAt_is_bound: false });
  }
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

// --- x402: the capability this gate did not test at all ----------------------
//
// The MVP is advertised as four things — HAL, zkRepID, x402, ERC-8004. Until now this file had
// legs for three. x402 was absent, and an absent capability reads as fine: it contributes no
// FAILED, no NOT_CHECKED, and no line in the summary. That is the two-outcome collapse this gate
// exists to prevent, arriving as a coverage gap instead of a wrong verdict.
//
// Two things are genuinely measurable from a cold, keyless install, and they are the two a
// stranger must be able to do before any payment is possible: find something to buy, and produce
// a valid payment authorization. Settlement is NOT_CHECKED and is never attempted here.

try {
  const { TrustShell } = await import(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'lib', 'index.js'));
  const page = await new TrustShell({}).listServices({ limit: 5 });
  const services = page?.services ?? [];
  if (!Array.isArray(services)) record('x402.discovery', 'FAILED', `listServices returned no services array (keys: ${Object.keys(page ?? {}).join(',')})`);
  else if (services.length === 0) record('x402.discovery', 'FAILED', 'the marketplace is empty — a stranger has nothing to pay for');
  else record('x402.discovery', 'MEASURED', `${services.length} purchasable service(s) visible without a key`,
    { count: page.count, priceRangeUsdcRaw: page.priceRangeUsdcRaw });
} catch (e) {
  record('x402.discovery', 'FAILED', `keyless listServices threw: ${String(e.message).slice(0, 140)}`);
}

// PAYMENT AUTHORIZATION. Signed locally with a throwaway key generated in this file; nothing is
// broadcast, no chain call is made, and the address holds nothing. This is pure EIP-712 signing.
//
// The check is SIGNER RECOVERY, not field shape. A well-shaped blob with a bad signature is
// exactly the failure that would pass a shape check and be rejected by the facilitator, i.e. the
// user finds out at the till.
//
// TWO STEPS, because one cannot distinguish two very different faults:
//   step 1 pins the EIP-712 domain explicitly, so a recovery failure means SIGNING is broken;
//   step 2 uses the SDK's DEFAULTS and recovers against the documented Base Sepolia domain, so a
//          failure there means the default network or asset MOVED.
// The second matters on its own: if that default ever became a mainnet asset, every caller who
// omits `asset`/`chainId` would sign an authorization against real money believing it was testnet.
//
// IF YOU SABOTAGE THIS LEG TO CHECK IT STILL FAILS — and you should — DO NOT CORRUPT THE `v` BYTE.
// MEASURED over 12 signatures: flipping only the trailing recovery byte left verification passing
// 5 times out of 12, exactly the number whose v was 0x1c, because ethers reduces v to its parity
// and a corrupt byte lands on the original parity about half the time. A tamper test that passes
// half the time reads as a flaky gate and is really a flaky instrument — it cost a round here.
// Corrupt a digit inside r/s instead: 0 of 12 survived, and the sabotage then fails 3 runs of 3.
try {
  const { buildX402Payment } = await import(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'lib', 'index.js'));
  const { verifyTypedData, Wallet } = await import(join(dir, 'node_modules', 'ethers', 'lib.esm', 'index.js'))
    .catch(() => import(join(dir, 'node_modules', 'ethers')));

  const KEY = '0x' + 'ab'.repeat(32);
  const PAYER = new Wallet(KEY).address;
  const TO = '0x000000000000000000000000000000000000dEaD';
  const SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const CANON = ['from', 'nonce', 'signature', 'to', 'validAfter', 'validBefore', 'value'];
  const types = { TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
  const decode = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
  const recovers = (payload, domain) => {
    const { signature, ...msg } = payload;
    try { return verifyTypedData(domain, types, msg, signature).toLowerCase() === String(payload.from).toLowerCase(); }
    catch { return false; }
  };

  // step 1 — domain pinned by this test
  const pinnedDomain = { name: 'USDC', version: '2', chainId: 84532, verifyingContract: SEPOLIA_USDC };
  const pinned = decode(await buildX402Payment({ privateKey: KEY, to: TO, amount: 100000, asset: SEPOLIA_USDC, chainId: 84532 }));
  const missing = CANON.filter((k) => pinned[k] === undefined);

  if (missing.length) {
    record('x402.payment_header', 'FAILED', `the header omits ${missing.join(', ')} — the facilitator decodes all seven`);
  } else if (String(pinned.from).toLowerCase() !== PAYER.toLowerCase()) {
    record('x402.payment_header', 'FAILED', `header claims from=${pinned.from} but the key signs as ${PAYER}`);
  } else if (!recovers(pinned, pinnedDomain)) {
    record('x402.payment_header', 'FAILED',
      'the EIP-712 signature does NOT recover to the payer on an explicitly pinned domain — the ' +
      'authorization is well-shaped and invalid, which a facilitator rejects at settlement, not here');
  } else {
    // step 2 — the SDK's own defaults
    const defaulted = decode(await buildX402Payment({ privateKey: KEY, to: TO, amount: 100000 }));
    if (!recovers(defaulted, pinnedDomain)) {
      record('x402.payment_header', 'FAILED',
        'signing is sound on a pinned domain but the SDK DEFAULTS no longer recover against Base ' +
        'Sepolia USDC — the default network or asset moved, and a caller who omits asset/chainId ' +
        'would sign against something other than testnet');
    } else {
      record('x402.payment_header', 'MEASURED',
        'a valid EIP-3009 authorization is produced from a cold install and its signature recovers ' +
        'to the payer; SDK defaults are still Base Sepolia USDC (84532)',
        { fields: CANON.length, validForSeconds: defaulted.validBefore - Math.floor(Date.now() / 1000) });
    }
  }
} catch (e) {
  record('x402.payment_header', 'NOT_CHECKED', `could not drive buildX402Payment: ${String(e.message).slice(0, 130)}`);
}

// SETTLEMENT is deliberately never attempted. Releasing an authorization moves real testnet USDC
// and needs a funded key; a gate that did it would be spending money to report a status, and a
// gate that SIMULATED it and reported MEASURED would be certifying a payment that never happened.
record('x402.settlement', 'NOT_CHECKED',
  'not attempted by design — releasing an authorization moves real testnet USDC. Run it with a ' +
  'funded Base Sepolia key against POST /api/v1/contracts/:id/escrow, outside this gate');

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
// DECIDED 2026-08-30: identity is a KEYED step, and that is now stated in the README's
// keyless-vs-keyed table and its Honest limits. So the product no longer overclaims — but the
// leg stays FAILED, because this gate answers "can a stranger get all four capabilities", and
// the honest answer is still no for on-chain identity. Documenting a gap closes the dishonesty,
// not the gap. It flips to MEASURED only when a keyless path actually mints, or when the MVP's
// definition of done formally drops on-chain identity from the four.
record('erc8004.identity_for_new_user', 'FAILED',
  'BY DESIGN, now documented: register() is keyless and never mints; POST /agents/:id/mint is key-gated. ' +
  'A stranger finishes onboarding with no on-chain identity — reputation, proofs and badge all work without one',
  { registerRoute: 'src/routes/agents-external.ts', mintRoute: 'src/routes/agents-onchain.ts (auth required)',
    documented: 'README keyless-vs-keyed table + Honest limits', decision: '2026-08-30 — keyed step, report NOT_MINTED honestly' });

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
