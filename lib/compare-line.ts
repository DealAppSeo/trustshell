import type { ClaimLabel } from '../src/lib/claim';

/**
 * PASTE BOTH ANSWERS (Sean's GO, 2026-10-06). The pain this page names is two confident answers
 * that cannot both be right. The check reads ONE answer at a time, so this does not judge between
 * them: it checks each one on its own and then says, in one line, what the two stamps add up to.
 *
 * The words are the stamp's words (extension/classify.js STAMP_WORDS, the result card in
 * CheckForm), so the same answer never has two names. A Not checked is never counted as a win or a
 * loss for either side: it rules nothing in or out, the same rule as everywhere else.
 */
export const STAMP_TITLES: Record<ClaimLabel, string> = {
  pass: 'Checks out',
  veto: 'Caught',
  'not-checked': 'Not checked',
};

const SAID: Record<Exclude<ClaimLabel, 'not-checked'>, string> = {
  pass: 'checks out',
  veto: 'was caught',
};

/** One line for two stamps, first answer then second. PURE. */
export function compareLine(first: ClaimLabel, second: ClaimLabel): string {
  if (first === 'pass' && second === 'veto') {
    return 'The first checks out and the second was caught. They cannot both stand, and the checkers back the first.';
  }
  if (first === 'veto' && second === 'pass') {
    return 'The first was caught and the second checks out. They cannot both stand, and the checkers back the second.';
  }
  if (first === 'veto' && second === 'veto') return 'Both were caught. Neither one holds up.';
  if (first === 'pass' && second === 'pass') {
    return 'Both check out. If they really say opposite things, one of these stamps is wrong, so tell us.';
  }
  if (first === 'not-checked' && second === 'not-checked') {
    return 'Neither was checked, so there is nothing to pick between. Not checked never means it checks out.';
  }
  const [decided, open, label] = first === 'not-checked' ? ['second', 'first', second] : ['first', 'second', first];
  return `The ${decided} ${SAID[label as Exclude<ClaimLabel, 'not-checked'>]}. The ${open} was not checked, so it is not ruled in or out.`;
}
