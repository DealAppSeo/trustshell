/**
 * "Checks you can see": the classify endpoint now says what produced a label (`by`, and `voters`
 * only for votes). The CLI, MCP and /check read it through src/lib/claim.ts; the extension reads it
 * through extension/laya.js and extension/classify.js. Both sides must accept the same answers and
 * say the same words, and both must say NOTHING when the endpoint did not say (an older backend).
 */
import { classifyClaim, pathLine, pathOf, type ClaimLabel } from '../src/lib/claim';

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

  it('arithmetic says no model was asked', () => {
    expect(line('veto', { by: 'arithmetic' })).toBe('Decided by exact calculation. No model was asked.');
  });
  it('votes name the voters that answered', () => {
    expect(line('pass', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Groq and Cerebras both said true.');
    expect(line('veto', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Groq and Cerebras both said false.');
    expect(line('not-checked', { by: 'votes', voters: ['groq', 'cerebras'] })).toBe('Asked Groq and Cerebras. No agreed answer.');
    expect(line('veto', { by: 'votes', voters: ['groq', 'groq'] })).toBe('Two Groq models both said false.');
    expect(line('pass', { by: 'votes', voters: ['groq', 'cerebras', 'workers-ai'] })).toBe(
      'Groq, Cerebras and Cloudflare Workers AI all said true.',
    );
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
    expect(classify.lineFor(row)).toBe('');
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
      expect(classify.lineFor(row)).toBe('');
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
