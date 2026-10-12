/**
 * depositStake, the PRACTICE path, against a stubbed engine. (It had no test of any kind before.)
 *
 * The practice path is a deposit with no tx_hash: the account's own session is enough, nothing is
 * signed, and the engine marks the credit non-binding. These pin what is sent, what comes back, and
 * that a refusal is a refusal. The click-through is tests/e2e/stranger-path-walk.mjs.
 */
import { STAKE_AUTH_ERRORS, depositStake, usdcToRaw } from '../lib/repid-engine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = '0x1111111111111111111111111111111111111111';
const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function stub(res: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return res();
  }) as never;
  return calls;
}

describe('depositStake: the practice path', () => {
  it('POSTs the deposit with the account header, the demo "100" literal, and no tx hash or signature', async () => {
    const calls = stub(() => json(200, { ok: true, simulated: true }));
    const r = await depositStake({ builder_address: OWNER, amount_usdc: 100, authHeaders: { Authorization: 'Bearer session-token' } });
    expect(r).toMatchObject({ ok: true, simulated: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/api\/v1\/stake\/deposit$/);
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({ builder_address: OWNER, amount: '100' });
    expect(sent.tx_hash).toBeUndefined();
    expect(sent.signature).toBeUndefined();
  });

  it('sends any other amount as raw micro-USDC', async () => {
    const calls = stub(() => json(200, { ok: true }));
    await depositStake({ builder_address: OWNER, amount_usdc: 2.5 });
    expect(JSON.parse(String(calls[0]!.init.body)).amount).toBe(usdcToRaw(2.5));
    expect(usdcToRaw(2.5)).toBe('2500000');
  });

  it('a refusal is ok:false with the engine\'s reason, never a quiet success', async () => {
    stub(() => json(401, { error: 'no_credential', message: 'sign in' }));
    const r = await depositStake({ builder_address: OWNER, amount_usdc: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_credential');
    expect(r.status).toBe(401);
    expect(STAKE_AUTH_ERRORS['no_credential']).toMatch(/Verify your email/);
  });

  it('a refusal with no body still says it failed, with the status', async () => {
    stub(() => new Response('', { status: 502 }));
    const r = await depositStake({ builder_address: OWNER, amount_usdc: 100 });
    expect(r).toMatchObject({ ok: false, status: 502, error: 'deposit failed (502)' });
  });

  it('a network failure throws, so the page can say the backend is unavailable', async () => {
    stub(() => {
      throw new TypeError('network down');
    });
    await expect(depositStake({ builder_address: OWNER, amount_usdc: 100 })).rejects.toThrow();
  });
});

describe('the /stake page: practice, and only after the agent is bound', () => {
  const src = readFileSync(join(__dirname, '..', 'app/stake/page.tsx'), 'utf8').replace(/\r/g, '');
  it('is labelled Practice and says the test stake does not raise what the agent may spend', () => {
    expect(src).toContain('<PracticeBadge />');
    expect(src).toContain('only a real on-chain deposit raises what the agent may actually spend');
  });
  it('holds the stake until the owner record says owned, and an unreadable record holds it too', () => {
    expect(src).toContain('const bound = owner?.owned === true;');
    expect(src).toContain('disabled={submitting || !bound ||');
    expect(src).toContain("'Bind the agent to stake'");
    expect(src).toContain('Not checked: whether this agent is bound could not be read');
    // the hold sits before any network call in the submit handler
    expect(src.indexOf('if (!bound)')).toBeLessThan(src.indexOf('await depositStake('));
  });
  it('points at the faucet in plain view, not only behind "I already sent USDC"', () => {
    expect(src).toContain('data-testid="stake-faucet-pointer"');
    expect(src).toContain('href="/faucet"');
  });
});
