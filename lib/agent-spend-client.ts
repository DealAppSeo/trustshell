/**
 * Let an agent spend, capped on-chain (step d, Sean 2026-10-07). Testnet only: Base Sepolia.
 *
 * Two different hands, on purpose:
 *   - the CAP is set by the person, in their own wallet: `USDC.approve(agentWallet, N)`. This
 *     module builds that transaction and hands it to the wallet; it never holds the person's key.
 *   - the SPEND is made by the agent, through repid-engine's POST /agents/:id/spend with the
 *     agent's own API key. The engine signs `transferFrom` with the agent's key and refuses
 *     anything over the cap before signing; the USDC contract refuses it again if it got through.
 *
 * Setting the cap to 0 stops the agent at once, whatever else is running.
 */
import { Interface, getAddress, isAddress, parseUnits } from 'ethers';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_HEX = '0x14a34';
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';
export const BASESCAN_ADDRESS = 'https://sepolia.basescan.org/address/';

const ERC20 = new Interface(['function approve(address spender, uint256 value) returns (bool)']);

/** Same rule the engine applies: positive, plain digits, at most 6 decimals. */
export function parseUsdcInput(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  return parseUnits(t, 6);
}

export type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/** The transaction the person's wallet sends to set the cap. `amount` may be 0n: that is "stop". */
export function approveTx(from: string, agentWallet: string, amount: bigint) {
  if (!isAddress(from) || !isAddress(agentWallet)) throw new Error('not an address');
  return { from: getAddress(from), to: USDC_BASE_SEPOLIA, data: ERC20.encodeFunctionData('approve', [getAddress(agentWallet), amount]) };
}

/** Make sure the wallet is on Base Sepolia, asking it to switch if not. Throws with a plain reason. */
export async function ensureBaseSepolia(eth: Eip1193): Promise<void> {
  const id = String(await eth.request({ method: 'eth_chainId' }));
  if (parseInt(id, 16) === BASE_SEPOLIA_CHAIN_ID) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA_HEX }] });
  } catch {
    throw new Error('Your wallet is not on Base Sepolia, and it did not switch. Switch it to Base Sepolia (test network) and try again.');
  }
}

/** Send the cap transaction from the person's wallet and wait for it to be mined (up to ~90s). */
export async function setCap(eth: Eip1193, from: string, agentWallet: string, amount: bigint): Promise<{ hash: string; mined: boolean; ok: boolean | null }> {
  await ensureBaseSepolia(eth);
  const hash = String(await eth.request({ method: 'eth_sendTransaction', params: [approveTx(from, agentWallet, amount)] }));
  for (let i = 0; i < 45; i++) {
    const r = (await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as { status?: string } | null;
    if (r) return { hash, mined: true, ok: r.status === '0x1' };
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { hash, mined: false, ok: null };
}

export type SpendReply = {
  ok: boolean;
  dry_run?: boolean;
  would_send?: boolean;
  code?: string;
  error?: string;
  agent_wallet?: string | null;
  reads?: { cap_usdc: string; owner_balance_usdc: string; agent_eth: string; chain_id: number };
  tx_hash?: string;
  basescan_url?: string;
  amount_usdc?: string;
  cap_before_usdc?: string;
  cap_after_usdc?: string | null;
};

/** Ask the engine, as the agent. `dryRun` signs nothing. Network failure is reported, never a pass. */
export async function askSpend(
  engine: string,
  agent: { id: string; apiKey: string },
  body: { owner: string; to: string; amountUsdc: string; dryRun: boolean },
): Promise<SpendReply> {
  try {
    const res = await fetch(`${engine}/api/v1/agents/${encodeURIComponent(agent.id)}/spend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': agent.apiKey },
      body: JSON.stringify({ owner_address: body.owner, to_address: body.to, amount_usdc: body.amountUsdc, dry_run: body.dryRun }),
    });
    const data = (await res.json().catch(() => null)) as SpendReply | null;
    if (!data) return { ok: false, code: 'unreadable', error: `The engine answered ${res.status} with nothing readable. Nothing was sent.` };
    return data;
  } catch {
    return { ok: false, code: 'unreachable', error: 'Could not reach the engine. Not checked, and nothing was sent.' };
  }
}
