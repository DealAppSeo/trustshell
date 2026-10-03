/**
 * `trustshell repid <id>` against the shape the live engine returns.
 *
 * MEASURED 2026-10-03: GET /api/v1/repid/trinity-sophia → {"score":1334,"tier":"ESTABLISHED"}.
 * 1.4.0 read only `repid_score`, so it printed "RepID undefined  (ESTABLISHED)" and exited 0 for
 * every agent. The engine also returns {"score":"NOT_CHECKED"} when it has no number; that must
 * fail, not print a figure.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

function stub(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

async function repid(body: unknown) {
  global.fetch = stub(body);
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const code = await run(parseArgs(['repid', 'trinity-sophia']), new TrustShell({ apiUrl: ENGINE }), io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('trustshell repid reads the live score field', () => {
  const prevFetch = global.fetch;
  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('prints the number from {score, tier}', async () => {
    const r = await repid({ score: 1334, tier: 'ESTABLISHED' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('RepID 1334  (ESTABLISHED)');
    expect(r.out).not.toMatch(/undefined/);
  });

  it('still reads the legacy repid_score field', async () => {
    const r = await repid({ repid_score: 900, tier: 'EARNING' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('RepID 900  (EARNING)');
  });

  it.each([
    ['NOT_CHECKED from the engine', { score: 'NOT_CHECKED', tier: 'NOT_CHECKED' }],
    ['no score field at all', { tier: 'ESTABLISHED' }],
  ])('%s is a failure, never a figure', async (_name, body) => {
    const r = await repid(body);
    expect(r.code).toBe(3);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/not checked/i);
  });
});
