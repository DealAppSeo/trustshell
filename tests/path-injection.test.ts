/**
 * An untrusted agent id must never choose which endpoint the client calls.
 *
 * XC1 (2026-10-12): `trustshell repid '../agents/x/export'` and the MCP `get_repid` tool spliced the id
 * UNENCODED into `GET /api/v1/repid/<id>`, so the request became `/api/v1/agents/x/export`, a different
 * same-origin endpoint, and it was sent WITH the caller's API key attached (the client puts the key on
 * every request). An id that an LLM agent or a pasted command supplies is untrusted input.
 *
 * The id now goes through one gate: a plain agent id, slug, UUID or token id (the extension's own
 * pattern), then encodeURIComponent. A `..` or `.` id is refused too, because the URL parser would
 * otherwise collapse it as a dot segment even after encoding.
 */
import { createServer } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';
import { run, parseArgs, EXIT, type CliIO } from '../src/cli';

const ENGINE = 'https://engine.test';
const KEY = 'ts_test_key_for_the_path_probe';
const realFetch = global.fetch;
let calls: Array<{ url: string; auth: string | undefined }> = [];

beforeEach(() => {
  calls = [];
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.['Authorization'] });
    return new Response(JSON.stringify({ score: 200, tier: 'PROBATIONARY', agent_id: 'x', proof_bytes: 'AA==', statement: { agent_id: 'x', repid_score: 200, threshold: 100, tier: 'PROBATIONARY' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

const client = () => new TrustShell({ apiUrl: ENGINE, apiKey: KEY });
const HOSTILE = [
  '../agents/x/export',
  '..%2Fagents%2Fx%2Fexport',
  '..',
  '.',
  'x/../../agents/y',
  'x?admin=1',
  'x#frag',
  'x\\..\\y',
  'x y',
  'x\n/api/v1/other',
  '',
  ' ',
  '/etc/passwd',
  '%2e%2e',
  'a'.repeat(129),
];
const UNDER_API = (u: string) => new URL(u).pathname;

describe('the SDK never lets an id choose the endpoint', () => {
  it.each(HOSTILE)('getRepID(%j) is refused before any request is made', async (id) => {
    await expect(client().getRepID(id)).rejects.toThrow(/not an agent id/);
    expect(calls).toEqual([]);
  });

  it.each(HOSTILE)('verify(%j) and presentProof(%j) are refused before any request', async (id) => {
    await expect(client().verify(id)).rejects.toThrow(/not an agent id/);
    await expect(client().presentProof(id)).rejects.toThrow(/not an agent id/);
    expect(calls).toEqual([]);
  });

  it('the exact probe: `../agents/x/export` never reaches /api/v1/agents/x/export, and the key never goes with it', async () => {
    await client().getRepID('../agents/x/export').catch(() => undefined);
    expect(calls.filter((c) => /\/agents\/x\/export/.test(c.url))).toEqual([]);
    expect(calls.filter((c) => c.auth !== undefined)).toEqual([]);
  });

  it.each(['trinity-sophia', 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271', '3747', 'agent_01', 'a.b-c:d', 'A'])('a plain id %j still works, and stays one path segment', async (id) => {
    const r = await client().getRepID(id);
    expect(r.repid).toBe(200);
    for (const c of calls) {
      const p = UNDER_API(c.url);
      expect(p === `/api/v1/repid/${encodeURIComponent(id)}` || p === `/api/v1/repid/${encodeURIComponent(id)}/proof`).toBe(true);
    }
  });

  it('an unknown leaderboard name cannot choose the endpoint either', async () => {
    await expect(client().getLeaderboard('../agents/x/export' as never)).rejects.toThrow(/leaderboard/i);
    expect(calls).toEqual([]);
    await client().getLeaderboard('agents').catch(() => undefined);
    expect(calls.map((c) => UNDER_API(c.url))).toEqual(['/api/v1/leaderboard/agents']);
  });
});

describe('the CLI and the MCP tools go through the same gate', () => {
  const io = (): { io: CliIO; out: string[]; err: string[] } => {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
  };

  it("`trustshell repid '../agents/x/export'` fails honestly and sends nothing", async () => {
    const h = io();
    const code = await run(parseArgs(['repid', '../agents/x/export']), client(), h.io);
    expect(code).not.toBe(EXIT.OK);
    expect(h.err.join('\n')).toMatch(/not an agent id/);
    expect(calls).toEqual([]);
  });

  it.each(['proof', 'badge'])('`trustshell %s` with a hostile id sends nothing', async (cmd) => {
    const h = io();
    const code = await run(parseArgs([cmd, '../agents/x/export']), client(), h.io);
    expect(code).not.toBe(EXIT.OK);
    expect(calls).toEqual([]);
  });

  it.each(['get_repid', 'getRepID', 'repid', 'present_proof'])('MCP %s with a hostile id returns an error and sends nothing', async (name) => {
    const tool = (createServer(client()) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<{ isError?: boolean }> }> })._registeredTools[name];
    expect(tool).toBeDefined();
    const res = await tool!.handler({ agentId: '../agents/x/export' });
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('the COMMITTED dist carries the gate (npm pack ships dist/ as committed)', () => {
  // Behavioural, not a text match: load the built client and make the probe. A renamed constant cannot
  // pass this by accident, and a stale dist cannot hide behind a source-only test.
  it('dist/lib/trustshell.js refuses ../agents/x/export before any request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const built = require('../dist/lib/trustshell.js') as { TrustShell: typeof TrustShell };
    const c = new built.TrustShell({ apiUrl: ENGINE, apiKey: KEY });
    await expect(c.getRepID('../agents/x/export')).rejects.toThrow(/not an agent id/);
    await expect(c.getRepID('..')).rejects.toThrow(/not an agent id/);
    expect(calls).toEqual([]);
  });

  it('and still serves a plain id, as one path segment', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const built = require('../dist/lib/trustshell.js') as { TrustShell: typeof TrustShell };
    const c = new built.TrustShell({ apiUrl: ENGINE, apiKey: KEY });
    await c.getRepID('trinity-sophia');
    // getRepID also reads the proof beside the score: every request stays under this one agent's path.
    const paths = calls.map((x) => new URL(x.url).pathname);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.startsWith('/api/v1/repid/trinity-sophia')).toBe(true);
  });
});
