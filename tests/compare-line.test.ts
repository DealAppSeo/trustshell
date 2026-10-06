/**
 * Paste both answers (lib/compare-line.ts): one line for two stamps. A Not checked is never counted
 * as a win or a loss for either side, and the words are the stamp's words.
 */
import { STAMP_TITLES, compareLine } from '../lib/compare-line';
import type { ClaimLabel } from '../src/lib/claim';

const classify = require('../extension/classify.js') as { STAMP_WORDS: Record<string, string> };

describe('compareLine', () => {
  it('backs the one that checks out only when the other was caught', () => {
    expect(compareLine('pass', 'veto')).toBe(
      'The first checks out and the second was caught. They cannot both stand, and the checkers back the first.',
    );
    expect(compareLine('veto', 'pass')).toBe(
      'The first was caught and the second checks out. They cannot both stand, and the checkers back the second.',
    );
  });

  it('both caught, both checked out, neither checked', () => {
    expect(compareLine('veto', 'veto')).toBe('Both were caught. Neither one holds up.');
    expect(compareLine('pass', 'pass')).toMatch(/^Both check out\. If they really say opposite things, one of these stamps is wrong/);
    expect(compareLine('not-checked', 'not-checked')).toBe(
      'Neither was checked, so there is nothing to pick between. Not checked never means it checks out.',
    );
  });

  it('a Not checked rules nothing in or out, on either side', () => {
    expect(compareLine('pass', 'not-checked')).toBe('The first checks out. The second was not checked, so it is not ruled in or out.');
    expect(compareLine('not-checked', 'veto')).toBe('The second was caught. The first was not checked, so it is not ruled in or out.');
    const labels: ClaimLabel[] = ['pass', 'veto', 'not-checked'];
    for (const a of labels) {
      for (const b of labels) {
        const line = compareLine(a, b);
        expect(line.length).toBeGreaterThan(10);
        // "back" (a recommendation) appears only for a pass against a veto.
        expect(/\bback the\b/.test(line)).toBe((a === 'pass' && b === 'veto') || (a === 'veto' && b === 'pass'));
      }
    }
  });

  it('uses the stamp\'s own words', () => {
    for (const label of ['pass', 'veto', 'not-checked'] as const) {
      expect(STAMP_TITLES[label]).toBe(classify.STAMP_WORDS[label]);
    }
  });
});
