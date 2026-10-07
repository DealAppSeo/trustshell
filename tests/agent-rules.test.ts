/**
 * An agent's rules are sent with every question, editable, and its owner can teach it corrections
 * (lib/agent-rules.ts). These pin the prompt shape, the length ceiling the engine also applies,
 * and that a correction is added, dated, never silently truncating what was there.
 */
import { appendCorrection, checkRules, composeRunPrompt, countRuleLines, CORRECTIONS_HEADING, MAX_RULES_CHARS } from '../lib/agent-rules';

const DAY = new Date('2026-10-07T12:00:00Z');

describe('composeRunPrompt', () => {
  it('sends the question unchanged when there are no rules', () => {
    for (const none of [undefined, null, '', '   \n ']) expect(composeRunPrompt(none, 'What is 2+2?')).toBe('What is 2+2?');
  });
  it('puts the rules first, then the question, unchanged', () => {
    const p = composeRunPrompt('Always cite a source.', 'What is the capital of France?');
    expect(p.startsWith('Your owner gave you these rules. Follow them in this answer.')).toBe(true);
    expect(p).toContain('Always cite a source.');
    expect(p.endsWith('\n\n---\n\nWhat is the capital of France?')).toBe(true);
  });
});

describe('checkRules', () => {
  it('trims and normalises line endings', () => {
    expect(checkRules('  a\r\nb  ')).toEqual({ ok: true, rules: 'a\nb' });
  });
  it('refuses more than the engine accepts', () => {
    expect(checkRules('x'.repeat(MAX_RULES_CHARS + 1)).ok).toBe(false);
    expect(checkRules('x'.repeat(MAX_RULES_CHARS)).ok).toBe(true);
  });
});

describe('appendCorrection', () => {
  it('starts a Corrections section, dated, on the first correction', () => {
    expect(appendCorrection('Always cite a source.', 'Give the source for every number.', DAY)).toEqual({
      ok: true,
      rules: `Always cite a source.\n\n${CORRECTIONS_HEADING}\n- 2026-10-07: Give the source for every number.`,
    });
  });
  it('adds to the existing section after that, keeping every earlier line', () => {
    const one = appendCorrection('', 'First.', DAY);
    if (!one.ok) throw new Error(one.reason);
    expect(one.rules).toBe(`${CORRECTIONS_HEADING}\n- 2026-10-07: First.`);
    const two = appendCorrection(one.rules, 'Second\n  on two lines.', DAY);
    expect(two).toEqual({ ok: true, rules: `${CORRECTIONS_HEADING}\n- 2026-10-07: First.\n- 2026-10-07: Second on two lines.` });
  });
  it.each([
    ['empty', ''],
    ['too short', 'ok'],
    ['too long', 'x'.repeat(301)],
  ])('refuses a correction that is %s', (_n, text) => {
    expect(appendCorrection('Rules.', text, DAY).ok).toBe(false);
  });
  it('refuses rather than truncates when the rules would get too long', () => {
    const full = 'x'.repeat(MAX_RULES_CHARS - 10);
    const out = appendCorrection(full, 'One more rule please.', DAY);
    expect(out).toMatchObject({ ok: false, reason: expect.stringContaining('Edit them shorter') });
  });
});

describe('countRuleLines', () => {
  it('counts lines that read as rules, not headings or blanks', () => {
    expect(countRuleLines('## Mission\nHelp.\n\n## Corrections\n- a\n- b')).toBe(3);
    expect(countRuleLines(undefined)).toBe(0);
  });
});
