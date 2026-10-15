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
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// What npm serves a stranger today. This defaulted to a pinned '1.3.0' until 2026-10-04, so the
// daily e2e-honesty run kept certifying a version npm no longer installs (latest was 1.4.0).
const VERSION = arg('--version', 'latest');
const RPC = arg('--rpc', process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
const ENGINE = arg('--engine', process.env.REPID_ENGINE_URL || 'https://repid-engine-production.up.railway.app');
const SITE = arg('--site', process.env.TRUSTSHELL_SITE_URL || 'https://trustshell.dev');
const AGENT = arg('--agent', 'trinity-sophia');
const JSON_OUT = argv.includes('--json');

// Base Sepolia, from repid-engine src/config/network.ts. Pinned deliberately: if the product
// moves chains this file must fail rather than follow.
const CHAIN_ID = 84532;
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const legs = [];

/**
 * TIMINGS ARE OBSERVATIONS, NEVER VERDICTS.
 *
 * Recorded so a later question about weights, quorum size or budgets can be answered with
 * numbers instead of intuition. They deliberately do NOT influence any leg: a slow provider is
 * not a failing one, and a gate that reddened on latency would redden on someone else's bad
 * afternoon.
 *
 * Every figure here is n=1 from a single cold run, and is labelled that way in the output for
 * one reason: this project has already had to retract published numbers taken from a sample
 * nobody characterised. One run tells you an order of magnitude and whether a path is alive. It
 * does not support tuning anything, and 2-4 real events a day will not either.
 */
const perf = {};
const since = (t0) => Date.now() - t0;

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

/**
 * Load a module FROM THE COLD INSTALL, and from nowhere else.
 *
 * This replaced `import(join(dir,'node_modules','@hyperdag','proof-verifier','index.js'))
 * .catch(() => import('@hyperdag/proof-verifier'))`, which was wrong twice over and CI is what
 * caught it. The path guessed `index.js`; the package's `main` is `js/index.js` and it ships no
 * `exports` map, so the first import ALWAYS failed. The `.catch()` then resolved the bare
 * specifier — which, because this file lives inside the repo, found the REPO'S OWN dev
 * dependency. Three legs therefore reported MEASURED locally while testing the development tree,
 * not the package npm serves, which is this gate's entire claim. On a runner with no `npm ci`
 * there was nothing to fall back to and they turned NOT_CHECKED, which is how it surfaced.
 *
 * So: resolve through the cold directory's own require, which honours `main` rather than guessing
 * a filename, and DO NOT fall back. If it cannot be loaded from there, that is the finding — a
 * dependency a user's install does not get — and the leg must say NOT_CHECKED rather than quietly
 * borrowing one from here.
 */
const coldRequire = createRequire(join(dir, 'package.json'));
let resolvedVersion = null;
const fromColdInstall = (specifier) => import(pathToFileURL(coldRequire.resolve(specifier)).href);

try {
  run('npm', ['install', `@hyperdag/trustshell@${VERSION}`, '--no-audit', '--no-fund']);
  try { resolvedVersion = JSON.parse(readFileSync(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'package.json'), 'utf8')).version ?? null; } catch { /* left null: the receipt says unknown */ }
  record('install', 'MEASURED', `npm i @hyperdag/trustshell@${VERSION} into an empty dir${resolvedVersion ? ` (installed ${resolvedVersion})` : ''}`);
} catch (e) {
  record('install', 'FAILED', String(e.message).slice(0, 200));
  finish();
}

// --- the optional peer the package tells a stranger to install ---------------
//
// `ethers` became an OPTIONAL peer in 1.6.0 (CHANGELOG: "If you sign payments, install it next to
// trustshell: npm i ethers@^6"). x402.payment_header recovers the signature with ethers, and the
// cold install above stopped bringing it, so from 2026-10-05 that leg read NOT_CHECKED
// ("Cannot find module 'ethers'") on every run. The baseline comparator counts a NOT_CHECKED nobody
// designed as a failure of the job — correctly — and the scheduled gate sat red for days.
//
// So do what the README tells a stranger who signs payments. The range comes from the INSTALLED
// manifest, not from a copy of it in this file, so the gate follows the package. Two things this
// is deliberately NOT:
//   * a fallback to the repo's own ethers — fromColdInstall() refuses that, and keeps refusing;
//   * a way to force x402.payment_header green — if the peer will not install, that is its own
//     FAILED leg, and the payment leg below still reports NOT_CHECKED with the reason.
//
// A package that declares no ethers peer gets no install and no leg: either ethers arrives as a
// dependency (then the payment leg measures it) or it does not (then that leg says why).
let ethersPeerRange = null;
try {
  ethersPeerRange = JSON.parse(readFileSync(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'package.json'), 'utf8'))
    .peerDependencies?.ethers ?? null;
} catch { /* unreadable manifest: nothing to install, and the legs below report what they can */ }
if (ethersPeerRange) {
  try {
    run('npm', ['install', `ethers@${ethersPeerRange}`, '--no-audit', '--no-fund']);
    let ethersVersion = null;
    try { ethersVersion = JSON.parse(readFileSync(join(dir, 'node_modules', 'ethers', 'package.json'), 'utf8')).version ?? null; } catch { /* left null */ }
    record('install.ethers_peer', 'MEASURED',
      `npm i ethers@${ethersPeerRange} next to trustshell, as the README instructs for x402 signing${ethersVersion ? ` (installed ${ethersVersion})` : ''}`);
  } catch (e) {
    record('install.ethers_peer', 'FAILED', `the documented optional-peer install did not succeed: ${String(e.message).slice(0, 160)}`);
  }
}

// --- can we reach the engine at all? -----------------------------------------
//
// THIS GATE WAS REPORTING FIVE REGRESSIONS THAT WERE THIS SANDBOX, NOT THE PRODUCT.
// hal.verify, repid.read, zkrepid.proof, badge and x402.discovery all reached the engine
// through a proxy that denies the host, and every one of them recorded FAILED — so the
// baseline comparison called them regressions against a product nobody had tested. That is
// the two-outcome collapse this file exists to prevent, committed by the file itself, and
// it is worse than a plain false alarm: once these legs are reliably red from a sandbox, a
// REAL regression in them is invisible, because it looks like the usual noise.
//
// THE TRAP IS THAT THE DENIAL IS NOT A TRANSPORT ERROR. Node's fetch does not throw here —
// it RESOLVES with a perfectly ordinary `403`, so "did it throw" cannot tell a refused
// CONNECT from an engine that answered "forbidden". Measured 2026-09-01, the proxy names
// itself and that is the only reliable discriminator:
//
//     status 403
//     x-deny-reason: host_not_allowed
//     Host not in allowlist: repid-engine-production.up.railway.app.
//
// So: a response carrying `x-deny-reason` means we never reached the engine → NOT_CHECKED.
// ANY other response, 403 included, means the engine answered and the legs below are
// testing the real thing → a failure there is real and stays FAILED.
let engineReachable = false;
let engineNote = '';
try {
  const te = Date.now();
  const res = await fetch(`${ENGINE}/health`, { signal: AbortSignal.timeout(20000) });
  perf.engine_health_ms = since(te);
  const denied = res.headers.get('x-deny-reason');
  if (denied) {
    engineNote = `egress to ${ENGINE} is blocked by this environment (${denied}) — rerun from CI or a host allowed to reach it, or pass --engine <reachable url>`;
    record('engine.reachable', 'NOT_CHECKED', engineNote);
  } else {
    engineReachable = true;
    record('engine.reachable', 'MEASURED', `${ENGINE} answered ${res.status}`);
  }
} catch (e) {
  engineNote = `no egress to ${ENGINE} from here (${String(e.message).slice(0, 80)}) — rerun from CI or a host with outbound HTTP, or pass --engine <reachable url>`;
  record('engine.reachable', 'NOT_CHECKED', engineNote);
}

/** Throw before spending a 90-180s CLI timeout on a host we already know is unreachable. */
const requireEngine = () => {
  if (!engineReachable) throw Object.assign(new Error(engineNote), { engineDown: true });
};

/**
 * The two meanings of a thrown error, kept apart. Unreachable is NOT_CHECKED and names the
 * parent leg the way the chain legs already name `chain.reachable`; anything else is a real
 * failure of a real engine and reads exactly as it did before.
 */
const recordEngineLeg = (leg, e) =>
  e?.engineDown || !engineReachable
    ? record(leg, 'NOT_CHECKED', 'engine unreachable — see engine.reachable')
    : record(leg, 'FAILED', String(e.stderr || e.message).slice(0, 160));

// --- the receipt URL people post: trustshell.dev/receipt/:id -------------------------------------
// The site does not render receipts; next.config.ts redirects /receipt/:id to the engine's keyless
// page, the one renderer. Until 2026-10-14 that URL was a 404. This leg asks the ENGINE for its
// newest receipt (contract id + settlement tx), opens it through the SITE, follows the redirects,
// and requires a 200 page that names that settlement tx. A 404, or a page that does not show this
// deal, is FAILED. Never having reached the site is NOT_CHECKED, as for the engine above.
if (!engineReachable) {
  record('site.receipt_url', 'NOT_CHECKED', 'engine unreachable — see engine.reachable');
} else {
  let latest = null;
  try {
    const r = await fetch(`${ENGINE}/api/v1/receipt/latest.json`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`the engine's newest receipt (/api/v1/receipt/latest.json) answered ${r.status}`);
    latest = await r.json();
    if (typeof latest?.contract_id !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(String(latest?.settlement_tx))) {
      throw new Error('the engine\'s newest receipt has no contract_id or settlement tx to look for');
    }
  } catch (e) {
    record('site.receipt_url', 'FAILED', String(e.message).slice(0, 160));
    latest = null;
  }
  if (latest) {
    const url = `${SITE}/receipt/${encodeURIComponent(latest.contract_id)}`;
    let page = null;
    try {
      page = await fetch(url, { signal: AbortSignal.timeout(20000) }); // follows the 308 to www and the 307 to the engine
    } catch (e) {
      record('site.receipt_url', 'NOT_CHECKED', `no egress to ${SITE} from here (${String(e.message).slice(0, 80)})`);
    }
    if (page) {
      const html = await page.text();
      const evidence = { url, landed_at: page.url, status: page.status, contract_id: latest.contract_id, settlement_tx: latest.settlement_tx };
      if (page.headers.get('x-deny-reason')) {
        record('site.receipt_url', 'NOT_CHECKED', `egress to ${SITE} is blocked by this environment`, evidence);
      } else if (page.status !== 200) {
        record('site.receipt_url', 'FAILED', `${url} answered ${page.status} (landed at ${page.url})`, evidence);
      } else if (!html.includes(latest.settlement_tx)) {
        record('site.receipt_url', 'FAILED', `${url} landed at ${page.url}, which does not name this deal's settlement tx`, evidence);
      } else {
        record('site.receipt_url', 'MEASURED', `${url} → ${page.url}: 200, names settlement tx ${latest.settlement_tx.slice(0, 10)}…`, evidence);
      }
    }
  }
}

// --- the four advertised capabilities ---------------------------------------
// HAL. A live cross-provider quorum: the assertion is that real providers answered, not merely
// that the process exited 0 — a verdict with an empty evidence list is the failure mode here.
try {
  requireEngine();
  const t0 = Date.now();
  const out = run('npx', ['trustshell', 'verify', 'The Earth orbits the Sun.', '--json'], { timeout: 180000 });
  perf.hal_verify_ms = since(t0);
  const j = JSON.parse(out);
  const providers = (j.evidence ?? j.providers ?? []).length;
  perf.hal_quorum_size = providers;
  if (!j.verdict && !j.decision) record('hal.verify', 'FAILED', 'no verdict field in --json output');
  else if (providers === 0) record('hal.verify', 'FAILED', 'verdict returned with ZERO provider evidence — a quorum of nobody');
  else record('hal.verify', 'MEASURED', `${j.verdict ?? j.decision}, ${providers} providers responded`);
} catch (e) {
  recordEngineLeg('hal.verify', e);
}

// HAL DISCRIMINATION — the leg above proves a quorum ANSWERED; it does NOT prove the answer is
// CORRECT. A HAL that vetoes everything, or passes everything, or returns a fixed verdict, sails
// through it. This leg asserts the property the product actually sells: a known-FALSE claim is
// vetoed and a known-TRUE claim is not. It is the assertion the fabricated trinity_tasks
// "E2E-SMOKE nightly" only ever claimed (agents with no HTTP client reported `claims_pass` —
// v_e2e_smoke_nightly_truth shows 0 real verifications). Verdicts confirmed live 2026-09-13
// against POST /api/v1/hal/evaluate: "…in Paris" -> clean, "…in Rome" -> vetoed, real 2-provider
// quorum each. A regression here (HAL stops discriminating) goes FAILED and reddens the nightly.
const verdictOf = (text) => {
  // `trustshell verify` EXITS NON-ZERO when the claim is vetoed — that is a real verdict, not a
  // command failure, and the JSON is still on stdout. execFileSync throws on non-zero, so catch
  // and read stdout (the same pattern acceptance-baseline.mjs uses on this gate's own exit code).
  // Only a genuinely empty stdout is a real failure. Without this, the false-claim leg — which
  // MUST be vetoed to pass — would always throw, which is why the existing hal.verify leg only
  // ever used a clean statement.
  let out;
  try {
    out = run('npx', ['trustshell', 'verify', text, '--json'], { timeout: 180000 });
  } catch (e) {
    if (e.stdout == null || String(e.stdout).trim() === '') throw e;
    out = e.stdout;
  }
  const j = JSON.parse(out);
  return String(j.verdict ?? j.decision ?? '').toLowerCase();
};
try {
  requireEngine();
  const td = Date.now();
  const truthy = verdictOf('The Eiffel Tower is in Paris, France.'); // true → must NOT be vetoed
  const falsy = verdictOf('The Eiffel Tower is in Rome, Italy.');     // false → must be vetoed
  perf.hal_discrimination_ms = since(td);
  const truthyVetoed = /veto/.test(truthy);
  const falsyVetoed = /veto/.test(falsy);
  if (falsyVetoed && !truthyVetoed) {
    record('hal.discrimination', 'MEASURED',
      `true-claim → '${truthy}' (not vetoed), false-claim → '${falsy}' (vetoed) — HAL discriminates`);
  } else {
    record('hal.discrimination', 'FAILED',
      `HAL did NOT discriminate: true-claim → '${truthy}' (want not-vetoed), ` +
      `false-claim → '${falsy}' (want vetoed). A quorum answered but the answers do not separate ` +
      'true from false — the property the product sells is not holding');
  }
} catch (e) {
  recordEngineLeg('hal.discrimination', e);
}

// THE TERMINAL DOOR: `trustshell check "<sentence>"` must give the same label the Chrome extension
// and trustshell.dev/check give, from the package npm serves. NORTH milestone 1 names it. Exit codes
// are the CLI's contract: pass 0, veto 1, not-checked 2. A version without the command answers with
// the CLI's usage error, which is FAILED here — the advertised door does not exist in that package.
const claimOf = (sentence) => {
  try {
    const out = run('npx', ['trustshell', 'check', sentence], { timeout: 60000 });
    return { code: 0, label: out.split('\n')[0].trim() };
  } catch (e) {
    return { code: e.status ?? null, label: String(e.stdout ?? '').split('\n')[0].trim(), err: String(e.stderr ?? '').slice(0, 160) };
  }
};
try {
  requireEngine();
  const t = claimOf('Paris is the capital of France.');
  const f = claimOf('The Moon is made of cheese.');
  const EXIT = { pass: 0, veto: 1, 'not-checked': 2 };
  const contractHeld = [t, f].every((r) => r.label in EXIT && r.code === EXIT[r.label]);
  const wrongWay = t.label === 'veto' || f.label === 'pass';
  if (t.label === 'pass' && f.label === 'veto' && contractHeld) {
    record('claim.check', 'MEASURED', 'check "<true>" → pass (exit 0), check "<false>" → veto (exit 1)');
  } else if (contractHeld && !wrongWay) {
    // An abstention (a voter over its per-minute budget, a timeout) is the product answering
    // honestly that it could not check. Not a pass, and not a wrong answer either.
    record('claim.check', 'NOT_CHECKED',
      `the command works, but the classifier abstained: "${t.label}" and "${f.label}" — re-run when /api/v1/classify/stats shows no budget abstains`, { t, f });
  } else {
    record('claim.check', 'FAILED',
      `want pass/0 and veto/1, got "${t.label}"/${t.code} and "${f.label}"/${f.code}${t.err ? ` — ${t.err}` : ''}`, { t, f });
  }
} catch (e) {
  recordEngineLeg('claim.check', e);
}

// RepID: keyless read.
let liveScore = null;
try {
  requireEngine();
  const j = JSON.parse(run('npx', ['trustshell', 'repid', AGENT, '--json'], { timeout: 90000 }));
  liveScore = j.repid ?? j.repid_score ?? j.score ?? null;
  if (liveScore == null) record('repid.read', 'FAILED', 'no score field in --json output');
  else record('repid.read', 'MEASURED', `${AGENT} = ${liveScore} (${j.tier ?? 'no tier'})`);
} catch (e) {
  recordEngineLeg('repid.read', e);
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
  requireEngine();
  const j = JSON.parse(run('npx', ['trustshell', 'proof', AGENT, '--verify', '--json'], { timeout: 120000 }));
  const verified = j?.verification?.verified === true;
  proofStatement = typeof j.statement === 'string' ? JSON.parse(j.statement) : j.statement;
  proofCreatedAt = j.createdAt ?? null;
  if (!j.proofBytes) record('zkrepid.proof', 'FAILED', 'no proofBytes returned');
  else if (!verified) record('zkrepid.proof', 'FAILED', `client-side verification did NOT pass: ${j?.verification?.error ?? 'no reason given'}`);
  else record('zkrepid.proof', 'MEASURED', `${j.scheme} verified client-side by ${j.verification.verifierVersion}`);
} catch (e) {
  recordEngineLeg('zkrepid.proof', e);
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
  const { verify } = await fromColdInstall('@hyperdag/proof-verifier');
  const raw = run('npx', ['trustshell', 'proof', AGENT, '--json'], { timeout: 120000 });
  const pr = JSON.parse(raw);
  const stmt = typeof pr.statement === 'string' ? JSON.parse(pr.statement) : pr.statement;
  const tv = Date.now();
  const base = await verify(pr.proofBytes, stmt);
  // The pure client-side verification, with no fetch in it — the figure a consumer pays.
  perf.proof_verify_ms = since(tv);
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
  const { verify } = await fromColdInstall('@hyperdag/proof-verifier');
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
//   zkrepid.freshness       OPERATIONAL. Is the proof the user is served CURRENT? It measures ONE
//                           thing — the age of the served proof — and as of 2026-09-22 it states
//                           only that. It used to assert a CAUSE it had never checked: "the
//                           canonical store write has failed on every attempt since 2026-08-01
//                           (42804, repid-engine #549)". That was true when written and was false
//                           by the time it fired, and a reader acting on the failure message went
//                           looking for a fixed bug.
//
//                           WHAT WAS ACTUALLY TRUE on the day this was corrected [ALL MEASURED
//                           2026-09-22 against the production database and the Railway logs]:
//
//                             * The store write was FINE. 22,450 real plonky3 proofs exist and
//                               rows landed as recently as 2026-09-20 — so the hardcoded 42804
//                               claim was refuted outright, not merely stale.
//                             * The probe's agent (trinity-sophia) was last proved 2026-09-14,
//                               which is exactly why this leg first tripped on 09-21 at "7 days"
//                               and read "8 days" on 09-22. Her own queued jobs date from
//                               2026-07-28 and sit behind a ~40k backlog.
//                             * SEPARATELY, and SIX DAYS LATER, proof-drain-worker died on
//                               `password authentication failed for user "postgres"`, taking every
//                               direct-Postgres caller in repid-engine with it.
//
//                           THE TWO ARE NOT THE SAME EVENT, and the tempting summary — "the drain
//                           is down, that is why the proof is stale" — gets the order backwards:
//                           the staleness predates the outage by six days. The first draft of this
//                           very comment said it, which is the point. A cause that fits is not a
//                           cause that was measured.
//
//                           So this leg now reports its ONE measurement and names the two readings
//                           that separate the candidates, rather than picking one. An acceptance
//                           gate that hardcodes a diagnosis ages into a confident wrong answer —
//                           the defect it exists to catch, wearing its own uniform.
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
      ' — CAUSE NOT CHECKED FROM HERE. This gate measures age only. To tell the candidates apart:' +
      ' is repid_zkp_proofs still taking rows (store write healthy, this agent simply not re-proved)' +
      ' and is proof-drain-worker draining (repid_proof_queue pending count falling)?',
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
  requireEngine();
  const svg = run('npx', ['trustshell', 'badge', AGENT], { timeout: 120000 });
  if (!svg.includes('<svg')) record('badge', 'FAILED', 'no SVG emitted');
  else if (!/ZK-verified/i.test(svg)) record('badge', 'FAILED', 'SVG emitted but not in the verified state');
  else record('badge', 'MEASURED', 'self-contained SVG in the verified state');
} catch (e) {
  recordEngineLeg('badge', e);
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
  requireEngine();
  const { TrustShell } = await fromColdInstall('@hyperdag/trustshell');
  const page = await new TrustShell({}).listServices({ limit: 5 });
  const services = page?.services ?? [];
  if (!Array.isArray(services)) record('x402.discovery', 'FAILED', `listServices returned no services array (keys: ${Object.keys(page ?? {}).join(',')})`);
  else if (services.length === 0) record('x402.discovery', 'FAILED', 'the marketplace is empty — a stranger has nothing to pay for');
  else record('x402.discovery', 'MEASURED', `${services.length} purchasable service(s) visible without a key`,
    { count: page.count, priceRangeUsdcRaw: page.priceRangeUsdcRaw });
} catch (e) {
  e?.engineDown || !engineReachable
    ? record('x402.discovery', 'NOT_CHECKED', 'engine unreachable — see engine.reachable')
    : record('x402.discovery', 'FAILED', `keyless listServices threw: ${String(e.message).slice(0, 140)}`);
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
  const { buildX402Payment } = await fromColdInstall('@hyperdag/trustshell');
  const { verifyTypedData, Wallet } = await fromColdInstall('ethers');

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
  const tb = Date.now();
  const pinned = decode(await buildX402Payment({ privateKey: KEY, to: TO, amount: 100000, cap: 100000, origin: 'Cli', asset: SEPOLIA_USDC, chainId: 84532 }));
  perf.x402_header_build_ms = since(tb);
  const missing = CANON.filter((k) => pinned[k] === undefined);

  if (missing.length) {
    record('x402.payment_header', 'FAILED', `the header omits ${missing.join(', ')} — the facilitator decodes all seven`);
  } else if (String(pinned.from).toLowerCase() !== PAYER.toLowerCase()) {
    record('x402.payment_header', 'FAILED', `header claims from=${pinned.from} but the key signs as ${PAYER}`);
  } else if ((() => { const tr = Date.now(); const ok = recovers(pinned, pinnedDomain); perf.x402_recover_ms = since(tr); return !ok; })()) {
    record('x402.payment_header', 'FAILED',
      'the EIP-712 signature does NOT recover to the payer on an explicitly pinned domain — the ' +
      'authorization is well-shaped and invalid, which a facilitator rejects at settlement, not here');
  } else {
    // step 2 — the SDK's own defaults
    const defaulted = decode(await buildX402Payment({ privateKey: KEY, to: TO, amount: 100000, cap: 100000, origin: 'Cli' }));
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
  const tc = Date.now();
  const j = await rpc('eth_chainId', []);
  perf.rpc_chainid_ms = since(tc);
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
    const tg = Date.now();
    const code = await rpc('eth_getCode', [IDENTITY_REGISTRY, 'latest']);
    perf.rpc_getcode_ms = since(tg);
    const bytes = ((code.result || '0x').length - 2) / 2;
    if (bytes < 2) record('erc8004.registry', 'FAILED', 'identity registry has no code at the pinned address');
    else record('erc8004.registry', 'MEASURED', `identity registry deployed (${bytes} bytes)`);
  } catch (e) {
    record('erc8004.registry', 'NOT_CHECKED', String(e.message).slice(0, 120));
  }
} else {
  record('erc8004.registry', 'NOT_CHECKED', 'chain unreachable — see chain.reachable');
}

// --- ON-CHAIN RECEIPTS: what the product says happened, read back from Base Sepolia -----------
//
// Added 2026-10-14 (Sean: "more on-chain E2E tests with receipts"). Four legs, all KEYLESS and
// READ-ONLY: nothing here signs, sends or writes anything, and nothing needs a secret.
//
// THE ENGINE IS ONLY A POINTER. Each leg asks a public engine endpoint WHICH transaction, proof or
// attestation to look at, then establishes every load-bearing fact from the chain through the public
// RPC: the tx status, the contract it hit, the token that moved and how much, the block time, and
// whether an attestation exists and is unrevoked. An engine that named a wrong or stale artifact turns
// a leg FAILED; it can never turn one MEASURED on its word alone.
//
// FRESHNESS IS DATED FROM THE CHAIN, not from the engine's timestamps, and every bound is stated in
// the failure message so a red night says how stale, not just "stale".
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const EAS_BASE_SEPOLIA = '0x4200000000000000000000000000000000000021'; // EAS predeploy on Base (OP stack)
const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const HOUR = 3600 * 1000;
const DEAL_MAX_AGE_H = 30;   // the dogfood deal settles daily around 12:00Z; one missed day goes red
const WRITE_MAX_AGE_H = 48;  // the ReputationRegistry write rides the daily deal
const PROOF_MAX_AGE_D = 7;   // the same bound zkrepid.freshness uses
const SKEW_MAX_MIN = 15;     // the engine's settled_at must agree with the block it names
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const lower = (s) => String(s ?? '').toLowerCase();
const short = (h) => `${String(h).slice(0, 10)}…`;

const getEngineJson = async (path) => {
  const res = await fetch(`${ENGINE}${path}`, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}`);
  return res.json();
};
const txReceipt = async (hash) => {
  const j = await rpc('eth_getTransactionReceipt', [hash]);
  if (!j.result) throw new Error(`the chain has no receipt for ${short(hash)}${j.error ? ` (${j.error.message})` : ''}`);
  return j.result;
};
const blockTimeMs = async (blockNumberHex) => {
  const j = await rpc('eth_getBlockByNumber', [blockNumberHex, false]);
  if (!j.result?.timestamp) throw new Error(`block ${blockNumberHex} has no timestamp${j.error ? ` (${j.error.message})` : ''}`);
  return parseInt(j.result.timestamp, 16) * 1000;
};
/** Why an on-chain leg cannot run here, or null when it can. Never a pass. */
const onchainBlocked = () =>
  !engineReachable ? 'engine unreachable — see engine.reachable'
    : !chainReachable ? 'chain unreachable — see chain.reachable'
      : null;

// 1. THE DAILY DOGFOOD DEAL. The newest REAL (non-simulated) settled x402 exchange in the public
// marketplace feed must be a successful USDC transfer of the agreed amount on Base Sepolia, its
// public receipt must name the same transaction, and the receipt page must render it.
let dealReceipt = null; // the public receipt JSON, reused by leg 2 as its pointer
{
  const blocked = onchainBlocked();
  if (blocked) record('onchain.daily_deal', 'NOT_CHECKED', blocked);
  else {
    try {
      const td = Date.now();
      const feed = await getEngineJson('/api/v1/marketplace/recent-transactions?limit=10');
      const deal = (feed.transactions ?? []).find((t) => t.is_simulated === false && t.status === 'settled' && TX_HASH.test(t.tx_hash ?? ''));
      if (!deal) {
        record('onchain.daily_deal', 'FAILED', 'the public feed shows no real (non-simulated) settled exchange with a settlement tx');
      } else {
        const r = await txReceipt(deal.tx_hash);
        const minedAt = await blockTimeMs(r.blockNumber);
        const transfer = (r.logs ?? []).find((l) => lower(l.address) === lower(USDC_BASE_SEPOLIA) && l.topics?.[0] === ERC20_TRANSFER);
        const moved = transfer ? BigInt(transfer.data) : null;
        dealReceipt = await getEngineJson(`/api/v1/receipt/${encodeURIComponent(deal.contract_id)}.json`);
        const page = await fetch(`${ENGINE}/api/v1/receipt/${encodeURIComponent(deal.contract_id)}`, { signal: AbortSignal.timeout(25000) });
        const html = page.ok ? await page.text() : '';
        perf.onchain_deal_ms = since(td);
        const ageH = (Date.now() - minedAt) / HOUR;
        const skewMin = Math.abs(minedAt - Date.parse(deal.settled_at)) / 60000;
        const wrong = [];
        if (r.status !== '0x1') wrong.push(`the settlement tx reverted (status ${r.status})`);
        if (lower(r.to) !== lower(USDC_BASE_SEPOLIA)) wrong.push(`the settlement tx went to ${r.to}, not Base Sepolia USDC`);
        if (moved === null) wrong.push('the settlement tx carries no USDC Transfer');
        else if (moved !== BigInt(deal.amount)) wrong.push(`USDC moved ${moved}, the deal says ${deal.amount}`);
        if (dealReceipt.settlement_tx !== deal.tx_hash) wrong.push(`the public receipt names settlement ${short(dealReceipt.settlement_tx)}, not ${short(deal.tx_hash)}`);
        if (dealReceipt.is_simulated !== false) wrong.push('the public receipt marks the exchange simulated');
        if (!html.includes(deal.tx_hash)) wrong.push(`the receipt page (${page.status}) does not show the settlement tx`);
        if (!(skewMin <= SKEW_MAX_MIN)) wrong.push(`the engine says settled at ${deal.settled_at} but the tx was mined ${new Date(minedAt).toISOString()} (${skewMin.toFixed(0)} min apart)`);
        if (!(ageH <= DEAL_MAX_AGE_H)) wrong.push(`the newest real deal was mined ${ageH.toFixed(1)}h ago (bound ${DEAL_MAX_AGE_H}h): the daily dogfood deal did not run`);
        const evidence = { contract_id: deal.contract_id, tx: deal.tx_hash, mined_at: new Date(minedAt).toISOString(), age_h: Number(ageH.toFixed(1)), amount_raw: String(deal.amount) };
        if (wrong.length) record('onchain.daily_deal', 'FAILED', wrong.join('; '), evidence);
        else {
          record('onchain.daily_deal', 'MEASURED',
            `${deal.buyer_agent_name} paid ${deal.provider_agent_name} ${deal.amount} USDC-raw: tx ${short(deal.tx_hash)} status 0x1 ` +
            `to Base Sepolia USDC, Transfer matches, public receipt and page name it; mined ${ageH.toFixed(1)}h ago`, evidence);
        }
      }
    } catch (e) {
      record('onchain.daily_deal', 'FAILED', String(e.message).slice(0, 200));
    }
  }
}

// 2. THE ERC-8004 REPUTATION WRITE. The newest on-chain RepID write the public record names must be a
// successful transaction TO the ReputationRegistry address the published package exports (not the
// address the engine reports), with a log the registry emitted, mined within 48h.
//
// WHY THE ENGINE NAMES THE TX: the public RPC caps eth_getLogs at a 200-block range (measured
// 2026-10-14: "eth_getLogs is limited to a 200 range"), so finding the newest write by scanning 48h
// (~86,400 blocks) would take ~430 calls. The pointer is the daily deal's receipt (`onchain_tx`), else
// the sample agent's passport (`reputation_onchain.last_write`). The chain decides the verdict.
{
  const blocked = onchainBlocked();
  if (blocked) record('onchain.erc8004_reputation_write', 'NOT_CHECKED', blocked);
  else {
    try {
      const { REPUTATION_REGISTRY_BASE_SEPOLIA } = await fromColdInstall('@hyperdag/trustshell');
      if (!/^0x[0-9a-fA-F]{40}$/.test(REPUTATION_REGISTRY_BASE_SEPOLIA ?? '')) {
        throw new Error('the installed package exports no REPUTATION_REGISTRY_BASE_SEPOLIA');
      }
      let tx = dealReceipt?.onchain_link_is_proven === true && TX_HASH.test(dealReceipt?.onchain_tx ?? '') ? dealReceipt.onchain_tx : null;
      let source = 'the daily deal receipt';
      if (!tx) {
        const passport = await getEngineJson(`/api/v1/passport/${encodeURIComponent(AGENT)}`);
        tx = TX_HASH.test(passport?.reputation_onchain?.last_write?.tx_hash ?? '') ? passport.reputation_onchain.last_write.tx_hash : null;
        source = `${AGENT}'s passport`;
      }
      if (!tx) {
        record('onchain.erc8004_reputation_write', 'FAILED', 'neither the daily deal receipt nor the passport names an on-chain RepID write');
      } else {
        const tw = Date.now();
        const r = await txReceipt(tx);
        const minedAt = await blockTimeMs(r.blockNumber);
        perf.onchain_write_ms = since(tw);
        const ageH = (Date.now() - minedAt) / HOUR;
        const registry = lower(REPUTATION_REGISTRY_BASE_SEPOLIA);
        const emitted = (r.logs ?? []).filter((l) => lower(l.address) === registry).length;
        const wrong = [];
        if (r.status !== '0x1') wrong.push(`the write reverted (status ${r.status})`);
        if (lower(r.to) !== registry) wrong.push(`the write went to ${r.to}, not the ReputationRegistry ${REPUTATION_REGISTRY_BASE_SEPOLIA}`);
        if (emitted === 0) wrong.push('the registry emitted no log in that tx');
        if (!(ageH <= WRITE_MAX_AGE_H)) wrong.push(`the newest write was mined ${ageH.toFixed(1)}h ago (bound ${WRITE_MAX_AGE_H}h)`);
        const evidence = { tx, source, block: parseInt(r.blockNumber, 16), mined_at: new Date(minedAt).toISOString(), age_h: Number(ageH.toFixed(1)) };
        if (wrong.length) record('onchain.erc8004_reputation_write', 'FAILED', wrong.join('; '), evidence);
        else record('onchain.erc8004_reputation_write', 'MEASURED',
          `tx ${short(tx)} (from ${source}) status 0x1 to the ReputationRegistry, ${emitted} registry log(s), block ${evidence.block}, mined ${ageH.toFixed(1)}h ago`, evidence);
      }
    } catch (e) {
      record('onchain.erc8004_reputation_write', 'FAILED', String(e.message).slice(0, 200));
    }
  }
}

// 3. THE zkRepID ANCHOR. The sample agent's latest real proof must verify CLIENT-SIDE with the
// verifier a stranger installs, and the EAS attestation it names must resolve on Base Sepolia,
// unrevoked, about the same agent and tier, made after the proof existed.
//
// WHAT THIS DOES NOT CHECK, stated so the MEASURED cannot be over-read: the attestation is a BATCH
// anchor (schema repid-real-proof-batch-v1: agentId, tier, merkleRoot, repidSnapshot, proofType,
// proofId). No inclusion path for this proof under that merkleRoot is served, so membership of THIS
// proof in the anchored batch is not established here.
{
  const blocked = onchainBlocked();
  if (blocked) record('onchain.zkrepid_eas_anchor', 'NOT_CHECKED', blocked);
  else {
    try {
      const { verify } = await fromColdInstall('@hyperdag/proof-verifier');
      let verifierVersion = null;
      try { verifierVersion = JSON.parse(readFileSync(join(dir, 'node_modules', '@hyperdag', 'proof-verifier', 'package.json'), 'utf8')).version ?? null; } catch { /* reported as unknown */ }
      const { Interface, AbiCoder } = await fromColdInstall('ethers');
      const passport = await getEngineJson(`/api/v1/passport/${encodeURIComponent(AGENT)}`);
      const endpoint = passport?.zkp?.proof_endpoint;
      if (typeof endpoint !== 'string' || !endpoint.startsWith('/')) throw new Error(`${AGENT}'s passport names no proof endpoint`);
      const pr = await getEngineJson(endpoint);
      const uid = pr?.eas?.attestation_uid;
      const tz = Date.now();
      const v = await verify(pr.proof_bytes, pr.statement);
      perf.onchain_proof_verify_ms = since(tz);
      const eas = new Interface(['function getAttestation(bytes32 uid) view returns (tuple(bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))']);
      const wrong = [];
      let att = null, payload = null;
      if (v?.verified !== true) wrong.push(`the proof did NOT verify client-side: ${v?.error ?? 'no reason given'}`);
      if (!TX_HASH.test(uid ?? '')) wrong.push('the proof names no EAS attestation uid');
      else {
        const call = await rpc('eth_call', [{ to: EAS_BASE_SEPOLIA, data: eas.encodeFunctionData('getAttestation', [uid]) }, 'latest']);
        if (!call.result) throw new Error(`getAttestation failed${call.error ? `: ${call.error.message}` : ''}`);
        [att] = eas.decodeFunctionResult('getAttestation', call.result);
        if (lower(att.uid) !== lower(uid)) wrong.push(`EAS has no attestation ${short(uid)} on Base Sepolia`);
        else {
          if (att.revocationTime !== 0n) wrong.push(`the attestation was REVOKED at ${new Date(Number(att.revocationTime) * 1000).toISOString()}`);
          if (/^0x0{40}$/i.test(att.attester)) wrong.push('the attestation has no attester');
          try {
            payload = AbiCoder.defaultAbiCoder().decode(['string', 'string', 'bytes32', 'uint256', 'string', 'uint64'], att.data);
          } catch { wrong.push('the attestation data does not decode as repid-real-proof-batch-v1'); }
          if (payload && payload[0] !== pr.statement?.agent_id) wrong.push(`the attestation is about agent ${payload[0]}, the proof about ${pr.statement?.agent_id}`);
          if (payload && payload[1] !== pr.statement?.tier) wrong.push(`the attestation says tier ${payload[1]}, the proof ${pr.statement?.tier}`);
          if (Number(att.time) * 1000 < Date.parse(pr.created_at) - 60000) wrong.push('the attestation predates the proof it is said to anchor');
        }
      }
      const ageD = (Date.now() - Date.parse(pr.created_at)) / (24 * HOUR);
      if (!(ageD <= PROOF_MAX_AGE_D)) wrong.push(`the latest proof is ${ageD.toFixed(1)} days old (bound ${PROOF_MAX_AGE_D})`);
      const evidence = {
        agent: AGENT, verifier: verifierVersion, uid, created_at: pr.created_at,
        attested_at: att ? new Date(Number(att.time) * 1000).toISOString() : null, attester: att?.attester ?? null,
        schema_uid: att?.schema ?? null, proof_type: payload?.[4] ?? null, batch_inclusion: 'NOT_CHECKED (no inclusion path served)',
      };
      if (wrong.length) record('onchain.zkrepid_eas_anchor', 'FAILED', wrong.join('; '), evidence);
      else record('onchain.zkrepid_eas_anchor', 'MEASURED',
        `${AGENT}'s latest proof verified client-side by @hyperdag/proof-verifier ${verifierVersion ?? '(version unread)'}; EAS ${short(uid)} resolves on Base Sepolia, ` +
        `unrevoked, same agent and tier, attested ${evidence.attested_at}; batch inclusion not checked`, evidence);
    } catch (e) {
      record('onchain.zkrepid_eas_anchor', 'FAILED', String(e.message).slice(0, 200));
    }
  }
}

// 4. A SEALED KERNEL RECEIPT, PUBLICLY. Verifying a kernel-receipt/1 (its hash and its six-claim
// envelope) needs a receipt a stranger can fetch without a key. None exists, and this leg MEASURES
// that rather than assuming it: the only route that serves one, GET /api/v1/kernel/receipt/:id, is
// mounted after authMiddleware, so a keyless request is refused. (Separately, the engine's gate has
// no production caller yet, so no sealed receipt would exist to serve: repid-engine #1371.)
// NOT_CHECKED with the measured reason, never a fabricated pass. Declared in acceptance-baseline.mjs
// so it cannot hide: the moment it turns MEASURED, the baseline entry goes STALE and the job says so.
if (!engineReachable) {
  record('kernel.receipt_public', 'NOT_CHECKED', 'engine unreachable — see engine.reachable');
} else {
  try {
    const res = await fetch(`${ENGINE}/api/v1/kernel/receipt/00000000-0000-4000-8000-000000000000`, { signal: AbortSignal.timeout(20000) });
    if (res.status === 401 || res.status === 403) {
      record('kernel.receipt_public', 'NOT_CHECKED',
        `no keyless surface serves a sealed kernel receipt: GET /api/v1/kernel/receipt/:id answered ${res.status} without a key. ` +
        'The hash and six-claim check exists (trustshell receipt <id>) but needs REPID_API_KEY');
    } else {
      record('kernel.receipt_public', 'NOT_CHECKED',
        `GET /api/v1/kernel/receipt/:id answered ${res.status} without a key, but there is no public index of receipt ids to fetch one by`);
    }
  } catch (e) {
    record('kernel.receipt_public', 'NOT_CHECKED', `the kernel receipt route could not be probed: ${String(e.message).slice(0, 120)}`);
  }
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
  // RECEIPT: with RECEIPT_DIR set, the run leaves a file a stranger can read later, not just a log.
  if (process.env.RECEIPT_DIR) {
    try {
      mkdirSync(process.env.RECEIPT_DIR, { recursive: true });
      writeFileSync(join(process.env.RECEIPT_DIR, `acceptance.${resolvedVersion ?? 'unknown'}.json`), JSON.stringify({
        suite: 'harness-acceptance', requested: VERSION, installed: resolvedVersion, engine: ENGINE,
        ran_at: new Date().toISOString(),
        counts: { measured: legs.length - failed.length - unchecked.length, not_checked: unchecked.length, failed: failed.length },
        legs, perf,
      }, null, 2) + '\n');
    } catch (e) { console.error(`receipt not written: ${e.message}`); }
  }
  if (JSON_OUT) console.log(JSON.stringify({ version: VERSION, installed: resolvedVersion, legs, perf }, null, 2));
  else {
    const shown = Object.entries(perf).filter(([, v]) => v != null);
    if (shown.length) {
      console.log('\nobserved this run (n=1 — an order of magnitude, not a basis for tuning):');
      console.log('  ' + shown.map(([k, v]) => `${k}=${v}${k.endsWith('_ms') ? 'ms' : ''}`).join('  '));
    }
    console.log(`\n${legs.filter((l) => l.verdict === 'MEASURED').length} measured · ${unchecked.length} not checked · ${failed.length} failed`);
    if (unchecked.length) console.log('NOT_CHECKED is not a pass. This run cannot certify those legs.');
  }
  process.exit(failed.length ? 1 : unchecked.length ? 2 : 0);
}
finish();
