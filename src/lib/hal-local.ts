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

/** Verdict bands kept consistent with the deployed HAL (PASS <0.4 ≤ FLAG <0.6 ≤ VETO). */
function verdictFor(halScore: number): ScoreResult['verdict'] {
  if (halScore >= 0.6) return 'VETO';
  if (halScore >= 0.4) return 'FLAG';
  return 'PASS';
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
export function localHeuristicScore(response: string, options: ScoreOptions = {}): ScoreResult {
  const text = (response ?? '').trim();

  const overconfident =
    /(definitely|guaranteed|100%\b|without a doubt|absolutely certain|never fails|always works|undeniabl|proven fact)/i.test(
      text
    );
  const hedged =
    /(may |might |could |possibly|likely|approximately|around |estimat|i think|to my knowledge|uncertain|appears? to)/i.test(
      text
    );
  const hasEvidence =
    /(https?:\/\/|\bsource\b|according to|\bcit(e|ation)|\breference|\[\d+\]|doi:)/i.test(text);
  const specificUnsourced =
    /(\b\d{1,3}(\.\d+)?\s?%|\b(1[5-9]\d{2}|20\d{2})\b|\$\s?\d[\d,]*(\.\d+)?)/.test(text) &&
    !hasEvidence;
  const harmful = /(how to (kill|make a bomb)|build a weapon|commit suicide|exploit this vuln)/i.test(
    text
  );

  let risk = 0.15; // base prior
  if (overconfident) risk += 0.25;
  if (specificUnsourced) risk += 0.25;
  if (!hedged) risk += 0.05;
  if (hedged) risk -= 0.05;
  if (hasEvidence) risk -= 0.15;
  if (harmful) risk += 0.4;
  if (text.length < 8) risk += 0.25; // empty/trivial → uncertain
  risk = Math.max(0, Math.min(1, risk));

  const halScore = Number(risk.toFixed(4));
  const trustScore = Math.round((1 - halScore) * 100);

  return {
    trustScore,
    halScore,
    signals: {
      harmProbability: harmful ? 0.8 : 0.03,
      epistemicUncertainty: hedged ? 0.5 : overconfident ? 0.2 : 0.35,
      evidenceQuality: hasEvidence ? 0.85 : 0.3,
      scopeAppropriateness: 0.7,
      certaintyAtClaim: overconfident ? 0.95 : hedged ? 0.5 : 0.7,
    },
    verdict: verdictFor(halScore),
    flaggedHallucination: halScore >= 0.6,
    provider: 'local-heuristic-v0',
    model: options.model || 'local',
  };
}

/** PRIMARY local scorer — runs entirely in-process, no network. */
export class LocalHalProvider implements HalProvider {
  readonly name = 'local-heuristic-v0';
  async score(response: string, options: ScoreOptions = {}): Promise<ScoreResult> {
    return localHeuristicScore(response, options);
  }
}
