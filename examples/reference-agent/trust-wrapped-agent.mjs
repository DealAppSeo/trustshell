/**
 * Reference integration: a minimal agent wrapped with @hyperdag/trustshell.
 *
 * Pattern: your agent produces an answer; wrapExecute runs it, HAL scores the output,
 * and you get both back. Swap `myAgent` for a real OpenAI/Anthropic/local call — the
 * wrapper is unchanged. No API key needed; the scoring path is a public read.
 *
 * Run:  node trust-wrapped-agent.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS RECORDS RATHER THAN BLOCKS, AND WHY IT CHECKS ITS OWN CLAIM
 *
 * The previous version hand-rolled the gate at `riskThreshold = 0.5` and closed by
 * printing, unconditionally:
 *
 *     "The wrapper released the truthful answer and withheld the false one"
 *
 * That was a hardcoded string, not an observation — it printed even when the opposite
 * happened. And the opposite is reachable: HAL scored the TRUE statement "The capital
 * of France is Paris." at halScore 0.535 (measured 2026-08-31), above that threshold.
 * So the reference example for a trust product could withhold a true answer while
 * announcing it had released it.
 *
 * That is the defect this whole stack exists to catch — a system reporting success it
 * has not earned — sitting in the demo. This version therefore:
 *
 *   1. RECORDS by default. `blockAtOrAbove` is omitted, which is wrapExecute's shipping
 *      default and the honest one at HAL's measured accuracy: 82.6% on external ground
 *      truth (95/115) and 9.1% (1/11) on the uncertain class. A detector that wrong
 *      should annotate by default, not refuse work.
 *   2. COMPUTES its closing claim from the run and exits non-zero when reality
 *      disagrees. A demo that cannot fail is not evidence of anything.
 *   3. Shows opt-in blocking as a labelled second pass, so "annotated" and "withheld"
 *      are visibly different rather than assumed to be.
 *
 * WHAT BLOCKING MEANS: wrapExecute scores output that has ALREADY been produced.
 * `blocked: true` withholds the RESULT from the caller; it does not undo a side effect.
 * Wrap the decision, not the send.
 */
import { TrustShell, wrapExecute } from '@hyperdag/trustshell';

// ---- 1. Your agent. A stub returning one true and one false answer.
async function myAgent(prompt) {
  const canned = {
    'capital of France': 'The capital of France is Paris.',
    'eiffel tower location': 'The Eiffel Tower is located in Rome, Italy.', // wrong on purpose
  };
  return canned[prompt] ?? "I don't have a confident answer.";
}

const PROMPTS = [
  { prompt: 'capital of France', truthful: true },
  { prompt: 'eiffel tower location', truthful: false },
];

const { client, health } = await TrustShell.init();
if (!health.ok) throw new Error(`backend unreachable: ${health.error}`);

// ---- 2. Record-only pass. Nothing is withheld; every answer carries its verdict.
console.log('PASS 1 — record only (the shipping default). Nothing is withheld.\n');

const observed = [];

for (const { prompt, truthful } of PROMPTS) {
  const r = await wrapExecute(client, () => myAgent(prompt), { prompt });

  observed.push({ prompt, truthful, verdict: r.verdict, checked: r.checked, halScore: r.halScore });

  console.log(`PROMPT: "${prompt}"  (actually ${truthful ? 'TRUE' : 'FALSE'})`);
  console.log(`  output : ${r.output}`);
  if (r.checked) {
    console.log(`  verdict: ${r.verdict}  halScore=${r.halScore?.toFixed(3)}  trust=${r.trustScore}`);
    console.log(`  why    : ${r.evidence?.join(' | ') || r.decisionReason}`);
  } else {
    // Three outcomes, never two. An unreachable HAL is not a pass.
    console.log('  verdict: UNKNOWN — HAL was not consulted. NOT a pass.');
    console.log(`  why    : ${r.decisionReason}`);
  }
  console.log('');
}

// ---- 3. Opt-in blocking, shown explicitly so the difference is visible.
console.log('PASS 2 — same calls with blockAtOrAbove: "VETO". Now output can be withheld.\n');

for (const { prompt } of PROMPTS) {
  const r = await wrapExecute(client, () => myAgent(prompt), { prompt, blockAtOrAbove: 'VETO' });
  console.log(
    `PROMPT: "${prompt}"  ->  ${r.blocked ? 'WITHHELD' : 'RELEASED'}` +
      `  (verdict=${r.verdict}${r.checked ? '' : ', HAL unreachable'})`,
  );
}

// ---- 4. The claim, computed rather than asserted.
console.log('\n─────────────────────────────────────────────────────────');

const unchecked = observed.filter((o) => !o.checked);
if (unchecked.length > 0) {
  console.log(
    `NOT CHECKED — HAL could not be reached for ${unchecked.length} of ${observed.length} ` +
      'prompts, so this run proves nothing about its judgement.',
  );
  console.log('That is not a failure of the wrapper, and it is not a pass either.');
  process.exit(2);
}

const truthy = observed.find((o) => o.truthful);
const falsy = observed.find((o) => !o.truthful);
const separated = truthy.verdict === 'PASS' && falsy.verdict !== 'PASS';

console.log(`  true  "${truthy.prompt}"  -> ${truthy.verdict} (${truthy.halScore?.toFixed(3)})`);
console.log(`  false "${falsy.prompt}" -> ${falsy.verdict} (${falsy.halScore?.toFixed(3)})`);
console.log('');

if (separated) {
  console.log('HAL separated them on this run: the true answer passed, the false one did not.');
  process.exit(0);
}

// Not a bug in the example. This is the example doing its job.
console.log('HAL did NOT separate them on this run — reported rather than papered over.');
console.log('');
console.log('This is why the default is record-only. HAL measures 82.6% on external ground');
console.log('truth and 9.1% on the uncertain class, and has been observed flagging the true');
console.log('Paris statement at 0.535. Blocking on a signal that wrong refuses real work.');
console.log('The wrapper behaved correctly: it surfaced the verdict instead of acting on it.');
process.exit(1);
