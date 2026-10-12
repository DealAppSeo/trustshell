/**
 * Every door that sends a sentence over the network sends it SCRUBBED, for every shape in the corpus,
 * including the ones the scrubber used to miss.
 *
 * WHY THIS EXISTS (XC1 red team, 2026-10-12). `trustshell check --help` says "known secret shapes are
 * stripped before it is sent", and the report was that whsec_, a bare AWS secret, ya29., a BIP39 seed
 * phrase, an xprv key, a raw Solana keypair array and `api_secret=` values went out verbatim. The
 * wiring turned out to be complete: every door already calls the one scrubber (src/memory/redact.ts,
 * mirrored in extension/scrub.js). The DEFECT WAS SHAPE COVERAGE, so these tests drive each real door
 * with fetch stubbed and read the bytes that would leave the machine.
 *
 * Doors covered: CLI `check`, CLI `verify`, CLI `evaluate`, the web page's classifyClaim, MCP
 * `check_claim`, MCP `verify_output`, and the Chrome extension's callLaya (what the auto-classify
 * path calls). The label and the local record are unchanged: only the outbound text is cleaned.
 */
import { run, parseArgs, EXIT, type CliIO } from '../src/cli';
import { classifyClaim } from '../src/lib/claim';
import { TrustShell } from '../src/lib/trustshell';
import { createServer } from '../src/mcp/index';
import { MISSED } from './fixtures/scrub-shapes';
import { SENSITIVE, KEEP } from './fixtures/scrub-corpus';

const ENGINE = 'https://engine.test';
const LAYA = require('../extension/laya.js') as { callLaya: (text: unknown, o?: Record<string, unknown>) => Promise<{ label: string }> };

const realFetch = global.fetch;
const prevUrl = process.env.TRUSTSHELL_API_URL;
let bodies: string[] = [];

beforeEach(() => {
  bodies = [];
  process.env.TRUSTSHELL_API_URL = ENGINE;
  global.fetch = (async (_url: string, init?: RequestInit) => {
    // Only what is POSTed carries text; a GET (a health probe, a lookup) has no body to leak.
    if (init?.method === 'POST' && typeof init.body === 'string') bodies.push(init.body);
    const isClassify = String(_url).endsWith('/api/v1/classify');
    return new Response(
      JSON.stringify(
        isClassify
          ? { label: 'not-checked', latency_ms: 1, by: 'skipped' }
          : { decision: 'clean', hal_score: 0.1, mode: 'fact-check', signals: { families_used: 2, providers_used: 2 }, provider_responses: [{ provider: 'groq', verdict: 'TRUE' }, { provider: 'cerebras', verdict: 'TRUE' }] },
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
  else process.env.TRUSTSHELL_API_URL = prevUrl;
});

const io = (): CliIO => ({ out: () => {}, err: () => {} });
const sentOf = (body: string): string => (JSON.parse(body) as { text: string }).text;
const client = () => new TrustShell({ apiUrl: ENGINE });

type Door = { name: string; send: (text: string) => Promise<void> };
const DOORS: Door[] = [
  { name: 'CLI check', send: async (t) => void (await run(parseArgs(['check', t]), client(), io())) },
  { name: 'CLI verify', send: async (t) => void (await run(parseArgs(['verify', t]), client(), io())) },
  { name: 'CLI evaluate', send: async (t) => void (await run(parseArgs(['evaluate', t]), client(), io())) },
  { name: 'web /check (classifyClaim)', send: async (t) => void (await classifyClaim(t, { apiUrl: ENGINE, env: {} })) },
  {
    name: 'MCP check_claim',
    send: async (t) => {
      const tool = (createServer(client()) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<unknown> }> })._registeredTools['check_claim']!;
      await tool.handler({ text: t });
    },
  },
  {
    name: 'MCP verify_output',
    send: async (t) => {
      const tool = (createServer(client()) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<unknown> }> })._registeredTools['verify_output']!;
      await tool.handler({ text: t });
    },
  },
  { name: 'extension callLaya (auto-classify)', send: async (t) => void (await LAYA.callLaya(t, { modelUrl: `${ENGINE}/api/v1/classify`, fetchImpl: global.fetch })) },
];

describe.each(DOORS)('$name sends no secret', (door) => {
  it.each(SENSITIVE.map((r) => [r.kind, r] as const))('%s', async (_kind, row) => {
    await door.send(row.text);
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(sentOf(b)).not.toContain(row.secret);
  });

  it.each(MISSED.map((s) => [s.kind, s] as const))('the sentence around %s is still sent, so the claim stays checkable', async (_kind, shape) => {
    await door.send(shape.text);
    for (const b of bodies) expect(sentOf(b)).toMatch(/came from the reply|config has|body was|env has|backed up|in it\./);
  });

  it('sends ordinary claims unchanged', async () => {
    for (const s of KEEP) {
      bodies = [];
      await door.send(s);
      expect(bodies.map(sentOf)).toEqual([s]);
    }
  });
});

describe('the outcome is unchanged, only the outbound text is cleaned', () => {
  it('check still returns the endpoint label and marks the sentence as scrubbed', async () => {
    const r = await classifyClaim(MISSED[0]!.text, { apiUrl: ENGINE, env: {} });
    expect(r.label).toBe('not-checked');
    expect(r.scrubbed).toBe(true);
  });

  it('a sentence that is ONLY a secret sends nothing (the CLI exits 3, nothing sent)', async () => {
    const lines: string[] = [];
    const code = await run(parseArgs(['check', MISSED[3]!.secret]), client(), { out: (s) => lines.push(s), err: (s) => lines.push(s) });
    expect(code).toBe(EXIT.RUNTIME);
    expect(bodies).toEqual([]);
  });
});

describe('a github install (the committed dist/) carries the fix too', () => {
  it('the committed dist/memory/redact.js removes every shape in the corpus', () => {
    // dist/ is what `npm i github:DealAppSeo/trustshell` and a pack ship, and it is committed, not
    // rebuilt on install. So the build itself is held to the corpus, not just src/.
    const built = require('../dist/memory/redact') as { redact: (v: string) => string; containsSecret: (v: string) => boolean };
    const leaked = SENSITIVE.filter((r) => built.redact(r.text).includes(r.secret)).map((r) => r.kind);
    expect(leaked).toEqual([]);
    for (const s of KEEP) expect(built.redact(s)).toBe(s);
    const credentials = SENSITIVE.filter((r) => !/email|phone|ssn|card|iban/.test(r.kind));
    expect(credentials.filter((r) => !built.containsSecret(r.text)).map((r) => r.kind)).toEqual([]);
  });
});
