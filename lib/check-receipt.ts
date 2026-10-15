/**
 * The RECEIPT for one check: what was decided, by what, whether anything SETTLED it, and what it did
 * to a score. Built only from the fields the check endpoint sent, so it can say no more than the
 * answer did.
 *
 * THE LINE THIS PAGE HOLDS (Sean, 2026-10-12). A score moves only when a known answer confirms it.
 * Concretely, the same rule the policy kernel's receipt uses (repid-engine kernel-receipt/1):
 *
 *   - a VOTE ALONE is PROVISIONAL. Two checkers agreeing, or a two-to-one vote, is still a vote.
 *   - SETTLED needs a settler: a holdout, a known answer, or a person.
 *   - this page has none of those. The check is anonymous: it asks two checkers and writes nothing.
 *
 * So every vote-based receipt here says PROVISIONAL and says the score did not move. It never says
 * SETTLED, because nothing on this page can settle anything, and a receipt that claimed more than
 * its evidence would be the defect this product exists to catch.
 *
 * THREE OUTCOMES, NEVER TWO: PROVISIONAL (a vote, unsettled), a CALCULATION (no vote at all: the
 * sentence was an equation and was calculated, EXACT_CALCULATION or, when the engine had to compare
 * decimals, APPROXIMATE_CALCULATION), and NOT_CHECKED (no decision; counts as a no).
 *
 * NO SENTENCE IN THE RECEIPT. The copyable lines carry who said what and nothing else, so pasting a
 * receipt somewhere never pastes the thing that was checked.
 */
import type { ClaimLabel, ClaimPath, ClaimVote } from '../src/lib/claim';
import { receiptLine } from './hal-receipt';

export type ReceiptStatus = 'PROVISIONAL' | 'EXACT_CALCULATION' | 'APPROXIMATE_CALCULATION' | 'NOT_CHECKED';

export type ReceiptInput = {
  label: ClaimLabel;
  by?: ClaimPath;
  votes?: ClaimVote[];
  /** Set only when this page decided not-checked itself because the service gave no usable answer. */
  reason?: string;
};

export type ReceiptView = {
  status: ReceiptStatus;
  /** The word shown as the receipt's status. */
  word: string;
  /** One plain sentence about how far the answer can be trusted. */
  statusLine: string;
  /** Copyable lines, one per checker that gave a word: "family host VERDICT". No sentence in them. */
  lines: string[];
  /** What the check did to a score. Always said, so silence is never read as "it moved". */
  scoreLine: string;
  /** For a Not checked: what it means for a spend or a post. Null otherwise. */
  gateLine: string | null;
};

export const SCORE_LINE =
  'Nothing was written to any score by this check. A score moves only when a holdout, a known answer or a person settles a result. A vote on its own, even a two-to-one vote, never moves it.';

export const GATE_LINE =
  'Not checked is a no for spending and for posting: nothing would go out on the strength of it.';

export function receiptOf(r: ReceiptInput): ReceiptView {
  const lines = (r.votes ?? []).map((v) => receiptLine({ family: v.family, host: v.voter, verdict: v.verdict }));

  if (r.label === 'not-checked') {
    return {
      status: 'NOT_CHECKED',
      word: 'NOT CHECKED',
      statusLine: r.reason
        ? 'No decision was made, because this page did not get a usable answer.'
        : 'No decision was made. Not checked never means checks out.',
      lines,
      scoreLine: SCORE_LINE,
      gateLine: GATE_LINE,
    };
  }

  if (r.by === 'arithmetic') {
    return {
      status: 'EXACT_CALCULATION',
      word: 'EXACT CALCULATION',
      statusLine: 'Decided by exact calculation. No model was asked, so there is no vote to settle.',
      lines: [],
      scoreLine: SCORE_LINE,
      gateLine: null,
    };
  }

  if (r.by === 'arithmetic-approx') {
    return {
      status: 'APPROXIMATE_CALCULATION',
      word: 'APPROXIMATE CALCULATION',
      statusLine:
        'Decided by approximate calculation, not exact: the two sides were compared as decimals. No model was asked, so there is no vote to settle.',
      lines: [],
      scoreLine: SCORE_LINE,
      gateLine: null,
    };
  }

  return {
    status: 'PROVISIONAL',
    word: 'PROVISIONAL',
    statusLine:
      r.by === 'votes'
        ? 'A vote on its own is PROVISIONAL. No holdout, known answer or person has settled it, so it is a second opinion, not a settled fact.'
        : 'Nothing here shows a holdout, a known answer or a person settling it, so it is PROVISIONAL.',
    lines,
    scoreLine: SCORE_LINE,
    gateLine: null,
  };
}
