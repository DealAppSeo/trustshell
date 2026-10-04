/**
 * One stranger path: install, verify, status, and proof --verify.
 * A missing first_pass is omitted. OFFLINE=1 is NOT_CHECKED, never PASS.
 * The hero does not name a PAI or a CMO belt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ROOT = join(__dirname, '..');
const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';
const INSTALL = 'npm i -g @hyperdag/trustshell@1.5.0';

type ProofFixture = {
  agentId: string;
  proof_bytes: string;
  scheme: string;
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string };
  created_at: string;
};

const fixture = JSON.parse(
  readFileSync(join(ROOT, 'fixtures/proof-agent.json'), 'utf8'),
) as ProofFixture;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? undefined : { 'content-type': 'application/json' },
  });
}

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('stranger path', () => {
  jest.setTimeout(60000);
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  it('names the install line, verify, status, and proof --verify', async () => {
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    expect(hero).toContain(INSTALL);
    const helpCap = capture();
    const helpCode = await run(parseArgs(['--help']), new TrustShell({ apiUrl: ENGINE }), helpCap.io);
    expect(helpCode).toBe(0);
    const help = helpCap.out.join('\n');
    expect(help).toMatch(/\n {2}verify /);
    expect(help).toMatch(/\n {2}status /);
    expect(help).toMatch(/\n {2}proof /);
    expect(help).toMatch(/\[--verify\]/);

    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url !== `${ENGINE}/api/v1/repid/${encodeURIComponent(fixture.agentId)}/proof`) {
        throw new Error(`unexpected fetch ${url}`);
      }
      return jsonResponse(200, {
        proof_bytes: fixture.proof_bytes,
        scheme: fixture.scheme,
        statement: fixture.statement,
        created_at: fixture.created_at,
      });
    }) as typeof fetch;
    const proofCap = capture();
    const proofCode = await run(
      parseArgs(['proof', fixture.agentId, '--verify']),
      new TrustShell({ apiUrl: ENGINE }),
      proofCap.io,
    );
    expect(proofCode).toBe(0);
    expect(proofCap.out.join('\n')).toMatch(/verified\s+✓/);
  });

  it('omits a missing first_pass and never prints 0', async () => {
    delete process.env.OFFLINE;
    process.env.TRUSTSHELL_API_URL = ENGINE;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.2,
          mode: 'fact-check',
          signals: { families_used: 2, providers_used: 2 },
          provider_responses: [],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const cap = capture();
    const code = await run(
      parseArgs(['verify', CLAIM, '--json']),
      new TrustShell({ apiUrl: ENGINE }),
      cap.io,
    );
    expect(code).toBe(0);
    const raw = cap.out.join('\n');
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, 'first_pass')).toBe(false);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
    expect(raw).not.toContain(CLAIM);
  });

  it('OFFLINE=1 prints NOT_CHECKED and not PASS', async () => {
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = ENGINE;
    let called = false;
    global.fetch = (async () => {
      called = true;
      return jsonResponse(200, { verdict: 'PASS', status: 'PASS' });
    }) as typeof fetch;
    const cap = capture();
    const code = await run(parseArgs(['status']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const text = cap.out.join('\n');
    expect(code).toBe(0);
    expect(called).toBe(false);
    expect(text).toContain('NOT_CHECKED');
    expect(text).not.toMatch(/\bPASS\b/);
  });

  it('keeps PAI and CMO belt off the hero', () => {
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    expect(hero).not.toContain('PAI');
    expect(hero).not.toContain('CMO belt');
  });
});
