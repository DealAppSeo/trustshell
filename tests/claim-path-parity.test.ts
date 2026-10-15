/**
 * "Checks you can see": the classify endpoint now says what produced a label (`by`, and `voters`
 * only for votes). The CLI, MCP and /check read it through src/lib/claim.ts; the extension reads it
 * through extension/laya.js and extension/classify.js. Both sides must accept the same answers and
 * say the same words, and both must say NOTHING when the endpoint did not say (an older backend).
 */
import { classifyClaim, explainClaim, pathLine, pathOf, SCRUBBED_LINE, type ClaimLabel } from '../src/lib/claim';

const laya = require('../extension/laya.js') as {
  pathOf: (body: unknown, label: string) => { by?: string; voters?: string[] };
  callLaya: (text: unknown, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
const classify = require('../extension/classify.js') as {
  pathLine: (row: unknown) => string;
  lineFor: (row: unknown) => string;
  classifyReply: (text: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const LABELS: ClaimLabel[] = ['pass', 'veto', 'not-checked'];
const BODIES: unknown[] = [
  {},
  { by: 'arithmetic' },
  // repid-engine classify.ts :567 (2026-10-12): the double fallback for what exact arithmetic cannot
  // hold. Both doors must accept it with pass and veto, refuse it with not-checked, and say the same
  // line. Before #556 + #554 neither door listed it, and this list never sent it, so a split between
  // them could not go red (XC1, 2026-10-14).
  { by: 'arithmetic-approx' },
  { by: 'skipped' },
  { by: 'deadline' },
  { by: 'votes', voters: ['groq', 'cerebras'] },
  { by: 'votes', voters: ['groq', 'groq'] },
  { by: 'votes', voters: ['groq'] },
  { by: 'votes', voters: ['groq', 'cerebras', 'nvidia-nim'] },
  { by: 'votes', voters: ['workers-ai', 'groq'] },
  { by: 'votes', voters: ['some-new-host', 'groq'] },
  { by: 'votes' },
  { by: 'votes', voters: [] },
  { by: 'votes', voters: ['Groq <b>'] },
  { by: 'votes', voters: Array(9).fill('groq') },
  { by: 'votes', voters: [1, 2] },
  // The checker pool (repid-engine, 2026-10-05): `deciders` names the two that answered.
  { by: 'votes', voters: ['groq', 'cerebras', 'openrouter'], deciders: ['groq', 'openrouter'] },
  { by: 'votes', voters: ['groq', 'groq', 'openrouter'], deciders: ['groq', 'openrouter'] },
  { by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'mistral'] },
  { by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq'] },
  { by: 'votes', voters: ['zai', 'mistral', 'together', 'fireworks'], deciders: ['together', 'fireworks'] },
  { by: 'magic' },
  { by: 42 },
  null,
  'votes',
];

describe('claim.ts and the extension agree on what an answer says produced it', () => {
  for (const body of BODIES) {
    for (const label of LABELS) {
      it(`${JSON.stringify(body)} with ${label}`, () => {
        const ts = pathOf(body, label);
        expect(laya.pathOf(body, label)).toEqual(ts);
        const row = { label, latency_ms: 10, ...ts };
        expect(classify.pathLine(row)).toBe(pathLine(row));
      });
    }
  }
});

describe('the words', () => {
  const line = (label: ClaimLabel, body: unknown) => pathLine({ label, ...pathOf(body, label) });

  it('approximate arithmetic says it is approximate, at both doors', () => {
    const want = 'Decided by approximate calculation, not exact. No model was asked.';
    for (const label of ['pass', 'veto'] as const) {
      expect(line(label, { by: 'arithmetic-approx' })).toBe(want);
      expect(classify.pathLine({ label, ...laya.pathOf({ by: 'arithmetic-approx' }, label) })).toBe(want);
    }
  });

  it('arithmetic says no model was asked', () => {
    expect(line('veto', { by: 'arithmetic' })).toBe('Decided by exact calculation. No model was asked.');
  });
  it('votes name the voters that answered', () => {
    expect(line('pass', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Groq and Cerebras both said true.');
    expect(line('veto', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Groq and Cerebras both said false.');
    expect(line('not-checked', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Asked Groq and Cerebras. No agreed answer.');
    expect(line('veto', { by: 'votes', voters: ['groq', 'groq'] })).toBe('Two Groq models both said false.');
    // Seen in the store screenshot run, 2026-10-05: the fallback put both votes on Groq.
    expect(line('not-checked', { by: 'votes', voters: ['groq', 'groq'] })).toBe('Asked two Groq models. No agreed answer.');
    expect(line('pass', { by: 'votes', voters: ['groq', 'cerebras', 'workers-ai'] })).toBe(
      'Groq, Cerebras and Cloudflare Workers AI all said true.',
    );
  });
  it('when a backup stood in, the line names the two that decided, not everyone the text reached', () => {
    const body = { by: 'votes', voters: ['groq', 'cerebras', 'openrouter'], deciders: ['groq', 'openrouter'] };
    expect(line('veto', body)).toBe('Groq and OpenRouter both said false.');
    expect(line('pass', body)).toBe('Groq and OpenRouter both said true.');
    expect(line('not-checked', body)).toBe('Asked Groq and OpenRouter. No agreed answer.');
    expect(pathOf(body, 'veto')).toEqual({ by: 'votes', voters: ['groq', 'cerebras', 'openrouter'], deciders: ['groq', 'openrouter'] });
  });
  it('deciders that are not exactly two of the voters are ignored, never half-used', () => {
    for (const deciders of [['groq'], ['groq', 'mistral'], ['groq', 'cerebras', 'groq'], 'groq', [1, 2]]) {
      const body = { by: 'votes', voters: ['groq', 'cerebras'], deciders };
      expect(pathOf(body, 'veto')).toEqual({ by: 'votes', voters: ['groq', 'cerebras'] });
      expect(line('veto', body)).toBe('Groq and Cerebras both said false.');
    }
  });
  it('every checker in the pool has a name people can read', () => {
    const body = { by: 'votes', voters: ['workers-ai', 'mistral', 'together', 'fireworks'], deciders: ['workers-ai', 'mistral'] };
    expect(line('pass', body)).toBe('Cloudflare Workers AI and Mistral both said true.');
    expect(line('pass', { by: 'votes', voters: ['together', 'fireworks'] })).toBe('Together and Fireworks both said true.');
  });
  it('skipped and deadline say why nothing was decided', () => {
    expect(line('not-checked', { by: 'skipped' })).toBe('No checker was asked.');
    expect(line('not-checked', { by: 'deadline' })).toBe('No answer in time.');
  });
  it('a skipped or deadline that claims a pass is ignored, not shown', () => {
    expect(line('pass', { by: 'skipped' })).toBe('');
    expect(line('veto', { by: 'deadline' })).toBe('');
  });
  it('an endpoint that does not say gets no line: nothing is invented', () => {
    for (const label of LABELS) expect(line(label, {})).toBe('');
  });
  it('a voter id that is not a plain id is refused whole, never echoed', () => {
    expect(line('pass', { by: 'votes', voters: ['Groq <b>'] })).toBe('');
  });
});

function stub(body: unknown) {
  return jest.fn(async () => ({ status: 200, text: async () => JSON.stringify(body) }));
}

describe('end to end through each door, with the endpoint stubbed', () => {
  const realFetch = (globalThis as { fetch?: unknown }).fetch;
  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = realFetch;
  });

  it('classifyClaim carries by and voters', async () => {
    (globalThis as { fetch?: unknown }).fetch = stub({ label: 'veto', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'] });
    const r = await classifyClaim('The Moon is made of cheese.', { apiUrl: 'http://localhost:9' });
    expect(r).toEqual({ label: 'veto', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'] });
  });

  it('classifyClaim reports no path for a not-checked it decided itself', async () => {
    (globalThis as { fetch?: unknown }).fetch = stub({ label: 'maybe', by: 'arithmetic' });
    const r = await classifyClaim('x is y', { apiUrl: 'http://localhost:9' });
    expect(r.label).toBe('not-checked');
    expect(r).not.toHaveProperty('by');
  });

  it('the extension stamp line names the voters', async () => {
    const row = await classify.classifyReply('The Moon is made of cheese.', {
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'veto', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'] }),
    });
    expect(row).toMatchObject({ label: 'veto', by: 'votes', voters: ['groq', 'cerebras'] });
    expect(classify.lineFor(row)).toBe('Groq and Cerebras both said false.');
  });

  it('the extension carries no path on an off-contract label', async () => {
    const row = await classify.classifyReply('x', {
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'PASS!!', by: 'arithmetic' }),
    });
    expect(row.label).toBe('not-checked');
    expect(row).not.toHaveProperty('by');
    // It says why, in the CLI's words: the label was outside the contract.
    expect(classify.lineFor(row)).toBe('Not checked: endpoint label is outside the contract (pass | veto | not-checked). This is not a pass.');
  });

  it('grok carries the path to its stamp line (it rebuilds the row, as content.js does)', async () => {
    const grok = require('../extension/grok.js') as {
      stampText: (text: string, options: Record<string, unknown>) => Promise<string>;
    };
    const element = { dataset: {} as Record<string, string>, textContent: '', title: '' };
    const shown = await grok.stampText('2 + 2 = 5', {
      element,
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'veto', latency_ms: 1, by: 'arithmetic' }),
    });
    expect(shown).toBe('veto');
    expect(element.textContent.endsWith('\nDecided by exact calculation. No model was asked.')).toBe(true);
  });

  it('an older endpoint (no by) gives the same row and no line, as before', async () => {
    const row = await classify.classifyReply('x', {
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'pass', latency_ms: 5 }),
    });
    expect(row).toEqual({ label: 'pass', latency_ms: expect.any(Number) });
    expect(classify.lineFor(row)).toBe('');
  });
});

/**
 * XC1's red-team finding (night bus #449, X1): a 200 whose `by` is out of contract kept its label,
 * so `{"label":"pass","by":"skipped"}` painted Checks out. The server never sends that shape
 * (repid-engine answerOf turns it into not-checked), so a client that receives it is not reading
 * this server, and its label decides nothing. An answer with no `by` at all is an older endpoint
 * and keeps its label, as before.
 */
describe('an answer that names a path it does not have is not checked, at every door', () => {
  const realFetch = (globalThis as { fetch?: unknown }).fetch;
  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = realFetch;
  });

  const OUT_OF_CONTRACT: unknown[] = [
    { label: 'pass', by: 'skipped' },
    { label: 'pass', by: 'deadline' },
    { label: 'pass', by: 'votes', voters: [] },
    { label: 'pass', by: 'votes' },
    { label: 'pass', by: 'not-a-path' },
    { label: 'not-checked', by: 'arithmetic-approx' },
    // A label that is not EXACTLY one of the three (XC1 on #554). The extension used to trim and
    // lowercase, so "Pass" was a pass there and not-checked in the CLI. Both doors are now strict.
    { label: 'Pass' },
    { label: ' pass' },
    { label: 'VETO', by: 'votes', voters: ['groq', 'cerebras'] },
    { label: 'pass ', by: 'arithmetic' },
    { label: 'veto', by: 'skipped' },
    { label: 'veto', by: 'votes', voters: [] },
    { label: 'pass', by: null },
    { label: 'pass', by: 'votes', voters: ['Groq <b>'] },
  ];

  for (const body of OUT_OF_CONTRACT) {
    it(`${JSON.stringify(body)} is not-checked through claim.ts and the extension`, async () => {
      (globalThis as { fetch?: unknown }).fetch = stub(body);
      const r = await classifyClaim('The Moon is made of cheese.', { apiUrl: 'http://localhost:9' });
      expect(r.label).toBe('not-checked');
      expect(r).not.toHaveProperty('by');
      const row = await classify.classifyReply('The Moon is made of cheese.', {
        endpoint: 'http://localhost:9/api/v1/classify',
        fetchImpl: stub(body),
      });
      expect(row.label).toBe('not-checked');
      expect(row).not.toHaveProperty('by');
      // The line under the stamp is word for word what the CLI prints for the same answer.
      expect(classify.lineFor(row)).toBe(explainClaim(r));
      expect(classify.lineFor(row)).toMatch(/out(side)? (of )?the contract|out of contract/);
    });
  }

  it('the reason says the answer was out of contract', async () => {
    (globalThis as { fetch?: unknown }).fetch = stub({ label: 'pass', by: 'skipped' });
    const r = await classifyClaim('x is y', { apiUrl: 'http://localhost:9' });
    expect(r.reason).toMatch(/out of contract/);
  });

  it('a well-formed path keeps its label, and no by at all keeps it too', async () => {
    for (const body of [
      { label: 'pass', by: 'votes', voters: ['groq', 'cerebras'] },
      { label: 'veto', by: 'arithmetic' },
      { label: 'not-checked', by: 'skipped' },
      { label: 'pass' },
    ]) {
      (globalThis as { fetch?: unknown }).fetch = stub(body);
      const r = await classifyClaim('x is y', { apiUrl: 'http://localhost:9' });
      expect(r.label).toBe((body as { label: string }).label);
      const row = await laya.callLaya('x is y', { modelUrl: 'http://localhost:9/api/v1/classify', fetchImpl: stub(body) });
      expect(row.label).toBe((body as { label: string }).label);
    }
  });

  for (const body of BODIES) {
    for (const label of LABELS) {
      const full = body && typeof body === 'object' ? { ...(body as object), label } : body;
      it(`both sides give one label for ${JSON.stringify(full)}`, async () => {
        (globalThis as { fetch?: unknown }).fetch = stub(full);
        const r = await classifyClaim('x is y', { apiUrl: 'http://localhost:9' });
        const row = await laya.callLaya('x is y', { modelUrl: 'http://localhost:9/api/v1/classify', fetchImpl: stub(full) });
        expect(row.label).toBe(r.label);
      });
    }
  }
});

describe('one place copies what produced the label', () => {
  // 2026-10-05: three host scripts copied `voters` by hand, and when `deciders` arrived the browser
  // stamp dropped it while every unit test passed. Only the extension e2e caught it.
  it('no extension file but classify.js copies voters or deciders by hand', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const dir = path.join(__dirname, '..', 'extension');
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js') && f !== 'classify.js' && f !== 'laya.js')
      .filter((f) => /row\.(voters|deciders)\.slice\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('copyPath carries by, voters and deciders, and nothing from a row without a path', () => {
    const c = classify as unknown as { copyPath: (row: unknown, out: Record<string, unknown>) => Record<string, unknown> };
    const row = { label: 'veto', by: 'votes', voters: ['groq', 'cerebras', 'openrouter'], deciders: ['groq', 'openrouter'], extra: 1 };
    expect(c.copyPath(row, { label: 'veto' })).toEqual({
      label: 'veto',
      by: 'votes',
      voters: ['groq', 'cerebras', 'openrouter'],
      deciders: ['groq', 'openrouter'],
    });
    expect(c.copyPath({ label: 'pass' }, { label: 'pass' })).toEqual({ label: 'pass' });
    expect(c.copyPath('not-checked', { label: 'not-checked' })).toEqual({ label: 'not-checked' });
  });
});

/**
 * The CLI says when the scrubber removed something before sending (SCRUBBED_LINE), because the label
 * is then about the text that was sent. The extension scrubbed the same text but said nothing, so a
 * Checks out on a reply holding a key read as a verdict on text that never left. Same words, every door.
 */
describe('a scrubbed reply says so, at every door', () => {
  const WITH_EMAIL = 'Write to jane.doe@example.com: the Moon is made of cheese.';
  const select = require('../extension/select.js') as {
    checkSelection: (text: string, tab: unknown, deps: Record<string, unknown>) => Promise<Record<string, unknown>>;
    toastText: (row: unknown) => string;
  };
  const c = classify as typeof classify & { SCRUBBED_LINE: string };

  it('the extension uses the CLI sentence word for word', () => {
    expect(c.SCRUBBED_LINE).toBe(SCRUBBED_LINE);
  });

  it('CLI, stamp and right-click toast all mark a scrubbed send and say so under the label', async () => {
    const body = { label: 'veto', latency_ms: 5, by: 'votes', voters: ['groq', 'cerebras'] };
    const cli = await classifyClaim(WITH_EMAIL, { apiUrl: 'http://localhost:9', fetchImpl: stub(body) as never });
    expect(cli.scrubbed).toBe(true);

    const sent = stub(body);
    const row = await classify.classifyReply(WITH_EMAIL, { endpoint: 'http://localhost:9/api/v1/classify', fetchImpl: sent });
    expect(row).toMatchObject({ label: 'veto', scrubbed: true });
    const init = (sent.mock.calls[0] as unknown[])[1] as { body: string };
    expect(JSON.parse(init.body).text).not.toContain('jane.doe@example.com');
    expect(classify.lineFor(row)).toBe('Groq and Cerebras both said false. ' + SCRUBBED_LINE);

    const picked = await select.checkSelection(WITH_EMAIL, null, { modelUrl: 'http://localhost:9/api/v1/classify', fetchImpl: stub(body) });
    expect(picked).toMatchObject({ label: 'veto', scrubbed: true });
    expect(select.toastText(picked)).toContain(SCRUBBED_LINE);
  });

  it('a not-checked from a scrubbed send still says it was scrubbed', async () => {
    const row = await classify.classifyReply(WITH_EMAIL, {
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'not-checked', by: 'skipped' }),
    });
    expect(row).toMatchObject({ label: 'not-checked', scrubbed: true });
    expect(classify.lineFor(row)).toBe('No checker was asked. ' + SCRUBBED_LINE);
  });

  it('nothing removed, nothing said; everything removed, nothing sent and nothing marked', async () => {
    const row = await classify.classifyReply('The Moon is made of cheese.', {
      endpoint: 'http://localhost:9/api/v1/classify',
      fetchImpl: stub({ label: 'veto', latency_ms: 5 }),
    });
    expect(row).not.toHaveProperty('scrubbed');
    expect(classify.lineFor(row)).toBe('');

    const none = stub({ label: 'pass' });
    const empty = await classify.classifyReply('jane.doe@example.com', { endpoint: 'http://localhost:9/api/v1/classify', fetchImpl: none });
    expect(empty.label).toBe('not-checked');
    expect(empty).not.toHaveProperty('scrubbed');
    expect(none).not.toHaveBeenCalled();
  });
});

/**
 * The names a stamp can print for a checker are exactly the hosts the privacy page's closed list
 * names (XC1 on #564). NVIDIA NIM and Z.ai are not in the engine's pool
 * (repid-engine src/classify/free-votes.ts), so neither door carries a display name for them. An
 * unknown id still prints as sent, and is never dressed up as a known host.
 */
describe('every checker name a door can show is on the privacy page', () => {
  const privacy = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'privacy.html'), 'utf8') as string;
  const namesIn = (file: string): string[] => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', file), 'utf8') as string;
    const block = src.slice(src.indexOf('VOTER_NAMES'), src.indexOf('};', src.indexOf('VOTER_NAMES')));
    return Array.from(block.matchAll(/:\s*'([^']+)'/g), (m) => m[1]!);
  };
  it('claim.ts and classify.js name the same hosts, and the privacy page names every one', () => {
    const cli = namesIn('src/lib/claim.ts');
    expect(namesIn('extension/classify.js')).toEqual(cli);
    expect(cli.length).toBeGreaterThan(0);
    expect(cli.filter((name) => !privacy.includes(name))).toEqual([]);
    expect(cli).not.toContain('NVIDIA NIM');
    expect(cli).not.toContain('Z.ai');
  });
});
