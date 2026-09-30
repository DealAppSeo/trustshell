/**
 * OFFLINE=1 keeps remember and recall on the local sqlite file.
 * verify still runs, and the receipt POST is skipped.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'the claim you typed';
const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OFFLINE remember, recall, and verify', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  let dir = '';
  let db = '';
  let beforeHome: number | null = null;

  beforeEach(() => {
    beforeHome = homeStamp();
    dir = mkdtempSync(join(tmpdir(), 'ts-offline-memory-'));
    db = join(dir, 'memory.sqlite');
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = ENGINE;
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
    rmSync(dir, { recursive: true, force: true });
    expect(homeStamp()).toBe(beforeHome);
  });

  it('remember and recall stay local, and verify skips the receipt POST', async () => {
    const memoryCalls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      memoryCalls.push(String(input));
      throw new Error('network');
    }) as typeof fetch;

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const client = new TrustShell({ apiUrl: ENGINE });

    expect(await run(parseArgs(['remember', 'desk', 'local only']), client, io)).toBe(0);
    expect(await run(parseArgs(['recall', 'desk']), client, io)).toBe(0);
    expect(out[out.length - 1]).toBe('local only');
    expect(await run(parseArgs(['recall', 'missing']), client, io)).toBe(0);
    expect(out[out.length - 1]).toBe('NOT_CHECKED');
    expect(out[out.length - 1]).not.toBe('');
    expect(await run(parseArgs(['remember', 'ship the receipt']), client, io)).toBe(0);
    expect(await run(parseArgs(['recall']), client, io)).toBe(0);
    expect(out[out.length - 1]).toContain('ship the receipt');
    expect(memoryCalls).toEqual([]);

    let evaluatePosts = 0;
    let receiptPosts = 0;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        evaluatePosts += 1;
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1 },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        receiptPosts += 1;
        return jsonResponse(200, { written: true });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    out.length = 0;
    expect(await run(parseArgs(['verify', CLAIM]), client, io)).toBe(0);
    expect(evaluatePosts).toBe(1);
    expect(receiptPosts).toBe(0);
    expect(out.join('\n')).not.toContain('receipt ');
    expect(out.join('\n')).not.toContain('receipt NOT_CHECKED');
  });
});
