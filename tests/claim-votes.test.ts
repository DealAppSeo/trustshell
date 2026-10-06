/**
 * Each checker's own word (repid-engine `votes`, 2026-10-06). Before it, a disagreement read "No
 * agreed answer" and never said who said what, so "you see what each one said" was not true.
 * votesOf is all or nothing, like pathOf: a vote list that is malformed, or that contradicts the
 * label, is the answer saying two things, so nothing is shown and the label keeps its old line.
 */
import { classifyClaim, pathLine, votesLine, votesOf, type ClaimLabel, type ClaimVote } from '../src/lib/claim';

const DECIDERS = ['groq', 'cerebras'];
const vote = (voter: string, family: string, verdict: string) => ({ voter, family, verdict });

describe('votesOf', () => {
  it('reads two votes that match the deciders, in order, and fit the label', () => {
    const body = { votes: [vote('groq', 'gpt-oss', 'FALSE'), vote('cerebras', 'qwen', 'FALSE')] };
    expect(votesOf(body, 'veto', DECIDERS)).toEqual([
      { voter: 'groq', family: 'gpt-oss', verdict: 'FALSE' },
      { voter: 'cerebras', family: 'qwen', verdict: 'FALSE' },
    ]);
  });

  const fits: [ClaimLabel, string, string, boolean][] = [
    ['pass', 'TRUE', 'TRUE', true],
    ['pass', 'TRUE', 'UNSURE', false],
    ['veto', 'FALSE', 'FALSE', true],
    ['veto', 'FALSE', 'TRUE', false],
    ['not-checked', 'TRUE', 'FALSE', true],
    ['not-checked', 'UNSURE', 'UNSURE', true],
    ['not-checked', 'NONE', 'TRUE', true],
    // A not-checked whose checkers both said the same flat word is the answer contradicting itself.
    ['not-checked', 'TRUE', 'TRUE', false],
    ['not-checked', 'FALSE', 'FALSE', false],
  ];
  it.each(fits)('%s with %s and %s: shown %s', (label, a, b, shown) => {
    const body = { votes: [vote('groq', 'gpt-oss', a), vote('cerebras', 'qwen', b)] };
    expect(votesOf(body, label, DECIDERS) !== undefined).toBe(shown);
  });

  const malformed: [string, unknown, string[] | undefined][] = [
    ['no deciders', { votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'TRUE')] }, undefined],
    ['no votes', {}, DECIDERS],
    ['one vote', { votes: [vote('groq', 'gpt-oss', 'TRUE')] }, DECIDERS],
    ['three votes', { votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'TRUE'), vote('groq', 'x', 'TRUE')] }, DECIDERS],
    ['wrong order', { votes: [vote('cerebras', 'qwen', 'TRUE'), vote('groq', 'gpt-oss', 'TRUE')] }, DECIDERS],
    ['a voter that did not decide', { votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('mistral', 'mistral', 'TRUE')] }, DECIDERS],
    ['an unknown verdict', { votes: [vote('groq', 'gpt-oss', 'MAYBE'), vote('cerebras', 'qwen', 'TRUE')] }, DECIDERS],
    ['a lower-case verdict', { votes: [vote('groq', 'gpt-oss', 'true'), vote('cerebras', 'qwen', 'TRUE')] }, DECIDERS],
    ['markup in the family', { votes: [vote('groq', '<b>x</b>', 'TRUE'), vote('cerebras', 'qwen', 'TRUE')] }, DECIDERS],
    ['an empty family', { votes: [vote('groq', '', 'TRUE'), vote('cerebras', 'qwen', 'TRUE')] }, DECIDERS],
    ['a null vote', { votes: [null, vote('cerebras', 'qwen', 'TRUE')] }, DECIDERS],
    ['votes not a list', { votes: 'TRUE,TRUE' }, DECIDERS],
  ];
  it.each(malformed)('%s: nothing', (_name, body, deciders) => {
    expect(votesOf(body, 'pass', deciders)).toBeUndefined();
  });
});

describe('votesLine', () => {
  const v = (voter: string, family: string, verdict: ClaimVote['verdict']): ClaimVote => ({ voter, family, verdict });

  it('names each checker and its word', () => {
    expect(votesLine([v('groq', 'gpt-oss', 'FALSE'), v('cerebras', 'qwen', 'FALSE')])).toBe('Groq said false. Cerebras said false.');
    expect(votesLine([v('groq', 'gpt-oss', 'TRUE'), v('cerebras', 'qwen', 'UNSURE')])).toBe('Groq said true. Cerebras was not sure.');
    expect(votesLine([v('groq', 'gpt-oss', 'NONE'), v('workers-ai', 'llama', 'TRUE')])).toBe(
      'Groq gave no answer. Cloudflare Workers AI said true.',
    );
  });

  it('says a flat contradiction out loud', () => {
    expect(votesLine([v('groq', 'gpt-oss', 'TRUE'), v('cerebras', 'qwen', 'FALSE')])).toBe(
      'Groq said true. Cerebras said false. They disagree, and both cannot be right.',
    );
  });

  it('tells two checkers on one host apart by family', () => {
    expect(votesLine([v('groq', 'gpt-oss', 'TRUE'), v('groq', 'qwen', 'TRUE')])).toBe('Groq (gpt-oss) said true. Groq (qwen) said true.');
  });

  it('is empty without two votes, so the caller keeps pathLine', () => {
    expect(votesLine(undefined)).toBe('');
    expect(votesLine([v('groq', 'gpt-oss', 'TRUE')])).toBe('');
  });
});

describe('classifyClaim carries votes only when the endpoint sent well-formed ones', () => {
  const reply = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

  it('a disagreement now says who said what', async () => {
    const body = {
      label: 'not-checked',
      latency_ms: 900,
      by: 'votes',
      voters: ['groq', 'cerebras'],
      deciders: ['groq', 'cerebras'],
      votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'FALSE')],
    };
    const r = await classifyClaim('Some sentence to check.', { apiUrl: 'https://example.test', env: {}, fetchImpl: reply(body) });
    expect(r.label).toBe('not-checked');
    expect(r.votes).toHaveLength(2);
    expect(votesLine(r.votes)).toBe('Groq said true. Cerebras said false. They disagree, and both cannot be right.');
    // Without votes, the same answer only ever said this:
    expect(pathLine(r)).toBe('Asked Groq and Cerebras. No agreed answer.');
  });

  it('an older endpoint sends no votes, and none are invented', async () => {
    const body = { label: 'veto', latency_ms: 300, by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'cerebras'] };
    const r = await classifyClaim('Some sentence to check.', { apiUrl: 'https://example.test', env: {}, fetchImpl: reply(body) });
    expect(r.label).toBe('veto');
    expect(r.votes).toBeUndefined();
  });

  it('votes that contradict the label are dropped, and the label is untouched', async () => {
    const body = {
      label: 'pass',
      latency_ms: 300,
      by: 'votes',
      voters: ['groq', 'cerebras'],
      deciders: ['groq', 'cerebras'],
      votes: [vote('groq', 'gpt-oss', 'FALSE'), vote('cerebras', 'qwen', 'FALSE')],
    };
    const r = await classifyClaim('Some sentence to check.', { apiUrl: 'https://example.test', env: {}, fetchImpl: reply(body) });
    expect(r.label).toBe('pass');
    expect(r.votes).toBeUndefined();
  });
});
