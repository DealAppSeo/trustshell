/**
 * Samples for the try-door. Each is a REAL public run of this repository; pressing one runs the live check, so the
 * answer is read from GitHub at that moment. None of these carries a stored verdict. GitHub keeps run records for
 * a limited time; if one is gone the door answers NOT_CHECKED with GitHub's reason, which is the right outcome.
 */
export const MAX_CLAIM_CHARS = 300;
/** What is checked when the visitor types no sentence. The run id is what ties a sentence to this run. */
export const defaultClaim = (runId: string) => `The workflow passed in run ${runId}.`;

/** What a visitor reads for each verdict. Client-safe: no server imports in this file. */
export const WORDS = {
  SUPPORTED: 'Supported: GitHub’s record agrees with this sentence.',
  CONTRADICTED: 'Contradicted: GitHub’s record disagrees with this sentence.',
  NOT_CHECKED: 'Not checked: nothing was decided. This is not a pass.',
} as const;

export interface TrySample {
  id: string;
  label: string;
  url: string;
  claim: string;
}

const REPO = 'https://github.com/DealAppSeo/trustshell/actions/runs';

export const TRY_SAMPLES: readonly TrySample[] = [
  { id: 'supported', label: 'A run that passed, said to have passed', url: `${REPO}/44265552567`, claim: 'The workflow passed in run 44265552567.' },
  { id: 'contradicted', label: 'A run that failed, said to have passed', url: `${REPO}/44216546624`, claim: 'The workflow passed in run 44216546624.' },
  { id: 'not-checked', label: 'A passed run, with a claim no check can settle', url: `${REPO}/44265552567`, claim: 'All tests pass in run 44265552567.' },
];
