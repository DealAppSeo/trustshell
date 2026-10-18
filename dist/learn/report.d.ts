/**
 * `trustshell learn report` — the rulers of spec §5 with the §8.5 numeric rules. PURE: it reads a
 * Snapshot (metadata rows) and returns lines, so every rule here is tested without a file.
 *
 * Every number carries its ruler: job, check id, model family, eval-set hash. A ruler without enough
 * data prints "not measured", never a number. Each can come out worse. Rulers 1, 2, 5 and calibration
 * read check_outcome only (written by `learn check run`); agent_outcome and the person's rating are
 * reported as counts and move nothing. Episodes under job slugs the person did not create are left out.
 */
import { type Snapshot } from './store';
export declare const RULER1_N = 20;
export declare const RULER2_MIN_SUCCESSES = 10;
export declare const RULER4_MIN_REVIEWS = 20;
export declare const CALIBRATION_MIN = 20;
/** §8.5: a relative change of 10% or more is good or down; anything smaller is flat. */
export declare const CHANGE = 0.1;
export type Direction = 'good' | 'down' | 'flat';
export declare function median(xs: number[]): number;
/** §8.5 direction of a change from `base` to `now`. `higherIsBetter` false for a cost. */
export declare function direction(base: number, now: number, higherIsBetter: boolean): Direction;
export declare const READING: Record<string, string>;
export declare function buildReport(snap: Snapshot, now?: Date): string;
