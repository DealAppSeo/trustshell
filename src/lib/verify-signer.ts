/**
 * Signer-aware verification (LOOP T6, board #63).
 *
 * The ERC-8004 ReputationRegistry is PERMISSIONLESS: anyone may post a `tag1=hyperdag_repid` row
 * against any agent (board #63 item 2). Verification is keyless — so "check the signer" is the real
 * safety step. Two of OUR addresses post that tag today: a WRITER and an ATTESTOR (correction row 81);
 * both are expected, both are ours. A verifier that filters to the writer alone SILENTLY DROPS the
 * attestor's rows; one that accepts everything accepts a stranger. This helper does neither: it
 * labels EVERY signer against an allowlist and RETURNS the unknowns FLAGGED — it never drops a row.
 *
 * It recommends no policy. It presents both signers and lets the caller decide.
 */

/** One entry in the signer allowlist — an address and the role it plays for our engine. */
export interface SignerEntry {
  address: string;
  role: string;
}

/**
 * DEFAULT allowlist, shipped as DATA (not baked into logic). Changing who counts as a known signer
 * is a config edit to these entries — it does not require a code change (see `classifySigners`, which
 * takes the allowlist as a parameter). The two addresses are the engine's writer and attestor
 * (board #63 item 2 + correction row 81); both post `tag1=hyperdag_repid` and are expected.
 */
export const HYPERDAG_REPID_SIGNERS: readonly SignerEntry[] = [
  { address: '0xb24268884472E7613aA58D38C8813f7Af1667382', role: 'writer' },
  { address: '0xf6eE1768868c3266868edcA78bC41C50309cb22A', role: 'attestor' },
];

/** A per-signer verdict. `unknown` signers are RETURNED (never dropped) with `role: null`. */
export interface SignerVerdict {
  address: string;
  status: 'in-allowlist' | 'unknown';
  /** The allowlisted role (e.g. 'writer'/'attestor') when in-allowlist; `null` when unknown. */
  role: string | null;
}

/**
 * Label every signer against the allowlist. NEVER drops: an address not in the allowlist is returned
 * with `status: 'unknown'`, not discarded. Address comparison is case-insensitive. Input order and
 * length are preserved, so `result.length === signers.length` always holds. Pure — no network, keyless.
 */
export function classifySigners(
  signers: ReadonlyArray<string | { address: string }>,
  allowlist: readonly SignerEntry[] = HYPERDAG_REPID_SIGNERS,
): SignerVerdict[] {
  const roleByAddr = new Map(allowlist.map((e) => [e.address.toLowerCase(), e.role]));
  return signers.map((s) => {
    const address = typeof s === 'string' ? s : s.address;
    const role = roleByAddr.get(String(address).toLowerCase()) ?? null;
    return { address, status: role ? 'in-allowlist' : 'unknown', role };
  });
}

export interface VerifySignerResult {
  /** The agent's ERC-8004 token id whose feedback signers were read. */
  tokenId: string;
  /** Every client that has posted feedback, labelled. Unknown signers are present and flagged. */
  signers: SignerVerdict[];
  /** Present only if a step could not complete (e.g. the on-chain read failed). Never a silent empty. */
  reasons: Record<string, string>;
}

/** The canonical ERC-8004 ReputationRegistry on Base Sepolia (chain 84532). */
export const REPUTATION_REGISTRY_BASE_SEPOLIA = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const DEFAULT_RPC = 'https://sepolia.base.org';

/**
 * KEYLESS read: fetch the addresses that have posted feedback for `tokenId` on the ReputationRegistry
 * (`getClients`), via a public RPC — no API key. Lazily imports `ethers` so consumers that never call
 * this don't pay for it. Exposed as the default fetcher; `verifySigner` accepts an override for tests.
 */
export async function onchainFeedbackClients(
  tokenId: string,
  opts: { rpcUrl?: string; reputationRegistry?: string } = {},
): Promise<string[]> {
  const { JsonRpcProvider, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(opts.rpcUrl ?? DEFAULT_RPC);
  const abi = ['function getClients(uint256 agentId) view returns (address[])'];
  const registry = new Contract(opts.reputationRegistry ?? REPUTATION_REGISTRY_BASE_SEPOLIA, abi, provider);
  const clients: string[] = await registry.getClients(BigInt(tokenId));
  return clients;
}

/**
 * Verify the signers behind an agent's on-chain reputation feedback. KEYLESS: reads
 * `getClients(tokenId)` from the permissionless registry (no API key needed — the 90-day gate), then
 * labels each address against the allowlist. Unknown signers are RETURNED AND FLAGGED, never dropped.
 * If the read fails, that is recorded in `reasons` — the result is never a silent empty.
 *
 * `fetchClients` is injectable so callers/tests can supply the signer list without a network round-trip;
 * it defaults to the keyless on-chain reader.
 */
export async function verifySigner(params: {
  tokenId: string;
  allowlist?: readonly SignerEntry[];
  rpcUrl?: string;
  reputationRegistry?: string;
  fetchClients?: (tokenId: string) => Promise<string[]>;
}): Promise<VerifySignerResult> {
  const reasons: Record<string, string> = {};
  const fetchClients =
    params.fetchClients ??
    ((id: string) =>
      onchainFeedbackClients(id, { rpcUrl: params.rpcUrl, reputationRegistry: params.reputationRegistry }));

  let clients: string[] = [];
  try {
    clients = await fetchClients(params.tokenId);
  } catch (e) {
    reasons.fetch = `could not read on-chain feedback signers: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { tokenId: params.tokenId, signers: classifySigners(clients, params.allowlist), reasons };
}
