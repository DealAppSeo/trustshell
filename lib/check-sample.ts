import type { ClaimLabel } from '../src/lib/claim';

/**
 * A sentence the visitor can swap into the box. `why` explains the expected answer, and is shown
 * ONLY when the live checkers returned exactly `when` for exactly this sentence: an explanation
 * the checkers did not back would be our claim wearing their label.
 */
export type CheckSample = { label: string; text: string; why?: { when: ClaimLabel; text: string } };
