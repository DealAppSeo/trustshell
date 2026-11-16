/**
 * DESIGN_PRINCIPLES rule 9 on the journey pages (/pai, /bind, /stake, /spend and the rest): no raw error
 * text, no spinner that never ends, and a failure is never reported as a success or as "nothing changed"
 * when something did.
 *
 * Discovery, not a list of lines: every source file under the journey routes is scanned for the shapes
 * that print an error as it came (a thrown error's message, an engine's bare code, an HTTP status).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { engineFetch } from '../lib/repid-engine';
import { setCap, spendMessage, type Eip1193 } from '../lib/agent-spend-client';

const ROOT = join(__dirname, '..');
const walk = (rel: string): string[] =>
  readdirSync(join(ROOT, rel)).flatMap((n) => {
    const child = join(rel, n);
    return statSync(join(ROOT, child)).isDirectory() ? walk(child) : /\.tsx?$/.test(n) ? [child] : [];
  });
const JOURNEY = [...['check', 'pai', 'bind', 'stake', 'spend', 'market', 'faucet', 'wallet'].flatMap((r) => walk(join('app', r))), ...walk(join('components', 'bind'))];

describe('no journey page prints an error as it came', () => {
  const RAW: RegExp[] = [
    /\$\{(e|err|error)\.message\}/, // a thrown error's text inside a sentence
    /instanceof Error \? (e|err|error)\.message/, // a wallet's or fetch's own message as the whole sentence
    /\b(data|scoreData)\.error \|\|/, // the engine's bare code when it sent no sentence
    /\?\? r\.error \?\?/,
    /`[^`]*\(\$\{\w+\.status\}\)`/, // "failed (500)"
  ];
  it('walks the journey routes', () => {
    expect(JOURNEY.length).toBeGreaterThan(8);
    expect(JOURNEY).toContain(join('app', 'pai', 'page.tsx'));
  });
  it('finds none of the raw shapes', () => {
    const hits = JOURNEY.flatMap((rel) => RAW.filter((re) => re.test(readFileSync(join(ROOT, rel), 'utf8'))).map((re) => `${rel}: ${re}`));
    expect(hits).toEqual([]);
  });
});

describe('a request that never answers ends', () => {
  it('engineFetch abandons it after its time', async () => {
    const prev = global.fetch;
    global.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as typeof fetch;
    try {
      const started = Date.now();
      await expect(engineFetch('https://engine.invalid/x', { method: 'POST' }, 50)).rejects.toBeTruthy();
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      global.fetch = prev;
    }
  });

  it('every engine call on /pai, /bind and /spend goes through it', () => {
    for (const rel of ['app/pai/page.tsx', 'lib/human-bind.ts', 'lib/agent-spend-client.ts']) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/await fetch\(/);
      expect(src).toMatch(/engineFetch\(/);
    }
  });
});

describe('/spend says what happened, in plain words', () => {
  it('replaces an engine answer that ends in a raw error', () => {
    const raw = 'Could not complete the spend: execution reverted (unknown custom error) data="0xfb8f41b2"';
    const said = spendMessage({ code: 'chain_error', error: raw });
    expect(said).not.toContain('reverted');
    expect(said).toMatch(/Basescan/);
    expect(spendMessage({ code: 'spending_off', error: 'Agent spending is off on this server (AGENT_SPEND_ENABLED).' })).not.toContain('AGENT_SPEND');
  });

  it("keeps the engine's own plain sentence, and never prints a bare code", () => {
    const plain = "owner_address is not this agent's bound owner. An agent spends only from its owner's wallet.";
    expect(spendMessage({ code: 'not_owner', error: plain })).toBe(plain);
    expect(spendMessage({ code: 'something_new' })).toBe('the engine did not say why. Nothing was sent.');
  });

  it('does not say "nothing changed" about an approval already sent', async () => {
    const calls: string[] = [];
    const eth: Eip1193 = {
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'eth_sendTransaction') return '0xabc';
        if (method === 'eth_getTransactionReceipt') throw new Error('RPC unavailable');
        return null;
      },
    } as Eip1193;
    await expect(setCap(eth, '0x' + '1'.repeat(40), '0x' + '2'.repeat(40), BigInt(5))).resolves.toEqual({ hash: '0xabc', mined: false, ok: null });
    expect(calls).toContain('eth_sendTransaction');
  });
});
