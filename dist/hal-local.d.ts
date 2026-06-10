/**
 * Local HAL scorer for TrustShell (DECISION_LOG D-017: TrustShell C→A).
 *
 * A real, in-process HAL scorer that runs with **no network call**. It is the
 * PRIMARY scorer; the hosted repid-engine remote scorer is the swappable
 * FALLBACK behind the same `HalProvider` interface (see `createHDP` in
 * `trustshell.ts`).
 *
 * This is an honest v0 heuristic — deterministic, fast, dependency-free. It is a
 * pre-filter, NOT the full cross-provider quorum HAL (which needs provider keys
 * and lives in repid-engine). `provider` is labelled `local-heuristic-v0` so
 * consumers always know which scorer produced a result.
 */
import type { ScoreOptions, ScoreResult } from './trustshell';
export interface HalProvider {
    readonly name: string;
    /** Score a model response; never performs network I/O for `LocalHalProvider`. */
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
}
/**
 * Deterministic local hallucination-risk heuristic. Returns a full `ScoreResult`.
 * Signals (all derived from the text alone, no I/O):
 *  - overconfidence markers raise risk; hedging lowers it (epistemic humility)
 *  - explicit evidence (links / "according to" / citations) lowers risk
 *  - very specific unsourced figures/dates raise fabrication risk
 *  - obvious harmful content raises harm probability
 *  - empty/trivial output is treated as uncertain
 */
export declare function localHeuristicScore(response: string, options?: ScoreOptions): ScoreResult;
/** PRIMARY local scorer — runs entirely in-process, no network. */
export declare class LocalHalProvider implements HalProvider {
    readonly name = "local-heuristic-v0";
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
}
