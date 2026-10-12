/**
 * LANE 3 — the testnet practice path: bind → stake(practice) → limit-to-zero, owner-signs-or-refuse.
 *
 * These pin the four promises of the lane as ONE contract, against the stubbed shape (no live
 * backend or wallet is reachable from here):
 *   1. NO SIGNATURE → REFUSE, on bind AND on the spend-cap. The owner's own box produces the
 *      signature; when it declines, nothing is submitted and nothing is sent. The path never signs
 *      on the user's behalf and never proceeds unsigned.
 *   2. The stake is PRACTICE wherever it is shown — the badge and the testnet label, never a live one.
 *   3. LIMIT-TO-ZERO kills the next spend, ENFORCED on the spend path (zeroCapRefusal), not merely
 *      displayed; fail-closed when the cap could not be read.
 *   4. REAL_STAKING stays off — nothing in the lane's files flips it or any stake/bind flag.
 *
 * The live legs (a real wallet signature, the engine's own cap enforcement, the USDC transferFrom)
 * are NOT_CHECKED-against-live here and are proven by the click-through walk (tests/e2e/spend-walk.mjs,
 * which drives a real Chromium against a stubbed engine) — see the report, not a guessed pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindAgent } from '../lib/human-bind';
import { setCap, zeroCapRefusal, type Eip1193 } from '../lib/agent-spend-client';

const ROOT = join(__dirname, '..');
const WALLET = '0x1111111111111111111111111111111111111111';
const AGENT_WALLET = '0x2222222222222222222222222222222222222222';
const AGENT_ID = '00000000-0000-0000-0000-000000000000';
const AGENT_KEY = 'ts_live_abc';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

/** Records every request, and answers the engine's 401 auth-template probe so the flow reaches sign(). */
function stubEngine() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  global.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    // authHeaders() draws the statement to sign from a 401; the slots must be present.
    const body = JSON.stringify({ sign_this: 'Prove you hold <your wallet> at <ISO timestamp>' });
    return new Response(body, { status: 401, headers: { 'content-type': 'application/json' } });
  }) as never;
  return calls;
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

describe('1. no signature → refuse — the owner box signs or the path stops', () => {
  it('bind: a declined wallet refuses and submits no binding (no x-agent-key request leaves)', async () => {
    const calls = stubEngine();
    const declining = async () => {
      const e = new Error('user rejected') as Error & { code?: number };
      e.code = 4001;
      throw e;
    };

    const r = await bindAgent({ wallet: WALLET, agentId: AGENT_ID, agentKey: AGENT_KEY, sign: declining });

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: 'declined' });
    // The real bind submit is the only call that carries the agent's key. None did → nothing was bound.
    expect(calls.some((c) => headerOf(c.init, 'x-agent-key') !== undefined)).toBe(false);
  });

  it('bind: no agent key refuses BEFORE any network — proof of the agent, not just the wallet', async () => {
    const calls = stubEngine();
    const neverCalled = async () => {
      throw new Error('sign must not be reached');
    };

    const r = await bindAgent({ wallet: WALLET, agentId: AGENT_ID, agentKey: '   ', sign: neverCalled });

    expect(r).toMatchObject({ ok: false, reason: 'agent_key_required' });
    expect(calls).toHaveLength(0);
  });

  it('spend-cap: a declined wallet sends nothing — no approve is confirmed', async () => {
    const seen: string[] = [];
    const eth: Eip1193 = {
      request: async ({ method }) => {
        seen.push(method);
        if (method === 'eth_chainId') return '0x14a34'; // already on Base Sepolia
        if (method === 'eth_sendTransaction') {
          const e = new Error('user rejected') as Error & { code?: number };
          e.code = 4001;
          throw e; // the owner declines signing the approve
        }
        throw new Error(`unexpected ${method}`);
      },
    };

    await expect(setCap(eth, WALLET, AGENT_WALLET, BigInt(5000000))).rejects.toThrow();
    // It stopped at the decline: no receipt was ever polled, so nothing was submitted and confirmed.
    expect(seen).not.toContain('eth_getTransactionReceipt');
  });
});

describe('3. limit-to-zero kills the next spend — enforced, fail-closed', () => {
  it('a cap of 0 refuses the next spend, in plain words', () => {
    for (const zero of ['0', '0.0', '0.000000']) {
      const refusal = zeroCapRefusal(zero);
      expect(refusal).not.toBeNull();
      expect(refusal).toMatch(/cap is 0|stopped/i);
      expect(refusal).toMatch(/nothing was sent/i);
    }
  });

  it('a cap that could not be read refuses too — not checked is not allowed', () => {
    for (const unreadable of [null, undefined, 'not checked', '', 'abc']) {
      const refusal = zeroCapRefusal(unreadable);
      expect(refusal).not.toBeNull();
      expect(refusal).toMatch(/not checked/i);
    }
  });

  it('a positive cap proceeds — the engine and the contract decide the over-cap case, not this', () => {
    for (const ok of ['5', '0.000001', '1000']) {
      expect(zeroCapRefusal(ok)).toBeNull();
    }
  });

  it('the /spend page runs the zero-cap refusal on the REAL spend, before asking the engine', () => {
    const src = readFileSync(join(ROOT, 'app/spend/page.tsx'), 'utf8').replace(/\r/g, '');
    expect(src).toContain("zeroCapRefusal,");
    expect(src).toContain('const refusal = zeroCapRefusal(status?.reads?.cap_usdc ?? null);');
    // the refusal is inside the real-spend branch, and it runs before the pay's askSpend call
    expect(src).toContain('if (!dryRun) {');
    expect(src.indexOf('const refusal = zeroCapRefusal')).toBeLessThan(src.indexOf('setReply(await askSpend('));
  });
});

describe('2. the stake is practice, never presented as a live one', () => {
  const src = readFileSync(join(ROOT, 'app/stake/page.tsx'), 'utf8').replace(/\r/g, '');
  it('shows the Practice badge and labels the test stake "testnet"', () => {
    expect(src).toContain('<PracticeBadge />');
    expect(src).toContain('testnet USDC');
  });
  it('says the testnet stake does not raise what the agent may actually spend', () => {
    expect(src).toContain('only a real on-chain deposit raises what the agent may actually spend');
  });
});

describe('4. REAL_STAKING stays off — the lane flips no stake/bind flag', () => {
  const LANE3_FILES = ['lib/agent-spend-client.ts', 'app/spend/page.tsx'];
  it.each(LANE3_FILES)('%s references no REAL_STAKING / HUMAN_AGENT_BIND / SAYS_STAKE_LIVE flag', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).not.toMatch(/\b(REAL_STAKING|HUMAN_AGENT_BIND|SAYS_STAKE_LIVE)\b/);
  });
});
