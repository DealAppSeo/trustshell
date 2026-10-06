import type { ClaimLabel } from '../src/lib/claim';

/**
 * A sentence the visitor can swap into the box. `why` explains the expected answer, and is shown
 * ONLY when the live checkers returned exactly `when` for exactly this sentence: an explanation
 * the checkers did not back would be our claim wearing their label.
 *
 * `measured` is the record of the runs that put the card on the page: the date, the label that came
 * back, and how many times out of how many. It is shown AFTER the live answer, never on the card, so
 * the visitor still guesses first, and it is shown whatever today's answer is, so a card whose
 * answer has moved since says so next to the old record instead of quietly becoming a fixture.
 */
export type CheckSample = {
  label: string;
  text: string;
  why?: { when: ClaimLabel; text: string };
  /** `record`: a public link to the raw runs, so anyone can read them and run them again. */
  measured?: { on: string; label: ClaimLabel; times: number; of: number; record: string };
};
