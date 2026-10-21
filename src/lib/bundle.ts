/**
 * CARRY: `trustshell bundle` — the owner's context as one signed file, to another model or host.
 * --------------------------------------------------------------------------------------------
 * AUTHORITY NEVER TRAVELS. What a bundle carries, and nothing else:
 *   profile     `.trustshell/profile.md`, byte for byte (preferences, values, constraints, trust settings)
 *   policy      the owner policy BY HASH, with its `{ policy, signature }` document so the receiving host can
 *               check it. The receiving host ENFORCES it only when its owner signature verifies with a key that
 *               host trusts AND its nonce is higher than the policy already in force (the kernel's supersession,
 *               so an old, looser policy can never be replayed). Anything else imports as "suggested, not
 *               enforced" (`policy.suggested.json`). The bundle's own signature grants nothing.
 *   memories    ONLY the notes the owner selects (`--note <id>`, `--notes released`). None by default. Each
 *               imports as UNTRUSTED input through the quarantine (src/memory/quarantine.ts): held until a
 *               check or the operator releases it; injection-looking text is held for good.
 *   evidence    POINTERS: kind, name and sha256 of a record (a `check --claims` record, the guard ledger head).
 *               Never the record's contents.
 *   metadata    schema version, creation time, the author key and the tool version; Ed25519 over the RFC 8785
 *               form of all of it. A signature proves integrity only as far as the key is trusted; it encrypts
 *               NOTHING: a bundle is readable by anyone who has the file.
 * NEVER: credentials (the `remember` detector refuses the export), keys, spending authority, encrypted notes
 * (a bundle is plain JSON, so it never decrypts what you encrypted), do_not_send rows.
 *
 * EGRESS: none.
 */
import type { KeyObject } from 'node:crypto';
import { parsePolicyDocument, policySha256, type PolicyDocument } from './guardrails';
import { fingerprintOf, signValue, verifyValue, type Signer } from './install-key';
import { parseProfile } from './profile';
import { refusedValue } from '../cli/remember';
import { ingest } from './ingest';

export const BUNDLE_SCHEMA = 'trustshell.bundle/2';
/** A bundle larger than this is refused before it is parsed. */
export const MAX_BUNDLE_BYTES = 16 * 1024 * 1024;

export interface BundleMemory {
  text: string;
  created_at: string;
}

export interface EvidencePointer {
  kind: 'file' | 'guard-ledger-head';
  name: string;
  sha256: string;
}

export interface BundlePayload {
  profile: string | null;
  policy: { sha256: string; nonce: string; document: PolicyDocument } | null;
  memories: BundleMemory[];
  evidence: EvidencePointer[];
}

export interface Bundle {
  schema: typeof BUNDLE_SCHEMA;
  created_at: string;
  author: Signer;
  tool: { name: string; version: string };
  payload: BundlePayload;
  /** Ed25519 over canonicalize(everything but this field), base64. */
  signature: string;
}

export class BundleError extends Error {
  constructor(
    message: string,
    /** 1 = refused (altered, malformed, partial, other version, credential shape); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    readonly exit: 1 | 2 | 3,
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

/** Text that may not travel, or may not be handed to a model: a credential shape or injection-looking text. */
export function unsafeText(s: string): 'credential' | 'injection' | null {
  if (refusedValue(s)) return 'credential';
  if (ingest(s).ingest !== 'clean') return 'injection';
  return null;
}

/** PURE apart from signing. A profile or a selected note holding unsafe text refuses the whole export. */
export function buildBundle(payload: BundlePayload, key: KeyObject, author: Signer, version: string, now: string = new Date().toISOString()): Bundle {
  if (payload.profile !== null && refusedValue(payload.profile)) {
    throw new BundleError('profile.md holds something shaped like a credential, so nothing was exported. Remove it and run export again.', 1);
  }
  for (const m of payload.memories) {
    const why = unsafeText(m.text);
    if (why) throw new BundleError(`a selected note looks like ${why === 'credential' ? 'a credential' : 'an injection'}; it may not travel, so nothing was exported`, 1);
  }
  const unsigned = { schema: BUNDLE_SCHEMA, created_at: now, author, tool: { name: '@hyperdag/trustshell', version }, payload } as const;
  return { ...unsigned, signature: signValue(unsigned, key) };
}

/** PURE. Every field a bundle may hold, of the type it must be. */
export function bundleProblems(v: unknown): string[] {
  const p: string[] = [];
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const keys = (x: Record<string, unknown>, want: string[], at: string) => {
    for (const k of Object.keys(x)) if (!want.includes(k)) p.push(`${at}${k}: unknown field`);
    for (const k of want) if (!(k in x)) p.push(`${at}${k}: missing`);
  };
  const str = (x: unknown) => typeof x === 'string';
  if (!obj(v)) return ['not a JSON object'];
  keys(v, ['schema', 'created_at', 'author', 'tool', 'payload', 'signature'], '');
  if (!str(v.created_at) || !str(v.signature)) p.push('created_at and signature must be strings');
  if (!obj(v.author) || v.author.alg !== 'ed25519' || !str(v.author.public_key) || !str(v.author.fingerprint)) p.push('author: { alg: ed25519, public_key, fingerprint }');
  else keys(v.author, ['alg', 'public_key', 'fingerprint'], 'author.');
  if (!obj(v.tool) || !str(v.tool.name) || !str(v.tool.version)) p.push('tool: { name, version }');
  const pl = v.payload;
  if (!obj(pl)) return [...p, 'payload: must be an object'];
  keys(pl, ['profile', 'policy', 'memories', 'evidence'], 'payload.');
  if (pl.profile !== null && !str(pl.profile)) p.push('payload.profile: text or null');
  if (pl.policy !== null) {
    if (!obj(pl.policy) || !str(pl.policy.sha256) || !str(pl.policy.nonce)) p.push('payload.policy: { sha256, nonce, document } or null');
    else {
      keys(pl.policy, ['sha256', 'nonce', 'document'], 'payload.policy.');
      const d = parsePolicyDocument(JSON.stringify(pl.policy.document ?? null));
      if (!d.ok) p.push(...d.errors.map((e) => `payload.policy.document: ${e}`));
      else if (policySha256(d.doc.policy) !== pl.policy.sha256 || d.doc.policy.nonce !== pl.policy.nonce) p.push('payload.policy: sha256 or nonce does not match its document');
    }
  }
  if (!Array.isArray(pl.memories)) p.push('payload.memories: a list');
  else for (const [i, m] of (pl.memories as unknown[]).entries()) if (!obj(m) || !str(m.text) || !str(m.created_at) || Object.keys(m).length !== 2) p.push(`payload.memories[${i}]: { text, created_at }`);
  if (!Array.isArray(pl.evidence)) p.push('payload.evidence: a list');
  else {
    for (const [i, e] of (pl.evidence as unknown[]).entries()) {
      if (!obj(e) || !['file', 'guard-ledger-head'].includes(e.kind as string) || !str(e.name) || !/^[0-9a-f]{64}$/.test(String(e.sha256)) || Object.keys(e).length !== 3) {
        p.push(`payload.evidence[${i}]: { kind: file | guard-ledger-head, name, sha256 }`);
      }
    }
  }
  return p;
}

export interface VerifiedBundle {
  bundle: Bundle;
  trusted_as: 'this install' | '--signer';
}

/**
 * Parse, check the version, check every field, check the signature, then check the author is one you trust,
 * in that order. Throws {@link BundleError}: exit 1 when the file is malformed, partial, another version,
 * altered or carries a credential shape; exit 2 when it is intact but its author is not one you named.
 */
export function verifyBundle(text: string, opts: { ownFingerprint: string | null; signer?: string }): VerifiedBundle {
  if (Buffer.byteLength(text, 'utf8') > MAX_BUNDLE_BYTES) throw new BundleError(`REFUSED the bundle is over ${MAX_BUNDLE_BYTES} bytes`, 1);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BundleError('REFUSED the bundle is not complete JSON (corrupt or partial); nothing was imported', 1);
  }
  const schema = raw && typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined;
  if (schema !== BUNDLE_SCHEMA) {
    throw new BundleError(`REFUSED the bundle is ${JSON.stringify(schema ?? null)}; this build reads ${BUNDLE_SCHEMA} only, and nothing is guessed across versions`, 1);
  }
  const problems = bundleProblems(raw);
  if (problems.length) throw new BundleError(`REFUSED the bundle is not well formed: ${problems.slice(0, 5).join('; ')}`, 1);
  const b = raw as Bundle;
  if (fingerprintOf(b.author.public_key) !== b.author.fingerprint) throw new BundleError('REFUSED the author fingerprint does not match its public key', 1);
  const { signature, ...unsigned } = b;
  if (!verifyValue(unsigned, b.author, signature)) {
    throw new BundleError('REFUSED the signature does not verify: the bundle was altered after it was signed, or never signed by this key', 1);
  }
  const p = b.payload;
  if ((p.profile !== null && refusedValue(p.profile)) || p.memories.some((m) => refusedValue(m.text))) {
    throw new BundleError('REFUSED the bundle holds something shaped like a credential; nothing was imported', 1);
  }
  const want = opts.signer?.trim().toLowerCase();
  if (want) {
    if (want !== b.author.fingerprint) throw new BundleError(`NOT_CHECKED signed by ${b.author.fingerprint}, not the --signer you gave (${want}); nothing was imported`, 2);
    return { bundle: b, trusted_as: '--signer' };
  }
  if (opts.ownFingerprint && opts.ownFingerprint === b.author.fingerprint) return { bundle: b, trusted_as: 'this install' };
  throw new BundleError(
    `NOT_CHECKED signed by ${b.author.fingerprint}, which is not this install's key. If it is yours, pass --signer ${b.author.fingerprint} (export prints it on the machine that made it). Nothing was imported.`,
    2,
  );
}

/**
 * Should the bundle's policy be ENFORCED here? Only when its owner signature verifies with a trusted key and
 * its nonce supersedes the policy in force. PURE (the signature check is passed in).
 */
export function policyImportDecision(
  carried: BundlePayload['policy'],
  trustedOwners: readonly string[],
  inForce: { nonce: string } | null,
  signedBy: (doc: PolicyDocument, trusted: readonly string[]) => boolean,
): { enforce: boolean; why: string } | null {
  if (!carried) return null;
  const doc = carried.document;
  if (!doc.signature) return { enforce: false, why: 'it is unsigned: a bundle cannot grant authority, only an owner signature can' };
  if (!signedBy(doc, trustedOwners)) return { enforce: false, why: 'its owner signature does not verify with a key you trust' };
  if (inForce && BigInt(doc.policy.nonce) <= BigInt(inForce.nonce)) {
    return { enforce: false, why: `its nonce ${doc.policy.nonce} does not supersede the policy in force (nonce ${inForce.nonce}): a downgrade or a replay` };
  }
  return { enforce: true, why: `owner-signed by ${doc.signature.fingerprint.slice(0, 16)}… and supersedes ${inForce ? `nonce ${inForce.nonce}` : 'no policy'}` };
}

/**
 * PURE. The person, as text for a model. Built only from the bundle; the policy is shown as INFORMATION
 * (enforcement stays in the harness, whatever a model does with this text). A memory that looks like an
 * injection is left out, so a poisoned note never reaches a model through this path.
 */
export function brainContext(p: BundlePayload): string {
  const lines: string[] = ['# The person this agent works for (from their signed TrustShell bundle)'];
  if (p.profile !== null) {
    const pr = parseProfile(p.profile).profile;
    if (pr.identity) lines.push('', 'Identity:', pr.identity);
    if (pr.context) lines.push('', 'Standing context:', pr.context);
    if (pr.values.length) lines.push('', 'Values, most important first:', ...pr.values.map((v, i) => `${i + 1}. ${v}`));
    if (pr.people.length) lines.push('', 'People they help:', ...pr.people.map((x) => `- ${x.who}${x.why ? ` (why: ${x.why})` : ''}`));
    const style = Object.entries(pr.style);
    if (style.length) lines.push('', `Style: ${style.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
    if (pr.constraints.length) lines.push('', 'Constraints that must hold:', ...pr.constraints.map((c, i) => `${i + 1}. ${c}`));
    if (pr.priorities) lines.push('', `Model priorities: ${'preset' in pr.priorities ? pr.priorities.preset : pr.priorities.order.join(' > ')}`);
    lines.push('', `Trust settings: autonomy ${pr.trust.autonomy}; confidence gate ${pr.trust.confidence_gate}; human-in-the-loop gate ${pr.trust.hitl_gate}`);
  }
  if (p.policy) {
    const q = p.policy.document.policy;
    lines.push(
      '',
      'Owner policy (enforced by the harness, not by you; anything not listed is denied):',
      `- allowed actions: ${q.actions.length ? q.actions.join(', ') : 'none'}`,
      `- limits: per action ${q.per_tx_raw}, per day ${q.daily_raw}, in total ${q.total_raw} (smallest units)`,
      `- expires: ${new Date(q.expires_at * 1000).toISOString()}`,
    );
  }
  const notes = p.memories.filter((m) => unsafeText(m.text) === null);
  if (notes.length) lines.push('', 'Notes they chose to carry:', ...notes.map((m) => `- ${m.text}`));
  return lines.join('\n') + '\n';
}
