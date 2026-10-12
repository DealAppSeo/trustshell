/**
 * The faucet screen's reads. TrustShell does NOT dispense tokens, ever: a public faucet does. This
 * module only (1) filters the engine's faucet list down to links that are safe to print, and (2)
 * reads a wallet's public balance back through the engine, so a stranger can see whether the faucet
 * worked before they try to stake.
 *
 * Both reads come from the engine (`GET /api/v1/faucet/info`, `GET /api/v1/faucet/balance`) and
 * nothing is remembered here: a copied faucet list goes stale silently and turns into a dead link at
 * the moment somebody needs funds, so a failed read says NOT_CHECKED and never falls back to a list.
 *
 * Three outcomes, never two. A balance that could not be read is NOT_CHECKED. It is never printed as
 * 0, because "0 ETH" says the faucet did not work and an unread balance says nothing at all.
 */
import { REPID_ENGINE_URL, type FaucetInfo } from './repid-engine';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^\d{1,30}(\.\d{1,30})?$/;

export type FaucetLink = { name: string; url: string; assets: string[]; note: string };

/** The engine's faucet list, keeping only https links with a real host. Anything else is dropped. */
export function safeFaucetLinks(info: Pick<FaucetInfo, 'faucets'> | null): FaucetLink[] {
  if (!info || !Array.isArray(info.faucets)) return [];
  const out: FaucetLink[] = [];
  for (const f of info.faucets) {
    if (!f || typeof f.name !== 'string' || typeof f.url !== 'string') continue;
    let u: URL;
    try {
      u = new URL(f.url);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) continue;
    const assets = Array.isArray(f.assets) ? f.assets.filter((a): a is string => typeof a === 'string').slice(0, 4) : [];
    out.push({ name: f.name.slice(0, 80), url: u.toString(), assets, note: typeof f.note === 'string' ? f.note.slice(0, 200) : '' });
  }
  return out;
}

export type FaucetBalance =
  | {
      state: 'READ';
      address: string;
      eth: string;
      usdc: string;
      enoughToStake: boolean;
      enoughForGas: boolean;
      minEth: string | null;
      nextStep: string | null;
    }
  | { state: 'NOT_CHECKED'; reason: 'bad_address' | 'no_engine' | 'unreachable' | 'rejected' | 'bad_response' | 'wrong_network' };

const amount = (v: unknown): string | null => {
  const s = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? String(v) : typeof v === 'string' ? v.trim() : '';
  return DECIMAL.test(s) ? s : null;
};

/** Read the engine's answer. PURE. Null means the body was not a balance, which is NOT_CHECKED. */
export function parseFaucetBalance(body: unknown, asked: string): FaucetBalance {
  if (!body || typeof body !== 'object') return { state: 'NOT_CHECKED', reason: 'bad_response' };
  const b = body as Record<string, unknown>;
  if (b.chain_id !== BASE_SEPOLIA_CHAIN_ID) return { state: 'NOT_CHECKED', reason: 'wrong_network' };
  const eth = amount(b.eth_balance);
  const usdc = amount(b.usdc_balance);
  if (eth === null || usdc === null || typeof b.enough_to_stake !== 'boolean' || typeof b.enough_for_gas !== 'boolean') {
    return { state: 'NOT_CHECKED', reason: 'bad_response' };
  }
  // The balance must be about the address that was asked about.
  if (typeof b.address !== 'string' || b.address.toLowerCase() !== asked.toLowerCase()) {
    return { state: 'NOT_CHECKED', reason: 'bad_response' };
  }
  return {
    state: 'READ',
    address: asked,
    eth,
    usdc,
    enoughToStake: b.enough_to_stake,
    enoughForGas: b.enough_for_gas,
    minEth: amount(b.staking_min_eth),
    nextStep: typeof b.next_step === 'string' ? b.next_step.slice(0, 300) : null,
  };
}

export async function fetchFaucetBalance(
  address: string,
  opts: { base?: string; fetchImpl?: typeof fetch } = {},
): Promise<FaucetBalance> {
  const a = address.trim();
  if (!EVM_ADDRESS.test(a)) return { state: 'NOT_CHECKED', reason: 'bad_address' };
  const base = (opts.base ?? REPID_ENGINE_URL).replace(/\/+$/, '');
  if (!base) return { state: 'NOT_CHECKED', reason: 'no_engine' };
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}/api/v1/faucet/balance?address=${encodeURIComponent(a)}`, { cache: 'no-store' });
  } catch {
    return { state: 'NOT_CHECKED', reason: 'unreachable' };
  }
  if (res.status === 400) return { state: 'NOT_CHECKED', reason: 'rejected' };
  if (!res.ok) return { state: 'NOT_CHECKED', reason: 'unreachable' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: 'NOT_CHECKED', reason: 'bad_response' };
  }
  return parseFaucetBalance(body, a);
}

export const BALANCE_NOT_CHECKED_WHY: Record<Extract<FaucetBalance, { state: 'NOT_CHECKED' }>['reason'], string> = {
  bad_address: 'That is not a wallet address. It starts with 0x and has 40 more characters.',
  no_engine: 'No engine is configured for this deploy, so no balance can be read.',
  unreachable: 'The engine could not be reached just now. This is not a balance of zero.',
  rejected: 'The engine did not accept that address.',
  bad_response: 'The engine answered with something this page could not read. This is not a balance of zero.',
  wrong_network: 'The engine answered about a different network than Base Sepolia, so it is not shown.',
};
