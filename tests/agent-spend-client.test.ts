/**
 * Step (d): the person caps their agent's spending in their own wallet; the agent spends through
 * the engine. These pin the transaction the wallet is asked to send (USDC.approve to the agent's
 * own wallet, on Base Sepolia), that "stop" is a real approve(0), and that an unreachable engine is
 * reported as not checked rather than read as a pass.
 */
import { Interface } from 'ethers';
import {
  approveTx,
  askSpend,
  BASE_SEPOLIA_HEX,
  ensureBaseSepolia,
  parseUsdcInput,
  setCap,
  USDC_BASE_SEPOLIA,
  type Eip1193,
} from '../lib/agent-spend-client';

const OWNER = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const iface = new Interface(['function approve(address spender, uint256 value) returns (bool)']);

describe('parseUsdcInput', () => {
  it.each([['5', BigInt(5_000_000)], ['2.50', BigInt(2_500_000)], ['0.000001', BigInt(1)]])('%s', (s, v) => expect(parseUsdcInput(s)).toBe(v));
  it.each(['', 'abc', '-1', '1.0000001', '1e3'])('refuses %s', (s) => expect(parseUsdcInput(s)).toBeNull());
});

describe('approveTx', () => {
  it('is approve(agentWallet, amount) on Base Sepolia USDC, from the person', () => {
    const tx = approveTx(OWNER, AGENT, BigInt(5_000_000));
    expect(tx.to).toBe(USDC_BASE_SEPOLIA);
    expect(tx.from.toLowerCase()).toBe(OWNER);
    const [spender, value] = iface.decodeFunctionData('approve', tx.data);
    expect(String(spender).toLowerCase()).toBe(AGENT);
    expect(value).toBe(BigInt(5_000_000));
  });
  it('"stop" is a real approve of 0', () => {
    const [, value] = iface.decodeFunctionData('approve', approveTx(OWNER, AGENT, BigInt(0)).data);
    expect(value).toBe(BigInt(0));
  });
  it('refuses a malformed address', () => expect(() => approveTx(OWNER, '0x12', BigInt(1))).toThrow());
});

function fakeEth(opts: { chain?: string; switchFails?: boolean; receiptAfter?: number; status?: string } = {}) {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  let chain = opts.chain ?? BASE_SEPOLIA_HEX;
  let polls = 0;
  const eth: Eip1193 = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') {
        if (opts.switchFails) throw new Error('user rejected');
        chain = BASE_SEPOLIA_HEX;
        return null;
      }
      if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);
      if (method === 'eth_getTransactionReceipt') return ++polls > (opts.receiptAfter ?? 0) ? { status: opts.status ?? '0x1' } : null;
      throw new Error(`unexpected ${method}`);
    },
  };
  return { eth, calls };
}

describe('setCap', () => {
  it('sends approve from the person on Base Sepolia and reports the mined result', async () => {
    const { eth, calls } = fakeEth();
    const r = await setCap(eth, OWNER, AGENT, BigInt(3_000_000));
    expect(r).toEqual({ hash: '0x' + 'ab'.repeat(32), mined: true, ok: true });
    const sent = calls.find((c) => c.method === 'eth_sendTransaction')!.params![0] as { to: string; data: string };
    expect(sent.to).toBe(USDC_BASE_SEPOLIA);
    expect(iface.decodeFunctionData('approve', sent.data)[1]).toBe(BigInt(3_000_000));
  });
  it('asks the wallet to switch to Base Sepolia first when it is elsewhere', async () => {
    const { eth, calls } = fakeEth({ chain: '0x1' });
    await setCap(eth, OWNER, AGENT, BigInt(1));
    expect(calls.map((c) => c.method).slice(0, 3)).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'eth_sendTransaction']);
  });
  it('sends nothing if the wallet will not switch', async () => {
    const { eth, calls } = fakeEth({ chain: '0x1', switchFails: true });
    await expect(setCap(eth, OWNER, AGENT, BigInt(1))).rejects.toThrow(/not on Base Sepolia/);
    expect(calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });
  it('a reverted approve reads as rejected, not done', async () => {
    const { eth } = fakeEth({ status: '0x0' });
    expect((await setCap(eth, OWNER, AGENT, BigInt(1))).ok).toBe(false);
  });
  it('ensureBaseSepolia does nothing when already there', async () => {
    const { eth, calls } = fakeEth();
    await ensureBaseSepolia(eth);
    expect(calls.map((c) => c.method)).toEqual(['eth_chainId']);
  });
});

describe('askSpend', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  it('asks as the agent, with its own key', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    global.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ ok: true, dry_run: true, would_send: true }), { status: 200 });
    }) as any;
    const r = await askSpend('https://engine.test', { id: 'agent-1', apiKey: 'k1' }, { owner: OWNER, to: AGENT, amountUsdc: '1', dryRun: true });
    expect(r).toMatchObject({ ok: true, would_send: true });
    expect(seen!.url).toBe('https://engine.test/api/v1/agents/agent-1/spend');
    expect((seen!.init.headers as Record<string, string>)['x-api-key']).toBe('k1');
    expect(JSON.parse(String(seen!.init.body))).toEqual({ owner_address: OWNER, to_address: AGENT, amount_usdc: '1', dry_run: true });
  });
  it('an unreachable engine is not checked, never a pass', async () => {
    global.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as any;
    const r = await askSpend('https://engine.test', { id: 'a', apiKey: 'k' }, { owner: OWNER, to: AGENT, amountUsdc: '1', dryRun: true });
    expect(r).toMatchObject({ ok: false, code: 'unreachable' });
    expect(r.would_send).toBeUndefined();
  });
});
