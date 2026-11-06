/**
 * verify-receipt — recompute a kernel receipt's trust verdict OFFLINE, from the receipt alone.
 *
 * This is the TrustLattice verifier: the step that lets a STRANGER reproduce what the engine
 * produced, with no network, no engine, no account. It reuses the SDK's existing primitives
 * (kernelReceiptHash, kernelReceiptAuthenticity, kernelTrustedSigners) and composes them into one
 * reconciled six-claim verdict. It imports nothing from next/react/supabase and makes no request.
 *
 * WHAT IS RE-DERIVED vs WHAT IS READ. Only two things can be established offline by cryptography,
 * and this verifier does BOTH itself rather than trusting the receipt's own word for them:
 *   - the keccak256 receipt_hash, recomputed over the canonical receipt (RFC-8785-style ordering);
 *   - the Ed25519 signature, verified against the CALLER's pinned trusted roots — never the header's
 *     own signer (a receipt that vouches for itself proves nothing).
 * Both land under the `integrity` claim (its own gaps in the engine envelope name exactly these two
 * as "not checked here"). Everything else — authenticity (owner-authorized), observation,
 * correctness, authorization, containment — is the ISSUER's attestation. This verifier reads those
 * from a supplied six-claim envelope but does not re-derive them, and it refuses to surface any of
 * them as VERIFIED unless integrity holds AND a trusted key sealed the bytes. Fail-closed:
 * NOT_CHECKED is never a pass, and there is no single rollup "valid" verdict.
 *
 * The six-claim taxonomy and in-toto shape are the engine's (src/kernel/six-claims.ts); this never
 * redefines a claim's meaning, only recomputes what can be recomputed and downgrades what cannot.
 */
import {
  KERNEL_RECEIPT_SCHEMA,
  KERNEL_RECEIPT_SCHEMA_SIGNED,
  SIX_CLAIM_KEYS,
  SIX_CLAIMS_PREDICATE_TYPE,
  kernelReceiptHash,
  kernelReceiptAuthenticity,
  kernelTrustedSigners,
  type KernelReceipt,
  type SixClaim,
  type SixClaimKey,
  type SixClaimStatus,
  type SixClaimStatement,
} from './kernel-client';
import { MissingDependencyError } from './optional-ethers';

/** The verdict spec this verifier implements. Bump when the reconciliation rules change. */
export const TRUSTLATTICE_VERDICT_SPEC = 'https://hyperdag.dev/trustlattice/verdicts/v0' as const;

export interface OfflineVerifyOptions {
  /** Ed25519 public keys (0x + 64 hex) the caller trusts as sealers. Empty/absent = none pinned. */
  trustedRoots?: readonly string[];
  /** Freshness anchor: RFC3339 string or epoch seconds. When set, a policy expired before it fails authorization. */
  asOf?: string | number;
  /** The engine's six-claim in-toto Statement, if the caller has it (it travels in the receipt_response). */
  engineEnvelope?: unknown;
}

/** How a given claim's status was decided. */
export type ClaimSource = 'local' | 'engine' | 'fail-closed';

export interface OfflineVerifyResult {
  spec: typeof TRUSTLATTICE_VERDICT_SPEC;
  schema: 'kernel-receipt/1' | 'kernel-receipt/2' | 'MALFORMED';
  receipt_id: string | null;
  /** The locally recomputed hash (null when it could not be computed, e.g. ethers missing). */
  receipt_hash: string | null;
  /** Who sealed the bytes, as recomputed here. trusted=true only under a pinned key. */
  sealer: { trusted: boolean; fingerprint: string | null; note: string };
  /** The reconciled six-claim verdict, in canonical key order. */
  claims: Record<SixClaimKey, SixClaim>;
  /** in-toto wrapper over `claims` (null when the input was malformed). */
  statement: SixClaimStatement | null;
  reconciliation: {
    engine_envelope: 'ABSENT' | 'PRESENT_UNBOUND' | 'BOUND';
    /** Engine claims that were VERIFIED but which this verifier lowered to NOT_CHECKED/FAILED. */
    downgraded: SixClaimKey[];
    source: Record<SixClaimKey, ClaimSource>;
  };
  limitations: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const claim = (status: SixClaimStatus, statement: string, supports: string[] = [], gaps: string[] = []): SixClaim => ({ status, statement, supports, gaps });

const INTEGRITY_STMT = 'The record is whole: its hash matches its contents, and a trusted key sealed it.';
const STMT: Record<SixClaimKey, string> = {
  integrity: INTEGRITY_STMT,
  authenticity: 'The action was authorized by the agent’s accountable owner.',
  observation: 'An outcome was observed (e.g. a payment settling on chain).',
  correctness: 'The content was verified against its source.',
  authorization: 'The kernel permitted this action under the policy it was given.',
  containment: 'The tool ran only under an ALLOW decision.',
};

const OFFLINE_LIMITATIONS = [
  'Offline verification establishes two things by cryptography: integrity (the bytes are whole) and that a pinned Ed25519 key sealed them. Both are recomputed locally; neither the receipt nor any envelope is trusted for them.',
  'Every other claim (authenticity, observation, correctness, authorization, containment) is the issuer’s own attestation. This verifier reads it from a supplied six-claim envelope but does not re-derive it; with no envelope, or with the sealer unconfirmed, each is NOT_CHECKED.',
  'The chain is not walked: prev_hash is reported, not compared with the previous receipt (that needs the prior receipt).',
  'NOT_CHECKED is never a pass. There is no single rollup “valid” verdict — read the six claims.',
];

function asOfEpoch(asOf: string | number | undefined): number | null {
  if (asOf === undefined || asOf === null) return null;
  if (typeof asOf === 'number') return Number.isFinite(asOf) ? Math.floor(asOf) : null;
  const s = asOf.trim();
  if (/^\d+$/.test(s)) return Math.floor(Number(s)); // epoch seconds passed as a string (e.g. from a CLI flag)
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/** The engine's six claims, ONLY when the envelope is well-formed and names exactly this receipt+hash. */
function boundEngineClaims(env: unknown, receiptId: string | null, receiptHash: string | null): { claims: Record<SixClaimKey, SixClaim>; dne: string[] } | null {
  if (!isObj(env) || env['_type'] !== 'https://in-toto.io/Statement/v1' || env['predicateType'] !== SIX_CLAIMS_PREDICATE_TYPE) return null;
  const subject = Array.isArray(env['subject']) ? env['subject'][0] : undefined;
  if (!isObj(subject) || subject['name'] !== `kernel-receipt:${receiptId}`) return null;
  const digest = isObj(subject['digest']) ? subject['digest']['keccak256'] : undefined;
  const want = (receiptHash ?? '').replace(/^0x/, '').toLowerCase();
  if (!want || typeof digest !== 'string' || digest.toLowerCase() !== want) return null;
  const pred = env['predicate'];
  if (!isObj(pred) || !isObj(pred['claims'])) return null;
  const raw = pred['claims'] as Record<string, unknown>;
  const out = {} as Record<SixClaimKey, SixClaim>;
  for (const k of SIX_CLAIM_KEYS) {
    const c = raw[k];
    const status = isObj(c) ? c['status'] : undefined;
    if (!isObj(c) || typeof status !== 'string' || !['VERIFIED', 'NOT_CHECKED', 'FAILED', 'NOT_APPLICABLE'].includes(status)) return null;
    out[k] = claim(status as SixClaimStatus, typeof c['statement'] === 'string' ? c['statement'] : STMT[k], Array.isArray(c['supports']) ? c['supports'].map(String) : [], Array.isArray(c['gaps']) ? c['gaps'].map(String) : []);
  }
  const dne = Array.isArray(pred['what_this_does_not_establish']) ? pred['what_this_does_not_establish'].map(String) : [];
  return { claims: out, dne };
}

function malformed(reason: string): OfflineVerifyResult {
  const claims = {} as Record<SixClaimKey, SixClaim>;
  const source = {} as Record<SixClaimKey, ClaimSource>;
  for (const k of SIX_CLAIM_KEYS) {
    claims[k] = k === 'integrity' ? claim('FAILED', STMT[k], [], [reason]) : claim('NOT_CHECKED', STMT[k], [], ['the receipt is malformed; nothing could be checked']);
    source[k] = 'fail-closed';
  }
  return {
    spec: TRUSTLATTICE_VERDICT_SPEC, schema: 'MALFORMED', receipt_id: null, receipt_hash: null,
    sealer: { trusted: false, fingerprint: null, note: reason },
    claims, statement: null,
    reconciliation: { engine_envelope: 'ABSENT', downgraded: [], source },
    limitations: [...OFFLINE_LIMITATIONS],
  };
}

/**
 * Verify a kernel receipt offline. NEVER THROWS. Returns the reconciled six-claim verdict. Pass the
 * engine's six-claim envelope (from the receipt_response) to carry its authenticity/observation/etc.
 * attestations through; without it, those claims are NOT_CHECKED.
 */
export async function verifyReceiptOffline(receipt: unknown, opts: OfflineVerifyOptions = {}): Promise<OfflineVerifyResult> {
  if (!isObj(receipt) || !isObj(receipt['header']) || !isObj(receipt['decision'])) return malformed('not a kernel receipt (missing header or decision)');
  const header = receipt['header'] as Record<string, unknown>;
  const schema = header['schema'];
  if (schema !== KERNEL_RECEIPT_SCHEMA && schema !== KERNEL_RECEIPT_SCHEMA_SIGNED) return malformed(`unknown receipt schema ${JSON.stringify(schema).slice(0, 40)}`);
  const receiptId = typeof header['receipt_id'] === 'string' ? (header['receipt_id'] as string) : null;
  const headerHash = typeof header['receipt_hash'] === 'string' ? (header['receipt_hash'] as string) : null;
  const prevHash = header['prev_hash'];

  // ── integrity: recompute the hash, then fold the Ed25519 signature check into it ──
  let recomputed: string | null = null;
  const supports: string[] = [];
  const gaps: string[] = [];
  let integrityStatus: SixClaimStatus = 'NOT_CHECKED';
  let sealerTrusted = false;
  let fingerprint: string | null = null;
  let sealerNote = '';

  try {
    recomputed = await kernelReceiptHash(receipt as KernelReceipt);
    if (!headerHash) {
      integrityStatus = 'FAILED';
      gaps.push('the receipt carries no receipt_hash to compare against');
    } else if (recomputed.toLowerCase() === headerHash.toLowerCase()) {
      integrityStatus = 'VERIFIED';
      supports.push(`receipt_hash recomputed locally over the canonical receipt and matched (${headerHash})`);
    } else {
      integrityStatus = 'FAILED';
      gaps.push(`recomputed ${recomputed} does not match header.receipt_hash ${headerHash}; treat the receipt as tampered`);
    }
  } catch (e) {
    integrityStatus = 'NOT_CHECKED';
    gaps.push(e instanceof MissingDependencyError ? e.message : `could not recompute the receipt hash (${(e as { name?: string })?.name ?? 'Error'})`);
  }

  // The signature, against the CALLER's roots (never the header's own signer).
  const roots = kernelTrustedSigners(opts.trustedRoots);
  if (roots === null) {
    sealerNote = 'trustedRoots has a non-Ed25519 entry (each must be 0x + 64 hex); nothing was trusted';
    gaps.push(sealerNote);
  } else {
    try {
      const a = await kernelReceiptAuthenticity(receipt, roots);
      fingerprint = a.status === 'AUTHENTIC' ? a.fingerprint : null;
      if (a.status === 'AUTHENTIC') {
        sealerTrusted = true;
        sealerNote = `Ed25519 signature verified locally under pinned key ${a.fingerprint}`;
        supports.push(sealerNote);
      } else if (a.status === 'NOT_AUTHENTIC') {
        // A valid-looking receipt sealed by an untrusted/absent key, or a pin + unsigned downgrade: integrity fails.
        if (integrityStatus === 'VERIFIED') integrityStatus = 'FAILED';
        sealerNote = `${a.reason}: ${a.detail}`;
        gaps.push(`signature: ${sealerNote}`);
      } else {
        sealerNote = a.detail; // NOT_CHECKED: no roots pinned, or an unsigned /1 with no pin
        gaps.push(`signature: ${sealerNote}`);
      }
    } catch (e) {
      sealerNote = e instanceof MissingDependencyError ? e.message : `signature check failed (${(e as { name?: string })?.name ?? 'Error'})`;
      gaps.push(sealerNote);
    }
  }
  if (prevHash && prevHash !== null) gaps.push('prev_hash is reported, not compared with the previous receipt (the chain is not walked offline)');

  const integrity = claim(integrityStatus, INTEGRITY_STMT, supports, gaps);

  // ── the other five: engine attestations, gated on integrity + a trusted sealer ──
  const engine = boundEngineClaims(opts.engineEnvelope, receiptId, recomputed ?? headerHash);
  const claims = { integrity } as Record<SixClaimKey, SixClaim>;
  const source = { integrity: 'local' } as Record<SixClaimKey, ClaimSource>;
  const downgraded: SixClaimKey[] = [];
  const trustBytes = integrityStatus === 'VERIFIED';

  for (const k of SIX_CLAIM_KEYS) {
    if (k === 'integrity') continue;
    const eng = engine?.claims[k];
    if (!trustBytes) {
      claims[k] = claim('NOT_CHECKED', eng?.statement ?? STMT[k], [], ['integrity is not VERIFIED, so the receipt’s decision fields cannot be trusted']);
      source[k] = 'fail-closed';
      if (eng && (eng.status === 'VERIFIED' || eng.status === 'NOT_APPLICABLE')) downgraded.push(k);
      continue;
    }
    if (!eng) {
      claims[k] = claim('NOT_CHECKED', STMT[k], [], ['no six-claim envelope was supplied, and this claim cannot be derived from the receipt alone']);
      source[k] = 'fail-closed';
      continue;
    }
    if (!sealerTrusted && eng.status === 'VERIFIED') {
      claims[k] = claim('NOT_CHECKED', eng.statement, eng.supports, [...eng.gaps, 'the sealer was not confirmed against a pinned key, so this issuer attestation is read, not verified']);
      source[k] = 'fail-closed';
      downgraded.push(k);
      continue;
    }
    claims[k] = eng;
    source[k] = 'engine';
  }

  // Freshness: a policy that expired before as_of fails authorization, however the issuer labelled it.
  const asOf = asOfEpoch(opts.asOf);
  const decision = receipt['decision'] as Record<string, unknown>;
  const policy = isObj(decision['policy']) ? (decision['policy'] as Record<string, unknown>) : null;
  const expiresAt = policy && typeof policy['expires_at'] === 'number' ? (policy['expires_at'] as number) : null;
  if (asOf !== null && expiresAt !== null && asOf > expiresAt && claims.authorization.status !== 'FAILED') {
    claims.authorization = claim('FAILED', claims.authorization.statement, claims.authorization.supports, [...claims.authorization.gaps, `policy expired at ${expiresAt}, before as_of ${asOf}: the authorization is stale`]);
    source.authorization = 'local';
  }

  const dne = engine?.dne ?? [];
  const statement: SixClaimStatement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: `kernel-receipt:${receiptId ?? 'unknown'}`, digest: { keccak256: (recomputed ?? headerHash ?? '').replace(/^0x/, '') } }],
    predicateType: SIX_CLAIMS_PREDICATE_TYPE,
    predicate: { claims, what_this_does_not_establish: dne },
  };

  return {
    spec: TRUSTLATTICE_VERDICT_SPEC,
    schema: schema as 'kernel-receipt/1' | 'kernel-receipt/2',
    receipt_id: receiptId,
    receipt_hash: recomputed,
    sealer: { trusted: sealerTrusted, fingerprint, note: sealerNote },
    claims,
    statement,
    reconciliation: {
      engine_envelope: engine ? 'BOUND' : opts.engineEnvelope !== undefined ? 'PRESENT_UNBOUND' : 'ABSENT',
      downgraded,
      source,
    },
    limitations: [...OFFLINE_LIMITATIONS, ...dne],
  };
}
