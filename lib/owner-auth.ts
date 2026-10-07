/**
 * Owner approval: the owner's wallet signs before an owned agent is given MORE power.
 *
 * The engine (services/owner-authorization.ts) refuses, for an agent someone has claimed, any
 * grant beyond read-only, any new API key, and any stake withdrawal unless the request carries
 * `owner_authorization` signed by that owner. This module produces it.
 *
 * THE SHAPE COMES FROM THE ENGINE. `GET /api/v1/owner-authorization` serves the EIP-712 domain
 * and types from the code that verifies them, the same reasoning as the bind statement: if the two
 * ever drift, the failure is a rejected signature, not a wrong prompt shown to someone deciding.
 *
 * THE FINGERPRINT IS COMPUTED HERE, and must match the engine's byte for byte: keccak256 of the
 * canonical JSON of the exact settings. Both repos pin the same test vector
 * (tests/owner-auth.test.ts here, tests/owner-authorization.test.ts in repid-engine).
 */
import { hexlify, keccak256, randomBytes, toUtf8Bytes } from 'ethers';
import { ensureBaseSepolia, type Eip1193 } from './agent-spend-client';

export type OwnerAction = 'grant.mint' | 'keys.create' | 'stake.withdraw';

export type OwnerAuthorization = { signature: string; nonce: string; expires_at: number };

type Shape = {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primary_type: string;
  max_lifetime_seconds: number;
};

/** Object keys sorted at every depth, arrays in order, no whitespace. Same as the engine's. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}

export function paramsHash(params: unknown): string {
  return keccak256(toUtf8Bytes(canonicalJson(params)));
}

/** The settings an owner approves for a grant — the engine builds the identical object. */
export function grantApprovalParams(g: {
  grantor_agent_id: string;
  grantee_agent_id: string;
  grant_class: string;
  capabilities: string[];
  caveats?: unknown;
  ttl_seconds: number;
  role?: unknown;
  audit_for?: unknown;
  parent_grant_id?: unknown;
}) {
  return {
    grantor_agent_id: g.grantor_agent_id,
    grantee_agent_id: g.grantee_agent_id,
    grant_class: g.grant_class,
    capabilities: [...g.capabilities].sort(),
    caveats: g.caveats ?? [],
    ttl_seconds: g.ttl_seconds,
    role: g.role ?? null,
    audit_for: g.audit_for ?? null,
    parent_grant_id: g.parent_grant_id ?? null,
  };
}

export async function fetchOwnerAuthShape(engine: string): Promise<Shape | null> {
  try {
    const res = await fetch(`${engine}/api/v1/owner-authorization`);
    if (!res.ok) return null;
    const s = (await res.json()) as Partial<Shape>;
    return s.domain && s.types && s.primary_type && s.max_lifetime_seconds ? (s as Shape) : null;
  } catch {
    return null;
  }
}

/**
 * Ask the owner's wallet to approve one action. Switches the wallet to Base Sepolia first: the
 * signed domain names chain 84532, and wallets refuse typed data for a chain they are not on.
 * Throws with a plain sentence on any failure; nothing is sent to the engine from here.
 */
export async function signOwnerAuthorization(
  eth: Eip1193,
  owner: string,
  input: { engine: string; subject: string; action: OwnerAction; params: unknown; ttlSeconds?: number; nowS?: number },
): Promise<OwnerAuthorization> {
  const shape = await fetchOwnerAuthShape(input.engine);
  if (!shape) throw new Error('Could not reach the engine for what to sign. Nothing was signed.');
  const ttl = Math.min(input.ttlSeconds ?? 300, shape.max_lifetime_seconds);
  const expires_at = (input.nowS ?? Math.floor(Date.now() / 1000)) + ttl;
  const nonce = hexlify(randomBytes(32));
  await ensureBaseSepolia(eth);
  const typed = {
    types: { EIP712Domain: domainFields(shape.domain), ...shape.types },
    domain: shape.domain,
    primaryType: shape.primary_type,
    message: { subject: input.subject, action: input.action, params: paramsHash(input.params), nonce, expiresAt: expires_at },
  };
  const signature = (await eth.request({ method: 'eth_signTypedData_v4', params: [owner, JSON.stringify(typed)] })) as string;
  return { signature, nonce, expires_at };
}

/** EIP712Domain must list exactly the fields present, in the standard order. */
function domainFields(domain: Record<string, unknown>) {
  const order: Array<[string, string]> = [
    ['name', 'string'],
    ['version', 'string'],
    ['chainId', 'uint256'],
    ['verifyingContract', 'address'],
    ['salt', 'bytes32'],
  ];
  return order.filter(([k]) => domain[k] !== undefined).map(([name, type]) => ({ name, type }));
}
