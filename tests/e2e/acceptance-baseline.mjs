/**
 * THE ACCEPTANCE GATE, DIFFED AGAINST A DECLARED BASELINE.
 *
 * `harness-acceptance.mjs` exits 1 today because four real gaps are open. Wiring that exit code
 * straight into CI would paint the workflow permanently red, and this repo's own e2e-honesty.yml
 * says why that is worse than nothing: "an ignored gate is worse than no gate."
 *
 * The alternative people reach for — `continue-on-error` — is worse still. It turns the whole
 * gate into a line of log output nobody reads, which is the two-outcome collapse this suite exists
 * to prevent: "we did not look" wearing the colour of "it passed".
 *
 * So this compares the gate's ACTUAL verdicts against the ones we have decided to live with, and
 * fails on any DIFFERENCE in either direction:
 *
 *   a FAILED leg that is not in the baseline   -> a REGRESSION. Something new broke.
 *   a baseline leg that is now MEASURED        -> a STALE BASELINE. Good news, and still a failure:
 *                                                 an entry claiming a gap that is fixed will hide
 *                                                 that gap when it REOPENS, because forever after
 *                                                 it reads as the known case.
 *   a baseline leg that is now NOT_CHECKED     -> UNVERIFIED. Neither confirmed nor cleared, and
 *                                                 emphatically NOT grounds to delete the entry:
 *                                                 only MEASURED can retire one.
 *   a NOT_CHECKED leg that is not by-design    -> the ENVIRONMENT did not provide what this job
 *                                                 exists to provide (outbound HTTP to a Base
 *                                                 Sepolia RPC). Not an absence of signal — a
 *                                                 failure of the runner.
 *
 * The middle rule is the one people leave out, and it is the one that keeps a baseline from
 * quietly becoming a silencer. It is the same rule this ecosystem's red-team ledger already runs
 * on: a probe that HOLDS while its entry still stands is a failure, because the record lies.
 *
 * Every entry therefore carries a `why` and a `pointer`. An entry with neither is an anonymous
 * silencer and this file refuses to start with one.
 *
 *     node tests/e2e/acceptance-baseline.mjs [--rpc https://...]
 *
 * Exit: 0 the observed state matches the baseline exactly · 1 anything else.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Legs we have decided to live with, each with the reason and where the work is tracked.
 * Shrinking this list is the point of the project. Growing it needs a deliberate decision.
 */
const KNOWN_FAILED = {
  'zkrepid.privacy': {
    why: 'repid_score is a public circuit input; the score is load-bearing in the AIR boundary ' +
      'constraint (reconstructed == repid - threshold - 1), so privacy is a new circuit, not a payload edit',
    pointer: 'board task 82, blocked behind task 86 (the live prover has no source in any repository)',
  },
  // CORRECTED 2026-08-31. Both halves of the previous entry are now false, and the pointer was
  // actively misleading: it read "this leg should go MEASURED once #549 deploys". #549 HAS
  // deployed, the write DOES work, and the leg is still red — so the entry as written told the
  // next reader that the fix had failed. It had not.
  //
  // MEASURED against production, 2026-08-31:
  //   6 proof jobs completed in 24 h. The 2 from today wrote proof rows; the 4 from 2026-08-30
  //   12:04Z wrote none. A brand-new agent's proof landed in 4.96 s and was anchored on chain
  //   2 min later. The write is not failing today.
  //
  //   The default agent's staleness is a DIFFERENT thing, and the obvious explanation is wrong:
  //   it is NOT that nothing re-mints for an idle agent. It logged 13 score events after its
  //   last stored proof and enqueued a job as late as 2026-08-11 — jobs were raised and produced
  //   nothing. So the historical gap is real and was never backfilled, and no code deploy closes
  //   it: only re-minting does. That is why a stranger who registered minutes ago now holds a
  //   fresher, better artifact than the flagship agent.
  'zkrepid.freshness': {
    why: 'the proof write is HEALTHY again as of 2026-08-31 (measured: a cold-registered agent ' +
      'went request -> proof in 4.96 s -> on-chain anchor in 2 min 09 s). This leg stays red ' +
      'because the default agent\'s own 2026-08-01..08-11 gap was never backfilled — 13 score ' +
      'events after its last stored proof, jobs enqueued, no rows written. A deploy cannot fix ' +
      'a row that was never written; only a re-mint can.',
    pointer: 'board task 89 (backfill; all inputs verified recoverable) — needs a GO, not a deploy. ' +
      'NOT ESTABLISHED: which change flipped the write. The window is 2026-08-30 12:04Z (4/4 ' +
      'failed) to 2026-08-31 01:22Z (2/2 wrote), which brackets the prover-URL restoration but ' +
      'does not attribute it.',
  },
  'zkrepid.expiry_binding': {
    why: 'the proof commits to no validity window; createdAt is metadata beside the proof, not a ' +
      'public input, so an age check on it catches a stale issuer and never a lying one',
    pointer: 'board task 83, blocked behind task 86',
  },
  'erc8004.identity_for_new_user': {
    why: 'register() is keyless and never mints; the only minting route is bearer-gated, so a ' +
      'stranger finishes onboarding with no on-chain identity',
    pointer: 'decided 2026-08-30 — keep as a keyed step and report NOT_MINTED honestly; documented in README',
  },
};

/**
 * NOT_CHECKED legs that stay NOT_CHECKED even where the environment is perfect. There is exactly
 * one, and it is not an environment limit — it is a refusal.
 */
const BY_DESIGN_NOT_CHECKED = {
  'x402.settlement': {
    why: 'releasing an authorization moves real testnet USDC. A job that did it would spend money ' +
      'to report a status, and one that simulated it would certify a payment that never happened',
    pointer: 'run deliberately, with a funded key, outside CI',
  },
};

for (const [leg, e] of Object.entries({ ...KNOWN_FAILED, ...BY_DESIGN_NOT_CHECKED })) {
  if (!e.why || !e.pointer) {
    console.error(`baseline entry "${leg}" has no why/pointer — an anonymous entry is a silencer, not a baseline`);
    process.exit(1);
  }
}

const passthrough = process.argv.slice(2);
let report;
try {
  // The gate exits non-zero by design; execFileSync throws on that, and the JSON is still on stdout.
  const args = [join(HERE, 'harness-acceptance.mjs'), '--json', ...passthrough];
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    if (e.stdout == null) throw e;
    stdout = e.stdout;
  }
  report = JSON.parse(stdout);
} catch (e) {
  console.error(`the acceptance gate did not produce parseable JSON: ${String(e.message).slice(0, 300)}`);
  process.exit(1);
}

const verdictOf = new Map(report.legs.map((l) => [l.leg, l.verdict]));
const problems = [];

for (const l of report.legs) {
  if (l.verdict === 'FAILED' && !KNOWN_FAILED[l.leg]) {
    problems.push(`REGRESSION  ${l.leg} — FAILED and not in the baseline\n              ${l.detail ?? ''}`);
  }
  if (l.verdict === 'NOT_CHECKED' && !BY_DESIGN_NOT_CHECKED[l.leg]) {
    problems.push(
      `NOT_CHECKED ${l.leg} — this job exists to provide the environment this leg needs\n` +
      `              ${l.detail ?? ''}`,
    );
  }
}

for (const [leg, e] of Object.entries(KNOWN_FAILED)) {
  const v = verdictOf.get(leg);
  if (v === undefined) {
    problems.push(`STALE       ${leg} — in the baseline but the gate no longer reports this leg at all; remove or rename the entry`);
  } else if (v === 'NOT_CHECKED') {
    // NOT_CHECKED IS NOT EVIDENCE A GAP CLOSED, and treating it as such was this comparator
    // committing the same two-outcome collapse it exists to catch. Measured 2026-09-01: from a
    // sandbox that cannot reach the engine, three real KNOWN_FAILED entries went NOT_CHECKED and
    // this branch told the reader to DELETE them — which would destroy the record of a live gap
    // on the evidence of a network denial, and the deletion is exactly what the STALE rule above
    // exists to prevent. Only MEASURED can retire an entry.
    problems.push(
      `UNVERIFIED  ${leg} — in the baseline and NOT_CHECKED this run, so this run neither\n` +
      `              confirms the gap nor clears it. DO NOT delete the entry on this evidence:\n` +
      `              NOT_CHECKED means nobody looked. Re-run where the leg can actually execute.\n` +
      `              was: ${e.pointer}`,
    );
  } else if (v !== 'FAILED') {
    problems.push(
      `STALE       ${leg} — now ${v}. THIS IS GOOD NEWS AND STILL A FAILURE: delete the entry.\n` +
      `              An entry claiming a gap that is fixed hides that gap when it reopens.\n` +
      `              was: ${e.pointer}`,
    );
  }
}

const counts = report.legs.reduce((a, l) => ((a[l.verdict] = (a[l.verdict] ?? 0) + 1), a), {});
console.log(
  `@hyperdag/trustshell@${report.version} — ` +
  `${counts.MEASURED ?? 0} measured · ${counts.NOT_CHECKED ?? 0} not checked · ${counts.FAILED ?? 0} failed`,
);

if (problems.length === 0) {
  console.log(`matches the baseline: ${Object.keys(KNOWN_FAILED).length} known gap(s), 1 refused by design.`);
  console.log('This is NOT "the MVP works" — it is "nothing changed". The known gaps are still open.');
  process.exit(0);
}

console.error('\nThe acceptance gate no longer matches its baseline:\n');
for (const p of problems) console.error(`  ${p}\n`);
process.exit(1);
