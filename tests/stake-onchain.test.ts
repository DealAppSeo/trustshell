/**
 * Real, on-chain testnet staking — the destination, the on-chain confirmation, and the
 * owner-signs-and-sends property. No flag, no escrow env: Base Sepolia (84532) IS the test. No
 * wallet or live chain is reachable from here, so these pin:
 *
 *   1. DESTINATION = the agent's EXISTING session address, READ from the engine (a dry-run spend
 *      probe), never invented. Missing/unbound/unreadable → a named blocker or NOT_CHECKED, never
 *      a default or a guess.
 *   2. A deposit whose tx is not confirmed reads NOT_CHECKED (unmined/unreadable) or FAILED
 *      (reverted / no transfer to the session address) — never "staked". VERIFIED needs a real
 *      USDC transfer into the session address summing to >= the staked amount.
 *   3. The stake is OWNER-SIGNED AND OWNER-SENT: the tx is built FROM the funder for the WALLET to
 *      send (eth_sendTransaction) — there is no private key and no server signer on this path.
 *   4. MAINNET IS OFF: the only token is Base Sepolia test USDC, the only chain is 84532; every
 *      other chain id (including mainnets) and every other token is refused.
 *   5. Limit-to-zero still refuses the next spend (lib/agent-spend-client is not regressed).
 *
 * The live legs (a real wallet, a mined Base Sepolia tx, the engine's dry-run) are
 * NOT_CHECKED-against-live here; a browser click-through would exercise them with a stubbed engine.
 */
import { Interface, getAddress } from 'ethers';
import {
  BASE_SEPOLIA_CHAIN_ID,
  USDC_BASE_SEPOLIA,
  isTestnetUsdc,
  assertBaseSepolia,
  fetchAgentSessionAddress,
  buildStakeTransferTx,
  confirmStakeReceipt,
  sendStakeTransfer,
  type RawReceipt,
  type Eip1193,
} from '../lib/stake-onchain';
import { zeroCapRefusal } from '../lib/agent-spend-client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = '0x1111111111111111111111111111111111111111';
const SESSION = '0x2222222222222222222222222222222222222222'; // the agent's session address
// Base mainnet USDC — a token this path must REFUSE. Named here only to prove the refusal; the
// product code contains no mainnet token at all.
const MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AGENT = '00000000-0000-0000-0000-000000000000';
const KEY = 'ts_live_abc';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});
const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

// --- 1. the destination is the agent's session address, read not invented ------------------

describe('1. the destination is the agent’s existing session address, read from the engine', () => {
  it('returns the session address the engine reports for a bound agent', async () => {
    global.fetch = (async () => json(200, { ok: true, dry_run: true, would_send: true, agent_wallet: SESSION })) as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: KEY, ownerWallet: OWNER });
    expect(s).toEqual({ ok: true, address: getAddress(SESSION) });
  });

  it('is a NOT_CHECKED (not a guess) when the engine cannot be reached', async () => {
    global.fetch = (async () => { throw new TypeError('down'); }) as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: KEY, ownerWallet: OWNER });
    expect(s).toMatchObject({ ok: false, kind: 'not_checked' });
  });

  it('is a BLOCKER when the agent is unbound (no session address to fund)', async () => {
    global.fetch = (async () => json(200, { ok: false, dry_run: true, code: 'not_bound', error: 'not bound' })) as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: KEY, ownerWallet: OWNER });
    expect(s).toMatchObject({ ok: false, kind: 'blocker' });
    if (!s.ok) expect(s.reason).toMatch(/not bound/i);
  });

  it('is a BLOCKER (never a guess) when the reply carries no session address', async () => {
    global.fetch = (async () => json(200, { ok: false, dry_run: true, code: 'no_agent_wallet', error: 'no wallet on record' })) as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: KEY, ownerWallet: OWNER });
    expect(s).toMatchObject({ ok: false, kind: 'blocker' });
  });

  it('is a BLOCKER when this browser has no key for the agent — nothing is invented', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: undefined, ownerWallet: OWNER });
    expect(s).toMatchObject({ ok: false, kind: 'blocker' });
    expect(f).not.toHaveBeenCalled(); // refuses before any network
  });

  it('is a BLOCKER when there is no bound owner wallet to probe with', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const s = await fetchAgentSessionAddress({ engine: 'https://e.test', agentId: AGENT, apiKey: KEY, ownerWallet: '' });
    expect(s).toMatchObject({ ok: false, kind: 'blocker' });
    expect(f).not.toHaveBeenCalled();
  });
});

// --- mainnet-off / chain + token gates ------------------------------------------------------

describe('mainnet is off: only chain 84532 and only Base Sepolia test USDC', () => {
  it('the chain gate refuses every non-84532 id, including mainnets and unread', () => {
    expect(assertBaseSepolia(1)).toMatch(/Refused/);        // ethereum mainnet
    expect(assertBaseSepolia(8453)).toMatch(/Refused/);     // base mainnet
    expect(assertBaseSepolia(11155111)).toMatch(/Refused/); // sepolia L1
    expect(assertBaseSepolia(null)).toMatch(/Not checked/); // unread = refuse, never allow
    expect(assertBaseSepolia(undefined)).toMatch(/Not checked/);
    expect(assertBaseSepolia(BASE_SEPOLIA_CHAIN_ID)).toBeNull();
  });

  it('isTestnetUsdc accepts only the Base Sepolia test USDC', () => {
    expect(isTestnetUsdc(USDC_BASE_SEPOLIA)).toBe(true);
    expect(isTestnetUsdc(USDC_BASE_SEPOLIA.toLowerCase())).toBe(true);
    expect(isTestnetUsdc(MAINNET_USDC)).toBe(false);
    expect(isTestnetUsdc(null)).toBe(false);
  });
});

// --- 2. the on-chain confirmation (DB row is not the test) ----------------------------------

const TRANSFER = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
function transferLog(token: string, from: string, to: string, value: bigint) {
  const { topics, data } = TRANSFER.encodeEventLog('Transfer', [from, to, value]);
  return { address: token, topics: [...topics], data };
}
const AMT = BigInt(100000000); // 100 USDC (6dp)

describe('2. a deposit is staked only when a CONFIRMED tx moved USDC into the session address', () => {
  it('a missing/unmined receipt is NOT_CHECKED — never staked', () => {
    expect(confirmStakeReceipt(null, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'NOT_CHECKED' });
    expect(confirmStakeReceipt(undefined, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'NOT_CHECKED' });
    expect(confirmStakeReceipt({ status: null } as RawReceipt, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'NOT_CHECKED' });
  });

  it('a reverted tx is FAILED — nothing moved, nothing staked', () => {
    expect(confirmStakeReceipt({ status: '0x0', logs: [] }, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
    expect(confirmStakeReceipt({ status: 0, logs: [] }, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
  });

  it('a success status with no USDC transfer to the session address is FAILED, not a pass', () => {
    expect(confirmStakeReceipt({ status: '0x1', logs: [] }, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
  });

  it('a transfer of a DIFFERENT token into the session address does not count', () => {
    const r: RawReceipt = { status: '0x1', logs: [transferLog(MAINNET_USDC, OWNER, SESSION, AMT)] };
    expect(confirmStakeReceipt(r, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
  });

  it('a USDC transfer to SOMEWHERE ELSE does not count', () => {
    const elsewhere = '0x3333333333333333333333333333333333333333';
    const r: RawReceipt = { status: '0x1', logs: [transferLog(USDC_BASE_SEPOLIA, OWNER, elsewhere, AMT)] };
    expect(confirmStakeReceipt(r, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
  });

  it('a transfer SHORT of the staked amount is FAILED', () => {
    const r: RawReceipt = { status: '0x1', logs: [transferLog(USDC_BASE_SEPOLIA, OWNER, SESSION, AMT - BigInt(1))] };
    expect(confirmStakeReceipt(r, { destination: SESSION, amountRaw: AMT })).toMatchObject({ state: 'FAILED' });
  });

  it('a confirmed USDC transfer into the session address of >= the amount is VERIFIED', () => {
    const r: RawReceipt = { status: '0x1', logs: [transferLog(USDC_BASE_SEPOLIA, OWNER, SESSION, AMT)] };
    const c = confirmStakeReceipt(r, { destination: SESSION, amountRaw: AMT });
    expect(c.state).toBe('VERIFIED');
    if (c.state === 'VERIFIED') expect(c.observed).toBe(AMT.toString());
  });
});

// --- 3. owner builds, signs and sends — no server key -------------------------------------

describe('3. the stake tx is built FROM the funder for the WALLET to send, with no server key', () => {
  it('builds USDC.transfer(sessionAddress, amount) to the test-USDC token, from the funder', () => {
    const tx = buildStakeTransferTx(OWNER, SESSION, AMT);
    expect(getAddress(tx.from)).toBe(getAddress(OWNER));
    expect(getAddress(tx.to)).toBe(getAddress(USDC_BASE_SEPOLIA)); // the token, never a mainnet one
    const decoded = new Interface(['function transfer(address to, uint256 value)']).decodeFunctionData('transfer', tx.data);
    expect(getAddress(decoded[0])).toBe(getAddress(SESSION)); // pays the session address
    expect(decoded[1]).toBe(AMT);
    expect(tx.data.startsWith('0xa9059cbb')).toBe(true); // transfer(address,uint256) selector
  });

  it('refuses to build on a bad session address or a non-positive amount', () => {
    expect(() => buildStakeTransferTx(OWNER, 'nope', AMT)).toThrow(/session address/i);
    expect(() => buildStakeTransferTx(OWNER, SESSION, BigInt(0))).toThrow(/positive/i);
  });

  it('sends via the wallet (eth_sendTransaction) and confirms the mined receipt', async () => {
    const seen: string[] = [];
    const eth: Eip1193 = {
      request: async ({ method, params }) => {
        seen.push(method);
        if (method === 'eth_chainId') return '0x14a34'; // already Base Sepolia
        if (method === 'eth_sendTransaction') {
          const tx = (params as any[])[0];
          expect(getAddress(tx.to)).toBe(getAddress(USDC_BASE_SEPOLIA)); // moving the test token only
          return '0x' + 'ab'.repeat(32);
        }
        if (method === 'eth_getTransactionReceipt') {
          return { status: '0x1', logs: [transferLog(USDC_BASE_SEPOLIA, OWNER, SESSION, AMT)] };
        }
        throw new Error(`unexpected ${method}`);
      },
    };
    const res = await sendStakeTransfer(eth, OWNER, SESSION, AMT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(confirmStakeReceipt(res.receipt, { destination: SESSION, amountRaw: AMT }).state).toBe('VERIFIED');
    }
    expect(seen).toContain('eth_sendTransaction'); // the wallet signed+sent; no key read here
  });

  it('a declined wallet sends nothing and never polls a receipt', async () => {
    const seen: string[] = [];
    const eth: Eip1193 = {
      request: async ({ method }) => {
        seen.push(method);
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'eth_sendTransaction') {
          const e = new Error('user rejected') as Error & { code?: number };
          e.code = 4001;
          throw e;
        }
        throw new Error(`unexpected ${method}`);
      },
    };
    const res = await sendStakeTransfer(eth, OWNER, SESSION, AMT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/declined/i);
    expect(seen).not.toContain('eth_getTransactionReceipt');
  });

  it('a wallet on the wrong chain that will not switch sends nothing', async () => {
    const seen: string[] = [];
    const eth: Eip1193 = {
      request: async ({ method }) => {
        seen.push(method);
        if (method === 'eth_chainId') return '0x1'; // ethereum mainnet
        if (method === 'wallet_switchEthereumChain') throw new Error('no');
        throw new Error(`unexpected ${method}`);
      },
    };
    const res = await sendStakeTransfer(eth, OWNER, SESSION, AMT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Base Sepolia/i);
    expect(seen).not.toContain('eth_sendTransaction');
  });

  it('the on-chain stake module holds no private key and no server signer', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/stake-onchain.ts'), 'utf8');
    expect(src).not.toMatch(/privateKey|PRIVATE_KEY|new Wallet\(|signTransaction/);
    expect(src).toContain("method: 'eth_sendTransaction'"); // the wallet's send, not ours
  });
});

// --- 4. no flag + limit-to-zero not regressed -----------------------------------------------

describe('4. no REAL_STAKING flag on this path, and limit-to-zero still refuses the next spend', () => {
  it('the on-chain stake module names no REAL_STAKING / staking flag', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/stake-onchain.ts'), 'utf8');
    expect(src).not.toMatch(/\b(REAL_STAKING|SAYS_STAKE_LIVE|NEXT_PUBLIC_REAL_STAKING)\b/);
  });

  it('zeroCapRefusal still refuses a cap of 0 and an unreadable cap, and passes a positive one', () => {
    expect(zeroCapRefusal('0')).toMatch(/cap is 0|stopped/i);
    expect(zeroCapRefusal(null)).toMatch(/not checked/i);
    expect(zeroCapRefusal(undefined)).toMatch(/not checked/i);
    expect(zeroCapRefusal('5')).toBeNull();
  });
});

// --- 5. the page wiring: session destination, send → confirm, never staked without VERIFIED --

describe('5. /stake reads the session address and never shows staked without a confirmed tx', () => {
  const src = readFileSync(join(__dirname, '..', 'app/stake/page.tsx'), 'utf8').replace(/\r/g, '');

  it('reads the session address from the engine and never hardcodes an address', () => {
    expect(src).toContain('fetchAgentSessionAddress');
    expect(src).toContain('session.address'); // the real send targets the read address
    expect(src).not.toMatch(/0x[0-9a-fA-F]{40}/); // no 20-byte address literal embedded in the page
  });

  it('has no REAL_STAKING / staking flag gate on this path', () => {
    expect(src).not.toMatch(/\b(REAL_STAKING|SAYS_STAKE_LIVE|NEXT_PUBLIC_REAL_STAKING)\b/);
  });

  it('sends on-chain, then confirms the receipt, and only shows staked on a VERIFIED confirmation', () => {
    const iSend = src.indexOf('sendStakeTransfer(');
    const iConfirm = src.indexOf('confirmStakeReceipt(');
    const iConfirmedSuccess = src.indexOf('Confirmed on-chain');
    expect(iSend).toBeGreaterThan(-1);
    expect(iConfirm).toBeGreaterThan(iSend);
    expect(src).toContain("if (conf.state !== 'VERIFIED')");
    // the success is set only after the VERIFIED check
    expect(iConfirmedSuccess).toBeGreaterThan(iConfirm);
  });

  it('offers the real send only when a session address was read; otherwise names the blocker', () => {
    expect(src).toContain('sessionReady');
    expect(src).toContain('data-testid="stake-real-unavailable"');
  });
});
