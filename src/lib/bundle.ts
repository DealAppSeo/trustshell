/**
 * `trustshell bundle` — the second brain as one signed file: profile, memory, settings, guardrails.
 * ------------------------------------------------------------------------------------------------
 * WHAT TRAVELS
 *   profile     `.trustshell/profile.md`, byte for byte (identity, context, trust settings, values,
 *               people, style, constraints, model priorities, and the share flags that guard them)
 *   guardrails  `~/.trustshell/guardrails.json` (egress, tools, spend limits), as parsed
 *   memory      every note with its whole taint record (provenance, source, quarantine state, who
 *               released it), and every `remember KEY VALUE` value
 * The model is not in it. Nothing in a bundle names or needs one, which is the point: the same file
 * gives any model on any host the same person.
 *
 * WHAT NEVER TRAVELS, counted instead (a count, never the text)
 *   anything shaped like a credential (the `remember` detector): a profile holding one refuses the
 *   whole export; a note or value holding one is left out · injection-looking notes (held for good,
 *   never printed, so never handed on) · encrypted bodies (a bundle is plain JSON,
 *   so it never decrypts what you chose to encrypt) · do_not_send rows · the learn loop's rows
 *   · the signing key itself · environment settings (TRUSTSHELL_LOCAL_ONLY and friends are env vars).
 *
 * SIGNED, AND THE SIGNER MUST BE ONE YOU TRUST. Ed25519 over the RFC 8785 form of everything but the
 * signature. A valid signature only proves the file is what SOME key signed; anyone can sign a
 * forgery with a key of their own. So import also requires the signer to be this install's own key,
 * or the fingerprint you pass with --signer (printed by export on the other machine). Anything else
 * is NOT_CHECKED, never imported. The fingerprint is recomputed from the key, never read off the file.
 *
 * EGRESS: none. Local files only.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { join } from 'node:path';
import { canonicalize } from './jcs';
import { parseGuardrails, type Guardrails } from './guardrails';
import { parseProfile } from './profile';
import { refusedValue } from '../cli/remember';
import { heldAsInjection, type PortableNote, type PortableValue, type WithheldCounts } from '../memory/local-store';

export const BUNDLE_SCHEMA = 'trustshell.bundle/1';
export const SIGNING_KEY_FILE = 'bundle-signing-key.pem';
/** A bundle larger than this is refused before it is parsed. */
export const MAX_BUNDLE_BYTES = 16 * 1024 * 1024;

export interface BundlePayload {
  profile: string | null;
  guardrails: Guardrails | null;
  memory: { notes: PortableNote[]; values: PortableValue[] };
  withheld: WithheldCounts & { secret_shaped: number; injection_held: number };
}

export interface BundleSigner {
  alg: 'ed25519';
  /** The raw 32-byte public key, base64url (the JWK `x`). */
  public_key: string;
  /** sha256 hex of the raw public key. */
  fingerprint: string;
}

export interface Bundle {
  schema: typeof BUNDLE_SCHEMA;
  created_at: string;
  signer: BundleSigner;
  payload: BundlePayload;
  /** Ed25519 over canonicalize({ schema, created_at, signer, payload }), base64. */
  signature: string;
}

export class BundleError extends Error {
  constructor(
    message: string,
    /** 1 = the file was altered or holds what it must not (refused); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    readonly exit: 1 | 2 | 3,
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

export function fingerprintOf(publicKeyB64url: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64url, 'base64url')).digest('hex');
}

function signerOf(key: KeyObject): BundleSigner {
  const x = String((createPublicKey(key).export({ format: 'jwk' }) as { x?: string }).x);
  return { alg: 'ed25519', public_key: x, fingerprint: fingerprintOf(x) };
}

/** The filesystem calls the key needs. Injectable for tests. */
export interface KeyFs {
  exists(p: string): boolean;
  read(p: string): string;
  /** Create the file 0600 and fail if it already exists. */
  writeNew(p: string, data: string): void;
  mkdirp(p: string): void;
}

export const nodeKeyFs = (): KeyFs => {
  const fs = require('node:fs') as typeof import('node:fs');
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    writeNew: (p, d) => fs.writeFileSync(p, d, { mode: 0o600, flag: 'wx' }),
    mkdirp: (p) => {
      fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    },
  };
};

/**
 * This install's signing key: `<dir>/bundle-signing-key.pem`, Ed25519, created 0600 on first use.
 * It never leaves the machine and is never in a bundle; copy it yourself if you want one identity on
 * two machines, or import with --signer instead.
 */
export function signingKey(dir: string, fs: KeyFs = nodeKeyFs()): { key: KeyObject; signer: BundleSigner; created: boolean; path: string } {
  const path = join(dir, SIGNING_KEY_FILE);
  let created = false;
  if (!fs.exists(path)) {
    const { privateKey } = generateKeyPairSync('ed25519');
    fs.mkdirp(dir);
    fs.writeNew(path, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
    created = true;
  }
  const key = createPrivateKey(fs.read(path));
  if (key.asymmetricKeyType !== 'ed25519') throw new BundleError(`${path} is not an Ed25519 key`, 3);
  return { key, signer: signerOf(key), created, path };
}

/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
export function ownFingerprint(dir: string, fs: KeyFs = nodeKeyFs()): string | null {
  const path = join(dir, SIGNING_KEY_FILE);
  return fs.exists(path) ? signerOf(createPrivateKey(fs.read(path))).fingerprint : null;
}

function signedBytes(b: Omit<Bundle, 'signature'>): Buffer {
  return Buffer.from(canonicalize({ schema: b.schema, created_at: b.created_at, signer: b.signer, payload: b.payload }), 'utf8');
}

/** The parts a bundle is built from, read by the caller. */
export interface BundleSource {
  profile: string | null;
  guardrails: Guardrails | null;
  notes: PortableNote[];
  values: PortableValue[];
  withheld: WithheldCounts;
}

/**
 * PURE apart from signing. Screen, assemble and sign. A profile holding a credential shape refuses the
 * whole export (it cannot be cut in half honestly); a note or value holding one is left out and counted.
 */
export function buildBundle(src: BundleSource, key: KeyObject, now: string = new Date().toISOString()): Bundle {
  if (src.profile !== null && refusedValue(src.profile)) {
    throw new BundleError('profile.md holds something shaped like a credential, so nothing was exported. Remove it and run export again.', 1);
  }
  const clean = src.notes.filter((n) => !refusedValue(n.body));
  // Injection-looking text is held for good and never printed (quarantine.ts); a bundle is a file a
  // model may be handed, so that text does not travel either.
  const notes = clean.filter((n) => !heldAsInjection(n));
  const values = src.values.filter((v) => !refusedValue(v.body) && !refusedValue(v.key));
  const payload: BundlePayload = {
    profile: src.profile,
    guardrails: src.guardrails,
    memory: { notes, values },
    withheld: {
      ...src.withheld,
      secret_shaped: src.notes.length - clean.length + (src.values.length - values.length),
      injection_held: clean.length - notes.length,
    },
  };
  const unsigned = { schema: BUNDLE_SCHEMA, created_at: now, signer: signerOf(key), payload } as const;
  return { ...unsigned, signature: sign(null, signedBytes(unsigned), key).toString('base64') };
}

const PROVENANCE = ['trusted', 'untrusted', 'grounded', 'verified'];

/** PURE. Every field a bundle may hold, of the type it must be. Anything else is a problem. */
export function bundleProblems(v: unknown): string[] {
  const p: string[] = [];
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const keys = (x: Record<string, unknown>, want: string[], at: string) => {
    for (const k of Object.keys(x)) if (!want.includes(k)) p.push(`${at}${k}: unknown field`);
    for (const k of want) if (!(k in x)) p.push(`${at}${k}: missing`);
  };
  const str = (x: unknown) => typeof x === 'string';
  const strOrNull = (x: unknown) => x === null || typeof x === 'string';
  if (!obj(v)) return ['not a JSON object'];
  keys(v, ['schema', 'created_at', 'signer', 'payload', 'signature'], '');
  if (v.schema !== BUNDLE_SCHEMA) p.push(`schema: expected ${BUNDLE_SCHEMA}`);
  if (!str(v.created_at) || !str(v.signature)) p.push('created_at and signature must be strings');
  if (!obj(v.signer)) p.push('signer: must be an object');
  else {
    keys(v.signer, ['alg', 'public_key', 'fingerprint'], 'signer.');
    if (v.signer.alg !== 'ed25519' || !str(v.signer.public_key) || !str(v.signer.fingerprint)) p.push('signer: alg ed25519 with a public_key and fingerprint');
  }
  const pl = v.payload;
  if (!obj(pl)) return [...p, 'payload: must be an object'];
  keys(pl, ['profile', 'guardrails', 'memory', 'withheld'], 'payload.');
  if (!strOrNull(pl.profile)) p.push('payload.profile: text or null');
  if (pl.guardrails !== null) {
    const g = parseGuardrails(JSON.stringify(pl.guardrails ?? 'missing'));
    if (!g.guardrails) p.push(...g.problems.map((x) => `payload.guardrails: ${x}`));
  }
  if (!obj(pl.withheld)) p.push('payload.withheld: must be an object');
  else {
    keys(pl.withheld, ['encrypted', 'do_not_send', 'learn', 'secret_shaped', 'injection_held'], 'payload.withheld.');
    for (const [k, n] of Object.entries(pl.withheld)) if (!Number.isSafeInteger(n) || (n as number) < 0) p.push(`payload.withheld.${k}: a count`);
  }
  const m = pl.memory;
  if (!obj(m) || !Array.isArray(m.notes) || !Array.isArray(m.values)) return [...p, 'payload.memory: { notes: [], values: [] }'];
  keys(m, ['notes', 'values'], 'payload.memory.');
  for (const [i, n] of (m.notes as unknown[]).entries()) {
    const at = `payload.memory.notes[${i}].`;
    if (!obj(n)) {
      p.push(`${at}: must be an object`);
      continue;
    }
    keys(n, ['kind', 'body', 'created_at', 'provenance', 'source', 'quarantined', 'quarantine_reason', 'released_by', 'released_at', 'source_sha256'], at);
    if (n.kind !== 'note' && n.kind !== 'pref') p.push(`${at}kind: note or pref`);
    if (!str(n.body) || !str(n.created_at) || !str(n.source)) p.push(`${at}body, created_at and source are text`);
    if (!PROVENANCE.includes(n.provenance as string)) p.push(`${at}provenance: one of ${PROVENANCE.join(', ')}`);
    if (typeof n.quarantined !== 'boolean') p.push(`${at}quarantined: true or false`);
    for (const k of ['quarantine_reason', 'released_by', 'released_at', 'source_sha256']) if (!strOrNull(n[k])) p.push(`${at}${k}: text or null`);
  }
  for (const [i, x] of (m.values as unknown[]).entries()) {
    const at = `payload.memory.values[${i}].`;
    if (!obj(x)) {
      p.push(`${at}: must be an object`);
      continue;
    }
    keys(x, ['key', 'body', 'created_at'], at);
    if (!str(x.key) || !str(x.body) || !str(x.created_at)) p.push(`${at}key, body and created_at are text`);
  }
  return p;
}

export interface VerifiedBundle {
  bundle: Bundle;
  /** Whose key signed it, as the import trusted it. */
  trusted_as: 'this install' | '--signer';
}

/**
 * Parse, check every field, check the signature, then check the signer is one you trust, in that
 * order. Throws {@link BundleError}: exit 1 when the file is malformed, altered or holds a credential
 * shape; exit 2 when it is intact but its signer is not one you named.
 */
export function verifyBundle(text: string, opts: { ownFingerprint: string | null; signer?: string }): VerifiedBundle {
  if (Buffer.byteLength(text, 'utf8') > MAX_BUNDLE_BYTES) throw new BundleError(`the bundle is over ${MAX_BUNDLE_BYTES} bytes`, 1);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BundleError('the bundle is not JSON', 1);
  }
  const problems = bundleProblems(raw);
  if (problems.length) throw new BundleError(`REFUSED the bundle is not well formed: ${problems.slice(0, 5).join('; ')}`, 1);
  const b = raw as Bundle;
  if (fingerprintOf(b.signer.public_key) !== b.signer.fingerprint) {
    throw new BundleError('REFUSED the signer fingerprint does not match its public key', 1);
  }
  let ok = false;
  try {
    const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b.signer.public_key }, format: 'jwk' });
    ok = verify(null, signedBytes(b), pub, Buffer.from(b.signature, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new BundleError('REFUSED the signature does not verify: the bundle was altered after it was signed, or was never signed by this key', 1);
  // Belt and braces: the exporter screens, but a bundle from an older or a foreign exporter may not have.
  const p = b.payload;
  if (
    (p.profile !== null && refusedValue(p.profile)) ||
    p.memory.notes.some((n) => refusedValue(n.body) || heldAsInjection(n)) ||
    p.memory.values.some((v) => refusedValue(v.body) || refusedValue(v.key))
  ) {
    throw new BundleError('REFUSED the bundle holds something shaped like a credential, or injection-looking text; nothing was imported', 1);
  }
  const want = opts.signer?.trim().toLowerCase();
  if (want) {
    if (want !== b.signer.fingerprint) {
      throw new BundleError(`NOT_CHECKED signed by ${b.signer.fingerprint}, not the --signer you gave (${want}); nothing was imported`, 2);
    }
    return { bundle: b, trusted_as: '--signer' };
  }
  if (opts.ownFingerprint && opts.ownFingerprint === b.signer.fingerprint) return { bundle: b, trusted_as: 'this install' };
  throw new BundleError(
    `NOT_CHECKED signed by ${b.signer.fingerprint}, which is not this install's key. If it is yours, pass --signer ${b.signer.fingerprint} (export prints it on the machine that made it). Nothing was imported.`,
    2,
  );
}

/** What changes in the guardrails if `next` replaces `prev`: the rules that get WIDER, one line each. PURE. */
export function widenings(prev: Guardrails | null, next: Guardrails): string[] {
  if (!prev) return ['guardrails: none here before; the bundle\'s rules take effect'];
  const out: string[] = [];
  for (const h of next.egress.allow) if (!prev.egress.allow.includes(h)) out.push(`egress.allow gains ${h}`);
  for (const t of next.tools.allow) if (!prev.tools.allow.includes(t)) out.push(`tools.allow gains ${t}`);
  for (const k of ['spend_per_action', 'spend_total'] as const) {
    if (BigInt(next.limits[k]) > BigInt(prev.limits[k])) out.push(`limits.${k} rises from ${prev.limits[k]} to ${next.limits[k]}`);
  }
  return out;
}

/**
 * PURE. The person, as text for a model: what any model is handed, so swapping the model changes
 * nothing else. Built only from the bundle. Only RELEASED notes (never a quarantined one: untrusted
 * text does not reach a model until a check releases it). It sends nothing; where it goes is the
 * caller's choice, and through trustshell the outbound scrub and TRUSTSHELL_LOCAL_ONLY still apply.
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
  const g = p.guardrails;
  if (g) {
    lines.push(
      '',
      'Guardrails (anything not listed is refused):',
      `- network hosts allowed: ${g.egress.allow.length ? g.egress.allow.join(', ') : 'none'}`,
      `- tools allowed: ${g.tools.allow.length ? g.tools.allow.join(', ') : 'none'}`,
      `- spend: up to ${g.limits.spend_per_action} per action and ${g.limits.spend_total} in total (${g.limits.unit})`,
    );
  }
  const notes = p.memory.notes.filter((n) => !n.quarantined);
  if (notes.length) lines.push('', 'Notes they wrote or released:', ...notes.map((n) => `- ${n.body}`));
  if (p.memory.values.length) lines.push('', 'Saved values:', ...p.memory.values.map((v) => `- ${v.key}: ${v.body}`));
  return lines.join('\n') + '\n';
}
