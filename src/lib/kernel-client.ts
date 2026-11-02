/**
 * kernel-client — ask the policy kernel BEFORE you act, and treat anything but a clean ALLOW as no.
 *
 * The kernel (repid-engine, `POST /api/v1/kernel/decide`) weighs a call against the agent owner's
 * SIGNED policy: default-deny, NOT_CHECKED blocking, spend limit zero until the owner raises it.
 * This is the client half. It is deliberately the dullest code in the SDK, because its whole job is
 * to be unable to turn "I did not get an answer" into "yes":
 *
 *   - a network error                       → REFUSE (verdict NOT_CHECKED: we did not look)
 *   - a timeout                             → REFUSE
 *   - any status other than 200             → REFUSE (401, 403, 429, 5xx, a 204, a redirect)
 *   - a body that is not JSON, or has an unexpected shape → REFUSE
 *   - verdict DENY or NOT_CHECKED           → REFUSE (and the kernel's reasons come back)
 *   - verdict ALLOW that does not agree with itself, or is not BOUND TO THIS REQUEST → REFUSE
 *   - the arguments could not be hashed (ethers missing) → REFUSE
 *
 * "Bound to this request" matters: an ALLOW for a different args_hash, tool, agent or amount is
 * somebody else's ALLOW. The answer carries a receipt preview; we check it names exactly what we
 * asked about, that every check in it PASSED, and that its hash matches its body.
 *
 * ARGUMENTS NEVER LEAVE THE PROCESS. Pass `args` and they are hashed here (keccak256 of canonical
 * JSON — the same function the engine uses; a shared test vector pins the two together); only the
 * hash is sent. The request body is built from a fixed list of fields, so nothing else can ride
 * along, and an input carrying a field outside that list is refused rather than half-forwarded.
 *
 * A CLIENT THAT OBEYS IS CO-OPERATING. `/decide` is a dry decision: this module cannot stop a
 * caller that ignores a REFUSE. Enforcement is where the engine wraps the tool (`runUnderKernel`);
 * use `requireKernelAllow` so that refusing is a throw, not a boolean someone forgets to read.
 *
 * SIGNED RECEIPTS (kernel-receipt/2, repid-engine RT-7). With KERNEL_RECEIPT_SIGNING_KEY set the engine
 * signs every receipt with Ed25519: header.signer = { alg, public_key, fingerprint }, header.signature
 * over `KERNEL_RECEIPT_SIGNATURE_DOMAIN + canonical JSON of the receipt without receipt_hash and
 * signature`, and receipt_hash computed after signing. This client accepts kernel-receipt/1 and /2 and
 * checks the signature HERE (node:crypto). Who signed only counts against a key pinned on THIS side:
 * TRUSTSHELL_KERNEL_TRUSTED_SIGNERS (or `trustedSigners`), comma-separated Ed25519 public keys,
 * 0x + 64 hex. Never the header's own signer, never fetched from the engine (it would vouch for itself).
 *
 *   AUTHENTIC      signature verifies, and the key is pinned            → accepted
 *   NOT_CHECKED    no pin configured (signed or not)                    → accepted, `authenticity` says so
 *   NOT_AUTHENTIC  bad or missing signature, a key that is not pinned,
 *                  or an UNSIGNED receipt while a pin is configured     → REFUSED, like a tampered receipt
 *   a pin that is not all 0x + 64 hex                                   → REFUSED before anything is sent
 *
 * With no pin a kernel-receipt/1 behaves exactly as before. A pin means "signed by this key, or no":
 * an unsigned receipt is then a downgrade, so pin only after the engine is signing.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { loadEthers, MissingDependencyError } from './optional-ethers';
import { TrustShellError } from './trustshell';
import { ApiUrlError, isHttps, resolveApiBase } from './api-url';

export const KERNEL_RECEIPT_SCHEMA = 'kernel-receipt/1' as const;
/** The signed receipt: the same body plus header.signer and header.signature. */
export const KERNEL_RECEIPT_SCHEMA_SIGNED = 'kernel-receipt/2' as const;
/** The engine's prefix on the signed bytes (repid-engine src/kernel/receipt-signing.ts). */
export const KERNEL_RECEIPT_SIGNATURE_DOMAIN = 'hyperdag.kernel-receipt.signature.v1\n';
/** Comma-separated Ed25519 public keys (0x + 64 hex) whose kernel-receipt/2 this client calls AUTHENTIC. */
export const KERNEL_TRUSTED_SIGNERS_ENV = 'TRUSTSHELL_KERNEL_TRUSTED_SIGNERS';

export type KernelVerdict = 'ALLOW' | 'DENY' | 'NOT_CHECKED';
export type KernelToolClass = 'read' | 'spend' | 'post' | 'other';

/** What the client sends the kernel. Arguments are hashed locally and never transmitted. */
export interface KernelCallInput {
  agent: { agent_id: string; agent_name: string };
  tool: { name: string; class: KernelToolClass };
  /** Where the turn came from: Cli | Site | Mcp | Market. */
  origin: string;
  /** The tool's arguments. Hashed here; only the hash is sent. */
  args?: unknown;
  /** Or a hash you computed with `hashKernelArgs`. */
  args_hash?: string;
  /** Smallest-unit amount, for a spend. A canonical decimal string or a safe integer. */
  amount_raw?: string | number | null;
  payee?: string | null;
  asset?: string | null;
  chain_id?: number | null;
}

export interface KernelClientOptions {
  /** Defaults to TRUSTSHELL_API_URL, then the production engine, like the rest of the SDK. */
  apiUrl?: string;
  apiKey?: string;
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Default 10 000 ms. A timeout is a REFUSE. */
  timeoutMs?: number;
  /** Pinned Ed25519 public keys (0x + 64 hex). Defaults to TRUSTSHELL_KERNEL_TRUSTED_SIGNERS. */
  trustedSigners?: readonly string[];
}

/** The parts of a kernel-receipt/1 this client reads. The full shape is schemas/kernel-receipt.v1.json. */
export interface KernelReceiptV1 {
  header: {
    schema: typeof KERNEL_RECEIPT_SCHEMA;
    version: 1;
    receipt_id: string;
    prev_receipt_id: string | null;
    prev_hash: string | null;
    created_at: string;
    receipt_hash: string;
    env: { network: string; chain_id: number; is_simulated: boolean };
    signer: null;
  };
  subject: { agent: { agent_id: string; agent_name: string }; owner: { wallet: string | null; assurance: string | null; status: 'resolved' | 'none' | 'unknown' } };
  request: { tool: { name: string; class: KernelToolClass }; origin: string; args_hash: string; amount_raw: string | null; payee: string | null; asset: string | null; chain_id: number | null };
  decision: {
    verdict: KernelVerdict;
    blocking: boolean;
    executed: boolean;
    reasons: Array<{ code: string; detail: string }>;
    checks: Array<{ name: string; outcome: 'PASS' | 'FAIL' | 'NOT_CHECKED'; source: string }>;
    does_not_attest: string[];
    policy: { policy_hash: string | null; signer: string | null; signature: 'VERIFIED' | 'FAILED' | 'NOT_CHECKED'; expires_at: number | null; revocation: 'VERIFIED' | 'NOT_CHECKED' };
    limits: { per_tx_raw: string; daily_raw: string; total_raw: string; effective_per_tx_raw: string; binding_term: string };
    laya: { lane: string | null; mode: 'shadow'; consulted: false };
  };
  payment: { status: string; [k: string]: unknown };
  verification: { status: string; [k: string]: unknown };
}

/** Who sealed a kernel-receipt/2. Public material only, 0x hex. fingerprint = sha256 of the raw key. */
export interface KernelReceiptSigner {
  alg: 'ed25519';
  public_key: string;
  fingerprint: string;
}

/** kernel-receipt/2: a kernel-receipt/1 body, sealed by an Ed25519 key. */
export type KernelReceiptV2 = Omit<KernelReceiptV1, 'header'> & {
  header: Omit<KernelReceiptV1['header'], 'schema' | 'version' | 'signer'> & {
    schema: typeof KERNEL_RECEIPT_SCHEMA_SIGNED;
    version: 2;
    signer: KernelReceiptSigner;
    /** Ed25519, lower-case 0x + 128 hex. */
    signature: string;
  };
};

export type KernelReceipt = KernelReceiptV1 | KernelReceiptV2;

/** WHO made a receipt, apart from whether it is whole. Only NOT_AUTHENTIC is a refusal; see the header. */
export type KernelReceiptAuthenticity =
  | { status: 'AUTHENTIC'; fingerprint: string }
  | { status: 'NOT_AUTHENTIC'; reason: 'invalid' | 'untrusted_signer' | 'unsigned'; detail: string }
  | { status: 'NOT_CHECKED'; reason: 'no_trusted_signers' | 'unsigned'; detail: string };

export type KernelOutcome =
  | { allowed: true; verdict: 'ALLOW'; source: 'kernel'; args_hash: string; receipt: KernelReceipt; reasons: []; authenticity: KernelReceiptAuthenticity }
  | {
      allowed: false;
      /** The kernel's verdict when it gave one; NOT_CHECKED when we never got an answer. */
      verdict: 'DENY' | 'NOT_CHECKED';
      /** Who refused: the kernel, or this client because it could not trust what it got. */
      source: 'kernel' | 'client';
      args_hash: string | null;
      receipt: KernelReceipt | null;
      /** Stable codes, e.g. `spend_limit_zero`, `network_error`, `http_503`, `allow_not_bound_to_request`. */
      reasons: Array<{ code: string; detail: string }>;
      http_status: number | null;
    };

/** Thrown by `requireKernelAllow`. Carries the full refusal so the caller can log the codes. */
export class KernelRefusedError extends TrustShellError {
  readonly code = 'KERNEL_REFUSED';
  readonly outcome: Extract<KernelOutcome, { allowed: false }>;
  constructor(outcome: Extract<KernelOutcome, { allowed: false }>) {
    const why = outcome.reasons.map((r) => r.code).join(', ') || outcome.verdict;
    super(`kernel_refused: ${outcome.verdict} (${why})`, 403);
    this.name = 'KernelRefusedError';
    this.outcome = outcome;
  }
}

// ── hashing (the same function as the engine's, pinned by a shared vector) ─────────────────────

/** Object keys sorted at every depth, arrays in order, no whitespace. Identical to the engine's. */
export function kernelCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map((v) => kernelCanonicalJson(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + kernelCanonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}

/** keccak256 of the canonical JSON of the arguments. Needs the optional `ethers` peer. */
export async function hashKernelArgs(args: unknown): Promise<string> {
  const { keccak256, toUtf8Bytes } = await loadEthers('Hashing kernel arguments');
  return keccak256(toUtf8Bytes(kernelCanonicalJson(args)));
}

/** keccak256 of the canonical JSON of a receipt without `header.receipt_hash`. */
export async function kernelReceiptHash(receipt: KernelReceipt): Promise<string> {
  const { keccak256, toUtf8Bytes } = await loadEthers('Hashing a kernel receipt');
  const { receipt_hash: _omit, ...header } = receipt.header;
  return keccak256(toUtf8Bytes(kernelCanonicalJson({ ...receipt, header })));
}

// ── authenticity (kernel-receipt/2) ─────────────────────────────────────────────────────────────

const SIG_HEX = /^0x[0-9a-f]{128}$/; // lower-case only: one signed receipt, one encoding (as the engine)

/**
 * The pinned public keys, lower-cased: `trustedSigners`, else TRUSTSHELL_KERNEL_TRUSTED_SIGNERS. [] when
 * none. null when any entry is not 0x + 64 hex: the caller refuses rather than trust fewer keys and pass.
 */
export function kernelTrustedSigners(trustedSigners?: readonly string[]): string[] | null {
  const raw = trustedSigners ?? (globalThis.process?.env?.[KERNEL_TRUSTED_SIGNERS_ENV] ?? '').split(',');
  const keys = raw.map((s) => String(s).trim()).filter((s) => s !== '');
  return keys.every((k) => HEX32.test(k)) ? keys.map((k) => k.toLowerCase()) : null;
}

function ed25519Verifies(publicKeyHex: string, message: string, signatureHex: string): boolean {
  try {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKeyHex.slice(2), 'hex').toString('base64url') }, format: 'jwk' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureHex.slice(2), 'hex'));
  } catch {
    return false;
  }
}

/**
 * Is this receipt whole, and who sealed it? Recomputes receipt_hash, re-derives the engine's signed bytes
 * (the domain tag, then the canonical receipt without receipt_hash and signature), verifies the Ed25519
 * signature, and calls the signer AUTHENTIC only when its key is in `trusted` (from kernelTrustedSigners).
 * The header's own signer is never trusted by itself. Never throws, except for a missing optional ethers.
 */
export async function kernelReceiptAuthenticity(receipt: unknown, trusted: readonly string[]): Promise<KernelReceiptAuthenticity> {
  const invalid = (detail: string): KernelReceiptAuthenticity => ({ status: 'NOT_AUTHENTIC', reason: 'invalid', detail });
  if (!isObj(receipt) || !isObj(receipt['header'])) return invalid('not a kernel receipt');
  const h = receipt['header'];
  if (typeof h['receipt_hash'] !== 'string' || (await kernelReceiptHash(receipt as unknown as KernelReceipt)) !== h['receipt_hash']) return invalid('the receipt does not match its own hash');
  if (h['schema'] === KERNEL_RECEIPT_SCHEMA) {
    if (h['signer'] !== null) return invalid('kernel-receipt/1 names a signer');
    return trusted.length
      ? { status: 'NOT_AUTHENTIC', reason: 'unsigned', detail: 'a signer is pinned and this receipt is unsigned (kernel-receipt/1)' }
      : { status: 'NOT_CHECKED', reason: 'unsigned', detail: 'kernel-receipt/1 is unsigned: integrity is the hash only, and anyone can mint one' };
  }
  const s = h['signer'];
  const sig = h['signature'];
  if (h['schema'] !== KERNEL_RECEIPT_SCHEMA_SIGNED || h['version'] !== 2 || !isObj(s) || s['alg'] !== 'ed25519' || typeof s['public_key'] !== 'string' || !HEX32.test(s['public_key']) || typeof s['fingerprint'] !== 'string' || typeof sig !== 'string' || !SIG_HEX.test(sig)) {
    return invalid('not a well-formed kernel-receipt/2 (ed25519 signer, lower-case 0x + 128 hex signature)');
  }
  const key = s['public_key'].toLowerCase();
  const fingerprint = `0x${createHash('sha256').update(Buffer.from(key.slice(2), 'hex')).digest('hex')}`;
  if (s['fingerprint'].toLowerCase() !== fingerprint) return invalid('header.signer.fingerprint is not that key\'s');
  const { receipt_hash: _h, signature: _s, ...signed } = h;
  if (!ed25519Verifies(key, KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson({ ...receipt, header: signed }), sig)) return invalid('the signature does not verify under header.signer');
  if (!trusted.length) return { status: 'NOT_CHECKED', reason: 'no_trusted_signers', detail: `signed by ${fingerprint}; no signer is pinned (${KERNEL_TRUSTED_SIGNERS_ENV}), so whose key that is was not checked` };
  if (!trusted.includes(key)) return { status: 'NOT_AUTHENTIC', reason: 'untrusted_signer', detail: `signed by ${fingerprint}, which is not a pinned signer` };
  return { status: 'AUTHENTIC', fingerprint };
}

// ── the call ────────────────────────────────────────────────────────────────────────────────────

const INPUT_KEYS = new Set(['agent', 'tool', 'origin', 'args', 'args_hash', 'amount_raw', 'payee', 'asset', 'chain_id']);
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TIMEOUT_MS = 10_000;

function client(reason: string, detail: string, argsHash: string | null = null, status: number | null = null): KernelOutcome {
  return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: argsHash, receipt: null, reasons: [{ code: reason, detail }], http_status: status };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * SEC F10: https only (plain http only for localhost); throws ApiUrlError before anything is sent.
 * Trailing slashes are dropped there with a linear scan (CodeQL js/polynomial-redos on caller input).
 */
function apiUrlOf(opts: KernelClientOptions): string {
  return resolveApiBase(opts.apiUrl);
}

/** SEC F10: the bearer key goes to an https origin only, never to plain http. */
function authOf(opts: KernelClientOptions): Record<string, string> {
  return opts.apiKey && isHttps(apiUrlOf(opts)) ? { authorization: `Bearer ${opts.apiKey}` } : {};
}

/**
 * Is this answer an ALLOW for exactly the request we sent? Returns null when it is, else why not.
 * Every comparison is against what THIS call sent, never against what the response says about itself.
 */
async function bindingFault(receipt: unknown, input: KernelCallInput, argsHash: string): Promise<string | null> {
  if (!isObj(receipt) || !isObj(receipt['header']) || !isObj(receipt['decision']) || !isObj(receipt['request']) || !isObj(receipt['subject'])) return 'no receipt came with the ALLOW';
  const r = receipt as unknown as KernelReceipt;
  if (r.header.schema !== KERNEL_RECEIPT_SCHEMA && r.header.schema !== KERNEL_RECEIPT_SCHEMA_SIGNED) return 'the receipt is not kernel-receipt/1 or kernel-receipt/2';
  if (r.decision.verdict !== 'ALLOW' || r.decision.blocking !== false) return 'the receipt does not say ALLOW';
  if (r.decision.executed !== false) return 'a preview receipt claims the call already ran';
  if (!Array.isArray(r.decision.checks) || r.decision.checks.length === 0 || r.decision.checks.some((c) => c.outcome !== 'PASS')) return 'the ALLOW does not rest on passing checks';
  if (r.request.args_hash?.toLowerCase() !== argsHash.toLowerCase()) return 'the ALLOW is for different arguments';
  if (r.request.tool?.name !== input.tool.name || r.request.tool?.class !== input.tool.class) return 'the ALLOW is for a different tool';
  if (r.subject.agent?.agent_id !== input.agent.agent_id) return 'the ALLOW is for a different agent';
  if (input.tool.class === 'spend') {
    const sent = input.amount_raw === undefined || input.amount_raw === null ? null : String(input.amount_raw);
    if (sent === null || r.request.amount_raw !== sent) return 'the ALLOW is for a different amount';
  }
  if (typeof r.header.receipt_hash !== 'string' || !HEX32.test(r.header.receipt_hash)) return 'the receipt has no hash';
  if ((await kernelReceiptHash(r)) !== r.header.receipt_hash) return 'the receipt does not match its own hash';
  return null;
}

/**
 * Ask the kernel. NEVER THROWS and never resolves `allowed: true` unless the kernel said ALLOW,
 * with a 200, about exactly this request. Everything else is a refusal with a reason.
 */
export async function kernelDecide(input: KernelCallInput, opts: KernelClientOptions = {}): Promise<KernelOutcome> {
  try {
    if (!isObj(input)) return client('malformed_input', 'the call must be an object');
    for (const k of Object.keys(input)) {
      if (!INPUT_KEYS.has(k)) return client('malformed_input', `unexpected field "${k.slice(0, 40)}" (only ${[...INPUT_KEYS].join(', ')} are sent)`);
    }
    if (!isObj(input.agent) || typeof input.agent.agent_id !== 'string' || !isObj(input.tool) || typeof input.tool.name !== 'string' || typeof input.tool.class !== 'string' || typeof input.origin !== 'string') {
      return client('malformed_input', 'agent, tool and origin are required');
    }

    let argsHash: string;
    if (typeof input.args_hash === 'string') {
      if (!HEX32.test(input.args_hash)) return client('malformed_input', 'args_hash must be 0x followed by 64 hex characters');
      argsHash = input.args_hash.toLowerCase();
    } else if ('args' in input) {
      argsHash = (await hashKernelArgs(input.args)).toLowerCase();
    } else {
      return client('malformed_input', 'pass args (hashed here, never sent) or args_hash');
    }

    // The body is built field by field. Nothing the caller added can ride along.
    const body = {
      agent: { agent_id: input.agent.agent_id, agent_name: input.agent.agent_name ?? '' },
      tool: { name: input.tool.name, class: input.tool.class },
      origin: input.origin,
      args_hash: argsHash,
      amount_raw: input.amount_raw ?? null,
      payee: input.payee ?? null,
      asset: input.asset ?? null,
      chain_id: input.chain_id ?? null,
    };

    const trusted = kernelTrustedSigners(opts.trustedSigners);
    if (trusted === null) return client('trusted_signers_invalid', `every ${KERNEL_TRUSTED_SIGNERS_ENV} entry must be an Ed25519 public key, 0x + 64 hex`, argsHash);

    const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) return client('no_fetch', 'there is no fetch to ask the kernel with', argsHash);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(`${apiUrlOf(opts)}/api/v1/kernel/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authOf(opts) },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError' || controller.signal.aborted;
      if (e instanceof ApiUrlError) return client('api_url_refused', e.message, argsHash);
      return client(aborted ? 'timeout' : 'network_error', aborted ? 'the kernel did not answer in time' : 'the kernel could not be reached', argsHash);
    } finally {
      clearTimeout(timer);
    }

    if (res.status !== 200) {
      // A 400 carries the kernel's own DENY; keep its codes if they parse, but it is a refusal either way.
      let reasons: Array<{ code: string; detail: string }> = [{ code: `http_${res.status}`, detail: `the kernel answered ${res.status}, not 200` }];
      try {
        const j: unknown = await res.json();
        if (isObj(j) && Array.isArray(j['reasons'])) {
          const own = (j['reasons'] as unknown[]).filter((x): x is { code: string; detail: string } => isObj(x) && typeof x['code'] === 'string' && typeof x['detail'] === 'string');
          if (own.length) reasons = [...reasons, ...own];
        }
      } catch { /* the status alone is enough */ }
      return { allowed: false, verdict: res.status === 400 ? 'DENY' : 'NOT_CHECKED', source: res.status === 400 ? 'kernel' : 'client', args_hash: argsHash, receipt: null, reasons, http_status: res.status };
    }

    let j: unknown;
    try {
      j = await res.json();
    } catch {
      return client('unreadable_response', 'the kernel answered 200 with a body that is not JSON', argsHash, 200);
    }
    if (!isObj(j) || !isObj(j['decision']) || typeof j['blocking'] !== 'boolean' || !['ALLOW', 'DENY', 'NOT_CHECKED'].includes(String(j['verdict']))) {
      return client('unreadable_response', 'the kernel answered 200 with a body this client does not understand', argsHash, 200);
    }
    const verdict = j['verdict'] as KernelVerdict;
    const decision = j['decision'] as Record<string, unknown>;
    if (decision['verdict'] !== verdict || j['blocking'] !== (verdict !== 'ALLOW')) {
      return client('inconsistent_response', 'the verdict and the decision disagree', argsHash, 200);
    }
    const receipt = (isObj(j['receipt_preview']) ? (j['receipt_preview'] as unknown as KernelReceipt) : null);
    const reasons = Array.isArray(j['reasons'])
      ? (j['reasons'] as unknown[]).filter((x): x is { code: string; detail: string } => isObj(x) && typeof x['code'] === 'string' && typeof x['detail'] === 'string')
      : [];

    if (verdict !== 'ALLOW') {
      return { allowed: false, verdict, source: 'kernel', args_hash: argsHash, receipt, reasons: reasons.length ? reasons : [{ code: verdict === 'DENY' ? 'default_deny' : 'not_checked', detail: 'the kernel did not allow this call' }], http_status: 200 };
    }

    const fault = await bindingFault(receipt, input, argsHash);
    if (fault) return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: argsHash, receipt, reasons: [{ code: 'allow_not_bound_to_request', detail: fault }], http_status: 200 };
    const authenticity = await kernelReceiptAuthenticity(receipt, trusted);
    if (authenticity.status === 'NOT_AUTHENTIC') {
      return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: argsHash, receipt, reasons: [{ code: 'receipt_not_authentic', detail: `${authenticity.reason}: ${authenticity.detail}` }], http_status: 200 };
    }
    return { allowed: true, verdict: 'ALLOW', source: 'kernel', args_hash: argsHash, receipt: receipt as KernelReceipt, reasons: [], authenticity };
  } catch (e) {
    // A missing optional ethers is a refusal that SAYS WHAT TO RUN. It used to read only
    // "(MissingDependencyError)", which refused correctly and left a stranger on a cold install with
    // no way to know why (MEASURED 2026-10-12, a fresh `npm i` of this package). The message is a
    // fixed string from optional-ethers.ts, so quoting it leaks nothing.
    if (e instanceof MissingDependencyError) return client('ethers_missing', e.message);
    // Anything else we did not anticipate is a refusal too.
    const name = (e as { name?: string })?.name ?? 'Error';
    return client('client_error', `the kernel client failed (${name}); refusing`);
  }
}

/** Like `kernelDecide`, but a refusal is a THROW, so it cannot be ignored by forgetting to read a flag. */
export async function requireKernelAllow(input: KernelCallInput, opts: KernelClientOptions = {}): Promise<Extract<KernelOutcome, { allowed: true }>> {
  const out = await kernelDecide(input, opts);
  if (!out.allowed) throw new KernelRefusedError(out);
  return out;
}

// ── reading a receipt back (GET /api/v1/kernel/receipt/:id) ──────────────────────────────────────

/** The six-claim envelope's claim keys, in canonical order. Mirrored by lib/six-claims.ts (a test pins the two). */
export const SIX_CLAIM_KEYS = ['integrity', 'authenticity', 'observation', 'correctness', 'authorization', 'containment'] as const;
export type SixClaimKey = (typeof SIX_CLAIM_KEYS)[number];
export type SixClaimStatus = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED' | 'NOT_APPLICABLE';
export interface SixClaim { status: SixClaimStatus; statement: string; supports: string[]; gaps: string[] }
export const SIX_CLAIMS_PREDICATE_TYPE = 'https://hyperdag.dev/predicates/trust-receipt-six-claims/v1' as const;
/** The engine's `toSixClaimStatement`: an in-toto Statement over the receipt. There is no rollup field, on purpose. */
export interface SixClaimStatement {
  _type: 'https://in-toto.io/Statement/v1';
  subject: Array<{ name: string; digest: { keccak256: string } }>;
  predicateType: typeof SIX_CLAIMS_PREDICATE_TYPE;
  predicate: { claims: Record<SixClaimKey, SixClaim>; what_this_does_not_establish: string[] };
}

export type KernelReceiptRead =
  | {
      ok: true;
      receipt_id: string;
      /** The latest ledger entry for the call. Its hash was recomputed here and matched. */
      receipt: KernelReceipt;
      /** Who sealed it. Never NOT_AUTHENTIC here: that is `ok: false, reason: receipt_not_authentic`. */
      authenticity: KernelReceiptAuthenticity;
      /** Present only when the envelope names exactly this receipt (id and hash). Otherwise null, never a guess. */
      six_claims: SixClaimStatement | null;
      /** Why six_claims is null, when it is. */
      six_claims_note: string | null;
    }
  | {
      ok: false;
      /** `receipt_hash_mismatch` means the receipt does not match its own hash: treat it as tampered, not missing. */
      reason: string;
      detail: string;
      http_status: number | null;
    };

const RECEIPT_ID = /^[0-9a-zA-Z-]{8,64}$/; // the engine's CALL_ID
const CLAIM_STATUSES = new Set<string>(['VERIFIED', 'NOT_CHECKED', 'FAILED', 'NOT_APPLICABLE']);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Null when the envelope is well-formed and names exactly this receipt, else why it is not shown. */
function sixClaimsFault(env: unknown, receipt: KernelReceipt): string | null {
  if (env === undefined || env === null) return 'the engine sent no six-claim envelope for this receipt';
  if (!isObj(env) || env['_type'] !== 'https://in-toto.io/Statement/v1' || env['predicateType'] !== SIX_CLAIMS_PREDICATE_TYPE) return 'the six-claim envelope is not the expected in-toto statement';
  const subject = Array.isArray(env['subject']) ? env['subject'][0] : undefined;
  const digest = isObj(subject) && isObj(subject['digest']) ? subject['digest']['keccak256'] : undefined;
  if (!isObj(subject) || subject['name'] !== `kernel-receipt:${receipt.header.receipt_id}`) return 'the six-claim envelope names a different receipt';
  if (typeof digest !== 'string' || digest.toLowerCase() !== receipt.header.receipt_hash.replace(/^0x/, '').toLowerCase()) return 'the six-claim envelope is over a different hash';
  const pred = env['predicate'];
  if (!isObj(pred) || !isObj(pred['claims']) || !isStrArr(pred['what_this_does_not_establish'])) return 'the six-claim envelope has no claims';
  const claims = pred['claims'];
  for (const k of SIX_CLAIM_KEYS) {
    const c = claims[k];
    if (!isObj(c) || !CLAIM_STATUSES.has(String(c['status'])) || typeof c['statement'] !== 'string' || !isStrArr(c['supports']) || !isStrArr(c['gaps'])) return `the six-claim envelope's ${k} claim is malformed`;
  }
  return null;
}

/**
 * Read a kernel receipt back and check it. NEVER THROWS. `ok: true` only when the engine answered 200
 * with a kernel-receipt/1 or /2 for exactly this id whose hash, recomputed here, matches, and that is not
 * NOT_AUTHENTIC (see the authenticity rules at the top). The six claims ride
 * along only when they name that receipt; otherwise `six_claims` is null and `six_claims_note` says why.
 * Needs an API key: the route is authenticated, and an agent-bound key reads only its own agent's receipts.
 */
export async function kernelReceipt(receiptId: string, opts: KernelClientOptions = {}): Promise<KernelReceiptRead> {
  const fail = (reason: string, detail: string, status: number | null = null): KernelReceiptRead => ({ ok: false, reason, detail, http_status: status });
  try {
    if (typeof receiptId !== 'string' || !RECEIPT_ID.test(receiptId)) return fail('bad_receipt_id', 'a receipt id is 8-64 letters, digits or dashes');
    const trusted = kernelTrustedSigners(opts.trustedSigners);
    if (trusted === null) return fail('trusted_signers_invalid', `every ${KERNEL_TRUSTED_SIGNERS_ENV} entry must be an Ed25519 public key, 0x + 64 hex`);
    const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) return fail('no_fetch', 'there is no fetch to read the receipt with');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(`${apiUrlOf(opts)}/api/v1/kernel/receipt/${encodeURIComponent(receiptId)}`, {
        method: 'GET',
        headers: { accept: 'application/json', ...authOf(opts) },
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError' || controller.signal.aborted;
      if (e instanceof ApiUrlError) return fail('api_url_refused', e.message);
      return fail(aborted ? 'timeout' : 'network_error', aborted ? 'the engine did not answer in time' : 'the engine could not be reached');
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200) {
      const why: Record<number, string> = { 401: 'an API key is required (REPID_API_KEY)', 403: 'this API key is bound to a different agent', 404: 'the engine has no receipt with this id', 429: 'rate limited' };
      return fail(`http_${res.status}`, why[res.status] ?? `the engine answered ${res.status}, not 200`, res.status);
    }
    let j: unknown;
    try {
      j = await res.json();
    } catch {
      return fail('unreadable_response', 'the engine answered 200 with a body that is not JSON', 200);
    }
    const r = isObj(j) ? j['receipt'] : undefined;
    if (!isObj(r) || !isObj(r['header']) || !isObj(r['decision'])) return fail('unreadable_response', 'the answer carries no receipt', 200);
    const receipt = r as unknown as KernelReceipt;
    if (receipt.header.schema !== KERNEL_RECEIPT_SCHEMA && receipt.header.schema !== KERNEL_RECEIPT_SCHEMA_SIGNED) return fail('unreadable_response', 'the receipt is not kernel-receipt/1 or kernel-receipt/2', 200);
    if (receipt.header.receipt_id !== receiptId) return fail('wrong_receipt', 'the engine returned a different receipt than the one asked for', 200);
    if (typeof receipt.header.receipt_hash !== 'string' || !HEX32.test(receipt.header.receipt_hash)) return fail('unreadable_response', 'the receipt has no hash', 200);
    if ((await kernelReceiptHash(receipt)) !== receipt.header.receipt_hash) {
      return fail('receipt_hash_mismatch', 'the receipt does not match its own hash; treat it as tampered', 200);
    }
    const authenticity = await kernelReceiptAuthenticity(receipt, trusted);
    if (authenticity.status === 'NOT_AUTHENTIC') return fail('receipt_not_authentic', `${authenticity.reason}: ${authenticity.detail}; treat it as forged`, 200);
    const env = (j as Record<string, unknown>)['six_claims'];
    const note = sixClaimsFault(env, receipt);
    return { ok: true, receipt_id: receiptId, receipt, authenticity, six_claims: note ? null : (env as SixClaimStatement), six_claims_note: note };
  } catch (e) {
    if (e instanceof MissingDependencyError) return fail('ethers_missing', e.message);
    const name = (e as { name?: string })?.name ?? 'Error';
    return fail('client_error', `reading the receipt failed (${name})`);
  }
}
