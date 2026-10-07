/**
 * The claim carries the agent's own key (lib/human-bind.ts bindAgent), in a header, never the body.
 * Without it the engine refuses the claim; the client refuses first and opens no wallet prompt.
 */
import { bindAgent } from '../lib/human-bind';

const WALLET = '0x1111111111111111111111111111111111111111';
const AGENT = '4d7c2a1e-5b3f-4e8a-9c6d-2f1a0b9e8d7c';

describe('bindAgent', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('no key: refuses before any wallet prompt or network call', async () => {
    const sign = jest.fn();
    global.fetch = jest.fn() as any;
    const r = await bindAgent({ wallet: WALLET, agentId: AGENT, agentKey: '  ', sign });
    expect(r).toEqual({ ok: false, reason: 'agent_key_required' });
    expect(sign).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the key as x-agent-key on the claim, and nowhere in any body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/human/bind/message')) return new Response(JSON.stringify({ message: 'stmt', scope: 'ownership' }), { status: 200 });
      const h = (init?.headers ?? {}) as Record<string, string>;
      if (!h['x-hd-signature']) return new Response(JSON.stringify({ sign_this: 'path\nwallet: <your wallet>\ntime: <ISO timestamp>' }), { status: 401 });
      return new Response(JSON.stringify({ ok: true, binding: {} }), { status: 201 });
    }) as any;
    const r = await bindAgent({ wallet: WALLET, agentId: AGENT, agentKey: 'ts_live_k', sign: async () => '0x' + '11'.repeat(65) });
    expect(r.ok).toBe(true);
    const claim = calls.find((c) => (c.init?.headers as Record<string, string> | undefined)?.['x-hd-signature']);
    expect((claim!.init!.headers as Record<string, string>)['x-agent-key']).toBe('ts_live_k');
    for (const c of calls) expect(String(c.init?.body ?? '')).not.toContain('ts_live_k');
  });

  it('explains the engine\'s new refusals in plain words', () => {
    const { explainBindError } = jest.requireActual('../lib/human-bind');
    for (const reason of ['agent_key_required', 'agent_key_mismatch', 'signature_not_checked']) {
      expect(explainBindError(reason)).not.toBe('That did not work, and the engine did not say why. Try again in a moment.');
    }
  });
});
