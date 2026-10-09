/**
 * trustkeys-signer.ts — the CLIENT-SIDE signer for the TrustKeys reference tier.
 *
 * "NO KEY ON OUR DISK" (Sean, 2026-10-08). The owner's key never leaves the owner's box.
 * This module runs on THAT box (the browser wallet, or a Node script holding an ethers
 * Wallet). It builds the exact policy/job objects the repid-engine verifier expects, asks
 * the wallet to sign each with EIP-191 personal_sign, and POSTs only the signed
 * policy/job + their signatures. No private key is ever read, stored, logged, or sent —
 * the signer satisfies a one-method interface (`signMessage`) and nothing here can reach a key.
 *
 * THE CONTRACT WITH repid-engine (src/services/signed-job.ts, PR #1273). The verifier
 * recomputes `canonicalize(object)` from the received object and recovers the signer. So a
 * ONE-BYTE difference in `canonicalize` or `hashPayee` between the two repos makes every real
 * signature silently fail to verify. `canonicalize` and `hashPayee` here are therefore COPIED
 * VERBATIM from signed-job.ts — do not "improve" either. The pinned cross-repo golden vector
 * (tests/trustkeys-signer-golden.test.ts here; the matching vector in repid-engine's
 * tests/signed-job-verify.test.ts) is what catches drift before a user's signature does. Same
 * anti-drift pattern as lib/owner-auth.ts, which pins its own vector against the engine.
 *
 * THREE OUTCOMES, NEVER TWO (LESSONS / CLAUDE_RULES). `submitJob` reports `verified` only when
 * the verifier returns a 200 receipt, `refused` with the verifier's own reason for a definite
 * deny, and `could_not_check` when nobody looked — a network/parse failure OUR side, or the
 * verifier's own honest 503 `not_checked`. "Could not check" is never reported as verified.
 */
import { hexlify, id as keccakUtf8, isAddress, randomBytes } from 'ethers';

/** The one chain the whole product runs on. Policies and jobs are pinned to it. */
export const CHAIN_ID = 84532; // Base Sepolia

/**
 * A fresh random hex nonce. The verifier accepts any 0x-hex string and dedupes on
 * UNIQUE(owner, nonce), so 16 random bytes is ample — a repeat is astronomically unlikely and, if
 * it ever happened, would surface honestly as a `replay` refusal rather than a silent double-spend.
 */
export function randomNonce(bytes = 16): string {
  return hexlify(randomBytes(bytes));
}

// --- One deterministic canonicalizer — COPIED VERBATIM from repid-engine signed-job.ts -------
//
// Stable key order at every depth, no whitespace. The owner signs canonicalize(policy) and
// canonicalize(job); the verifier recomputes the same string from the received object and
// recovers the signer. Because `type` ('trustkeys-policy' vs 'trustkeys-job') is INSIDE the
// signed bytes, a policy signature cannot be replayed as a job signature. Tampering with any
// field changes the canonical string and breaks recovery. KEEP IDENTICAL to the engine.
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** Alias under the engine's own export name, so a reader grepping either repo lands here. */
export const canonicalJson = canonicalize;

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * The shared payee-hash primitive — COPIED VERBATIM from signed-job.ts: keccak256 of the
 * LOWERCASED payee address, hex. `ethers.id(s)` is keccak256(toUtf8Bytes(s)), so this hashes the
 * UTF-8 BYTES OF THE ADDRESS STRING (not the 20 address bytes) — that is the engine's definition
 * and it must match exactly. The server never receives a raw payee address; the client sends only
 * this hash, so a receipt records WHO was paid without storing the address.
 */
export function hashPayee(address: string): string {
  return keccakUtf8(address.toLowerCase());
}

// --- Types — the exact shapes the verifier validates ----------------------------------------

export interface Policy {
  v: number;
  type: 'trustkeys-policy';
  owner: string;
  chain_id: number;
  cap: string;
  token: string;
  payee_hashes: string[];
  expiry: number;
  policy_nonce: string;
}

export interface Job {
  v: number;
  type: 'trustkeys-job';
  owner: string;
  chain_id: number;
  action: string;
  cap: string;
  payee_hash: string;
  expiry: number;
  nonce: string;
}

/** The POST body the verifier reads at POST /api/v1/jobs/verify. */
export interface VerifyBody {
  policy: Policy;
  policy_signature: string;
  job: Job;
  job_signature: string;
}

/**
 * Anything that can sign a message — an ethers v6 Signer (Wallet, or a BrowserProvider signer)
 * satisfies this structurally. Typed to ONE method on purpose: the signer holds the key, this
 * module only ever hands it a string to sign and receives a signature back. There is no code path
 * here that could read, store, or transmit a private key.
 */
export interface MessageSigner {
  signMessage(message: string): Promise<string>;
}

const HEX = /^0x[0-9a-fA-F]+$/;

/** cap is a token smallest-unit INTEGER, carried as a string so large values keep precision. */
function capToString(cap: string | number | bigint): string {
  // BigInt throws on a float or a non-numeric string — fail fast here rather than let the
  // verifier reject a malformed cap after a signature prompt the user already approved.
  const n = typeof cap === 'bigint' ? cap : BigInt(cap);
  if (n < BigInt(0)) throw new Error('cap must be a non-negative integer (token smallest-unit)');
  return n.toString();
}

function requireAddress(label: string, addr: string): void {
  if (typeof addr !== 'string' || !isAddress(addr)) throw new Error(`${label} must be a valid address`);
}

function requireHex(label: string, s: string): void {
  if (typeof s !== 'string' || !HEX.test(s)) throw new Error(`${label} must be a 0x-hex string`);
}

function requireUnixInt(label: string, n: number): void {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
    throw new Error(`${label} must be a positive unix-seconds integer`);
}

// --- Builders — reproduce the engine's objects byte-for-byte --------------------------------

export interface BuildPolicyInput {
  owner: string;
  chainId?: number;
  cap: string | number | bigint;
  token: string;
  /** RAW payee addresses — hashed here into payee_hashes; the raw address never leaves the box. */
  payees: string[];
  expiry: number;
  policyNonce: string;
  /** Schema version; defaults to 1 (the engine's current `v`). */
  v?: number;
}

/**
 * Build the exact policy object the owner signs. owner is LOWERCASED (the engine compares owners
 * checksum-insensitively and the receipt stores the lowercased owner), cap is stringified, and
 * each raw payee address is replaced by its hash so no raw address is ever carried.
 */
export function buildPolicy(input: BuildPolicyInput): Policy {
  requireAddress('owner', input.owner);
  if (!Array.isArray(input.payees) || input.payees.length === 0) throw new Error('payees must be a non-empty array');
  input.payees.forEach((p, i) => requireAddress(`payees[${i}]`, p));
  requireHex('policyNonce', input.policyNonce);
  requireUnixInt('expiry', input.expiry);
  if (typeof input.token !== 'string' || !input.token) throw new Error('token is required');

  return {
    v: input.v ?? 1,
    type: 'trustkeys-policy',
    owner: input.owner.toLowerCase(),
    chain_id: input.chainId ?? CHAIN_ID,
    cap: capToString(input.cap),
    token: input.token,
    payee_hashes: input.payees.map(hashPayee),
    expiry: input.expiry,
    policy_nonce: input.policyNonce,
  };
}

export interface BuildJobInput {
  owner: string;
  chainId?: number;
  action: string;
  cap: string | number | bigint;
  /** The RAW payee address for this job — hashed here into payee_hash. */
  payee: string;
  expiry: number;
  nonce: string;
  v?: number;
}

/** Build the exact job object the owner signs. Same rules as buildPolicy, one payee. */
export function buildJob(input: BuildJobInput): Job {
  requireAddress('owner', input.owner);
  requireAddress('payee', input.payee);
  requireHex('nonce', input.nonce);
  requireUnixInt('expiry', input.expiry);
  if (typeof input.action !== 'string' || !input.action) throw new Error('action is required');

  return {
    v: input.v ?? 1,
    type: 'trustkeys-job',
    owner: input.owner.toLowerCase(),
    chain_id: input.chainId ?? CHAIN_ID,
    action: input.action,
    cap: capToString(input.cap),
    payee_hash: hashPayee(input.payee),
    expiry: input.expiry,
    nonce: input.nonce,
  };
}

// --- Signing — EIP-191 personal_sign over the canonical JSON --------------------------------

/**
 * Sign a policy. Returns the object AND its signature, ready to drop into the POST body. The
 * signer signs `canonicalize(policy)` exactly — the same bytes the verifier will recompute.
 */
export async function signPolicy(signer: MessageSigner, policy: Policy): Promise<{ policy: Policy; signature: string }> {
  const signature = await signer.signMessage(canonicalize(policy));
  return { policy, signature };
}

/** Sign a job. Returns the object AND its signature. */
export async function signJob(signer: MessageSigner, job: Job): Promise<{ job: Job; signature: string }> {
  const signature = await signer.signMessage(canonicalize(job));
  return { job, signature };
}

// --- Submit — the thin client, with an honest three-outcome verdict -------------------------

export interface Receipt {
  action: string;
  cap: string;
  payee_hash: string;
  chain_id: number;
  time: string;
  signature_status: 'verified';
}

export type SubmitResult =
  | { outcome: 'verified'; status: 200; receipt: Receipt }
  | { outcome: 'refused'; status: number; error: string; message: string }
  | { outcome: 'could_not_check'; status: number | null; error: string; message: string };

/**
 * POST a signed policy+job to the verifier and report its verdict honestly.
 *
 *   verified         200 with a receipt — the only "yes".
 *   refused          the verifier made a definite deny (signature_mismatch, expired,
 *                    payee_not_allowed, cap_exceeded, replay, bad_request) — carries its reason.
 *   could_not_check  nobody looked: a network/parse failure our side, OR the verifier's own
 *                    honest 503 `not_checked`. Never reported as verified.
 */
export async function submitJob(baseUrl: string, body: VerifyBody): Promise<SubmitResult> {
  if (!baseUrl) {
    return { outcome: 'could_not_check', status: null, error: 'no_engine', message: 'No verifier URL was configured.' };
  }
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/jobs/verify`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // We never reached the verifier. That is "not checked", not a refusal.
    return { outcome: 'could_not_check', status: null, error: 'network_error', message: 'Could not reach the verifier.' };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { outcome: 'could_not_check', status: res.status, error: 'bad_response', message: 'The verifier returned a non-JSON response.' };
  }

  const d = (data ?? {}) as { verified?: unknown; receipt?: Receipt; error?: unknown; message?: unknown };

  if (res.status === 200 && d.verified === true && d.receipt) {
    return { outcome: 'verified', status: 200, receipt: d.receipt };
  }

  const error = typeof d.error === 'string' ? d.error : 'unknown';
  const message = typeof d.message === 'string' ? d.message : 'The verifier did not verify this job.';

  // The verifier's own "I could not look" (503 / not_checked) stays in the third bucket.
  if (res.status === 503 || error === 'not_checked') {
    return { outcome: 'could_not_check', status: res.status, error, message };
  }

  return { outcome: 'refused', status: res.status, error, message };
}
