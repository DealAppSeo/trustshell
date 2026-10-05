/**
 * The one clarifying question (repid-engine CLASSIFY_QUESTIONS). It comes from the API or it does
 * not appear: the client invents none, shows one only on a not-checked from the votes, refuses the
 * same shapes the server refuses, and re-checks only with the person's own answer.
 */
import { classifyClaim, questionOf, withAnswer, ClaimError } from '../src/lib/claim';
import { parseArgs, run, type CliIO } from '../src/cli/index';
import { TrustShell } from '../src/lib/trustshell';

const Q = 'Does the host always open a door with a goat behind it?';
const SWITCH = 'After you pick a door and the host opens another door showing a goat, you should always switch.';

function stub(body: unknown) {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({ status: 200, text: async () => JSON.stringify(body) }));
}
const realFetch = (globalThis as { fetch?: unknown }).fetch;
afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = realFetch;
});

describe('questionOf', () => {
  it('keeps a well-formed question on a votes not-checked', () => {
    expect(questionOf({ question: Q }, 'not-checked', 'votes')).toBe(Q);
  });
  it.each([
    ['pass', 'votes'],
    ['veto', 'votes'],
    ['not-checked', 'arithmetic'],
    ['not-checked', 'skipped'],
    ['not-checked', undefined],
  ] as const)('never on %s by %s', (label, by) => {
    expect(questionOf({ question: Q }, label, by)).toBeUndefined();
  });
  it.each([
    ['no question mark', 'Does the host always open a goat door'],
    ['too short', 'Why?'],
    ['too long', 'Is it ' + 'very '.repeat(40) + 'so?'],
    ['a link', 'Did you read https://example.com first?'],
    ['a domain', 'Is the rule on example.com the one you mean?'],
    ['an email', 'Should I ask jane@example.com about it?'],
    ['markup', 'Is the **host** always opening a goat door?'],
    ['a newline', 'Does the host\nalways open a goat door?'],
    ['not a string', 42],
  ])('refuses %s', (_why, q) => {
    expect(questionOf({ question: q }, 'not-checked', 'votes')).toBeUndefined();
  });
});

describe('withAnswer', () => {
  it('adds the answer as the assumption the checkers lacked', () => {
    expect(withAnswer(SWITCH, 'the host always opens a goat door.')).toBe(
      'After you pick a door and the host opens another door showing a goat, you should always switch. Assume: the host always opens a goat door.',
    );
  });
  it('an empty answer sends nothing', () => {
    expect(() => withAnswer(SWITCH, '   ')).toThrow(ClaimError);
  });
  it('caps the answer', () => {
    expect(withAnswer('A claim', 'x'.repeat(500)).length).toBeLessThan(240);
  });
});

describe('through classifyClaim and the CLI', () => {
  it('classifyClaim carries the question on a votes not-checked', async () => {
    stub({ label: 'not-checked', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'], question: Q });
    const r = await classifyClaim(SWITCH, { apiUrl: 'http://localhost:9' });
    expect(r.question).toBe(Q);
  });
  it('and drops one riding on a pass', async () => {
    stub({ label: 'pass', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'], question: Q });
    const r = await classifyClaim(SWITCH, { apiUrl: 'http://localhost:9' });
    expect(r).not.toHaveProperty('question');
  });
  it('`trustshell check` prints the question line', async () => {
    stub({ label: 'not-checked', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'], question: Q });
    const lines: string[] = [];
    const io: CliIO = { out: (s) => lines.push(s), err: () => undefined };
    const code = await run(parseArgs(['check', SWITCH]), new TrustShell({ apiUrl: 'http://unused.invalid' }), io);
    expect(code).toBe(2);
    expect(lines.some((l) => l.startsWith(`One question: ${Q}`))).toBe(true);
  });
});
