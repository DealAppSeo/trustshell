/**
 * Linear or not, measured so a busy machine cannot fake the answer.
 *
 * A linear scan takes about 8x as long on 8x the input; a quadratic one about 64x. So this times the
 * function on n and on 8n IN ALTERNATION, five rounds, and compares the MEDIANS. Load (the full suite
 * runs in parallel, CI runners are shared) slows both halves of a round alike, so it cancels in the
 * ratio; a quadratic slows only the large half. The median, not the best or a single sample, so one
 * pause in one round cannot move the result either way. No absolute milliseconds are asserted: those
 * measure the machine, not the code.
 *
 * n IS SCALED TO THE MACHINE. It doubles until the fastest of three runs on the small input takes at
 * least 30 ms, so the small run spans scheduler noise the way the large one does. A small run of 1-3 ms
 * (a fast CI runner at a fixed size) is what made the old ratio swing: one preemption is a large share
 * of it.
 *
 * LIMIT 24. Measured 2026-10-15 on an overloaded laptop, three runs back to back with the full suite
 * running beside them: the linear scans here read 2.6 to 16.2. Swapped in locally, the old quadratic
 * e-mail rule read 68.5 and a PEM matcher that scans to the end for every BEGIN read 69.8: red.
 *
 * Before this, the timing tests compared a best-of-three at a fixed n and 8n against 24, plus absolute
 * ceilings in milliseconds. Both moved with load: `@ everywhere` read 34.5 on CI against 24, and the
 * ceilings failed locally under the parallel suite, on code that is linear.
 *
 * GROWTH_LOG=<file> appends one line per measurement, so a run can report its ratios.
 */
import { appendFileSync } from 'node:fs';

const ROUNDS = 5;
const MIN_SMALL_MS = 30;
const MAX_DOUBLINGS = 6;
export const GROWTH = 8;
export const LINEAR_LIMIT = 24;

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

// Every result is kept, so the engine cannot optimize a call away and time nothing.
export let sink: unknown;

function time(fn: (t: string) => unknown, text: string): number {
  const t0 = process.hrtime.bigint();
  sink = fn(text);
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** Median time on make(n) and make(8n), interleaved over five rounds, and their ratio. n starts at n0. */
export function growth(
  label: string,
  fn: (t: string) => unknown,
  make: (n: number) => string,
  n0: number,
): { n: number; small: number; large: number; ratio: number } {
  let n = n0;
  let a = make(n);
  fn(a); // warm: the first call pays for compiling the regexes
  // The fastest of three probes: a pause can only lengthen a run, so one slow probe cannot stop the
  // scaling early and leave a 1 ms small run (measured: n=750, 1.08 ms small, ratio 28 on linear code).
  const probe = (t: string): number => Math.min(time(fn, t), time(fn, t), time(fn, t));
  for (let i = 0; i < MAX_DOUBLINGS && probe(a) < MIN_SMALL_MS; i += 1) {
    n *= 2;
    a = make(n);
  }
  const b = make(n * GROWTH);
  fn(b);
  const small: number[] = [];
  const large: number[] = [];
  for (let i = 0; i < ROUNDS; i += 1) {
    small.push(time(fn, a));
    large.push(time(fn, b));
  }
  const s = median(small);
  const l = median(large);
  const out = { n, small: s, large: l, ratio: l / s };
  if (process.env.GROWTH_LOG) {
    appendFileSync(process.env.GROWTH_LOG, `${label}\tn=${n}\t${s.toFixed(2)}\t${l.toFixed(2)}\t${out.ratio.toFixed(2)}\n`);
  }
  return out;
}
