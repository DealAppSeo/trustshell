"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeKeyFs = exports.BundleError = exports.MAX_BUNDLE_BYTES = exports.SIGNING_KEY_FILE = exports.BUNDLE_SCHEMA = void 0;
exports.fingerprintOf = fingerprintOf;
exports.signingKey = signingKey;
exports.ownFingerprint = ownFingerprint;
exports.buildBundle = buildBundle;
exports.bundleProblems = bundleProblems;
exports.verifyBundle = verifyBundle;
exports.widenings = widenings;
exports.brainContext = brainContext;
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
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
const guardrails_1 = require("./guardrails");
const profile_1 = require("./profile");
const remember_1 = require("../cli/remember");
const local_store_1 = require("../memory/local-store");
exports.BUNDLE_SCHEMA = 'trustshell.bundle/1';
exports.SIGNING_KEY_FILE = 'bundle-signing-key.pem';
/** A bundle larger than this is refused before it is parsed. */
exports.MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
class BundleError extends Error {
    constructor(message, 
    /** 1 = the file was altered or holds what it must not (refused); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    exit) {
        super(message);
        this.exit = exit;
        this.name = 'BundleError';
    }
}
exports.BundleError = BundleError;
function fingerprintOf(publicKeyB64url) {
    return (0, node_crypto_1.createHash)('sha256').update(Buffer.from(publicKeyB64url, 'base64url')).digest('hex');
}
function signerOf(key) {
    const x = String((0, node_crypto_1.createPublicKey)(key).export({ format: 'jwk' }).x);
    return { alg: 'ed25519', public_key: x, fingerprint: fingerprintOf(x) };
}
const nodeKeyFs = () => {
    const fs = require('node:fs');
    return {
        exists: (p) => fs.existsSync(p),
        read: (p) => fs.readFileSync(p, 'utf8'),
        writeNew: (p, d) => fs.writeFileSync(p, d, { mode: 0o600, flag: 'wx' }),
        mkdirp: (p) => {
            fs.mkdirSync(p, { recursive: true, mode: 0o700 });
        },
    };
};
exports.nodeKeyFs = nodeKeyFs;
/**
 * This install's signing key: `<dir>/bundle-signing-key.pem`, Ed25519, created 0600 on first use.
 * It never leaves the machine and is never in a bundle; copy it yourself if you want one identity on
 * two machines, or import with --signer instead.
 */
function signingKey(dir, fs = (0, exports.nodeKeyFs)()) {
    const path = (0, node_path_1.join)(dir, exports.SIGNING_KEY_FILE);
    let created = false;
    if (!fs.exists(path)) {
        const { privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
        fs.mkdirp(dir);
        fs.writeNew(path, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
        created = true;
    }
    const key = (0, node_crypto_1.createPrivateKey)(fs.read(path));
    if (key.asymmetricKeyType !== 'ed25519')
        throw new BundleError(`${path} is not an Ed25519 key`, 3);
    return { key, signer: signerOf(key), created, path };
}
/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
function ownFingerprint(dir, fs = (0, exports.nodeKeyFs)()) {
    const path = (0, node_path_1.join)(dir, exports.SIGNING_KEY_FILE);
    return fs.exists(path) ? signerOf((0, node_crypto_1.createPrivateKey)(fs.read(path))).fingerprint : null;
}
function signedBytes(b) {
    return Buffer.from((0, jcs_1.canonicalize)({ schema: b.schema, created_at: b.created_at, signer: b.signer, payload: b.payload }), 'utf8');
}
/**
 * PURE apart from signing. Screen, assemble and sign. A profile holding a credential shape refuses the
 * whole export (it cannot be cut in half honestly); a note or value holding one is left out and counted.
 */
function buildBundle(src, key, now = new Date().toISOString()) {
    if (src.profile !== null && (0, remember_1.refusedValue)(src.profile)) {
        throw new BundleError('profile.md holds something shaped like a credential, so nothing was exported. Remove it and run export again.', 1);
    }
    const clean = src.notes.filter((n) => !(0, remember_1.refusedValue)(n.body));
    // Injection-looking text is held for good and never printed (quarantine.ts); a bundle is a file a
    // model may be handed, so that text does not travel either.
    const notes = clean.filter((n) => !(0, local_store_1.heldAsInjection)(n));
    const values = src.values.filter((v) => !(0, remember_1.refusedValue)(v.body) && !(0, remember_1.refusedValue)(v.key));
    const payload = {
        profile: src.profile,
        guardrails: src.guardrails,
        memory: { notes, values },
        withheld: {
            ...src.withheld,
            secret_shaped: src.notes.length - clean.length + (src.values.length - values.length),
            injection_held: clean.length - notes.length,
        },
    };
    const unsigned = { schema: exports.BUNDLE_SCHEMA, created_at: now, signer: signerOf(key), payload };
    return { ...unsigned, signature: (0, node_crypto_1.sign)(null, signedBytes(unsigned), key).toString('base64') };
}
const PROVENANCE = ['trusted', 'untrusted', 'grounded', 'verified'];
/** PURE. Every field a bundle may hold, of the type it must be. Anything else is a problem. */
function bundleProblems(v) {
    const p = [];
    const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    const keys = (x, want, at) => {
        for (const k of Object.keys(x))
            if (!want.includes(k))
                p.push(`${at}${k}: unknown field`);
        for (const k of want)
            if (!(k in x))
                p.push(`${at}${k}: missing`);
    };
    const str = (x) => typeof x === 'string';
    const strOrNull = (x) => x === null || typeof x === 'string';
    if (!obj(v))
        return ['not a JSON object'];
    keys(v, ['schema', 'created_at', 'signer', 'payload', 'signature'], '');
    if (v.schema !== exports.BUNDLE_SCHEMA)
        p.push(`schema: expected ${exports.BUNDLE_SCHEMA}`);
    if (!str(v.created_at) || !str(v.signature))
        p.push('created_at and signature must be strings');
    if (!obj(v.signer))
        p.push('signer: must be an object');
    else {
        keys(v.signer, ['alg', 'public_key', 'fingerprint'], 'signer.');
        if (v.signer.alg !== 'ed25519' || !str(v.signer.public_key) || !str(v.signer.fingerprint))
            p.push('signer: alg ed25519 with a public_key and fingerprint');
    }
    const pl = v.payload;
    if (!obj(pl))
        return [...p, 'payload: must be an object'];
    keys(pl, ['profile', 'guardrails', 'memory', 'withheld'], 'payload.');
    if (!strOrNull(pl.profile))
        p.push('payload.profile: text or null');
    if (pl.guardrails !== null) {
        const g = (0, guardrails_1.parseGuardrails)(JSON.stringify(pl.guardrails ?? 'missing'));
        if (!g.guardrails)
            p.push(...g.problems.map((x) => `payload.guardrails: ${x}`));
    }
    if (!obj(pl.withheld))
        p.push('payload.withheld: must be an object');
    else {
        keys(pl.withheld, ['encrypted', 'do_not_send', 'learn', 'secret_shaped', 'injection_held'], 'payload.withheld.');
        for (const [k, n] of Object.entries(pl.withheld))
            if (!Number.isSafeInteger(n) || n < 0)
                p.push(`payload.withheld.${k}: a count`);
    }
    const m = pl.memory;
    if (!obj(m) || !Array.isArray(m.notes) || !Array.isArray(m.values))
        return [...p, 'payload.memory: { notes: [], values: [] }'];
    keys(m, ['notes', 'values'], 'payload.memory.');
    for (const [i, n] of m.notes.entries()) {
        const at = `payload.memory.notes[${i}].`;
        if (!obj(n)) {
            p.push(`${at}: must be an object`);
            continue;
        }
        keys(n, ['kind', 'body', 'created_at', 'provenance', 'source', 'quarantined', 'quarantine_reason', 'released_by', 'released_at', 'source_sha256'], at);
        if (n.kind !== 'note' && n.kind !== 'pref')
            p.push(`${at}kind: note or pref`);
        if (!str(n.body) || !str(n.created_at) || !str(n.source))
            p.push(`${at}body, created_at and source are text`);
        if (!PROVENANCE.includes(n.provenance))
            p.push(`${at}provenance: one of ${PROVENANCE.join(', ')}`);
        if (typeof n.quarantined !== 'boolean')
            p.push(`${at}quarantined: true or false`);
        for (const k of ['quarantine_reason', 'released_by', 'released_at', 'source_sha256'])
            if (!strOrNull(n[k]))
                p.push(`${at}${k}: text or null`);
    }
    for (const [i, x] of m.values.entries()) {
        const at = `payload.memory.values[${i}].`;
        if (!obj(x)) {
            p.push(`${at}: must be an object`);
            continue;
        }
        keys(x, ['key', 'body', 'created_at'], at);
        if (!str(x.key) || !str(x.body) || !str(x.created_at))
            p.push(`${at}key, body and created_at are text`);
    }
    return p;
}
/**
 * Parse, check every field, check the signature, then check the signer is one you trust, in that
 * order. Throws {@link BundleError}: exit 1 when the file is malformed, altered or holds a credential
 * shape; exit 2 when it is intact but its signer is not one you named.
 */
function verifyBundle(text, opts) {
    if (Buffer.byteLength(text, 'utf8') > exports.MAX_BUNDLE_BYTES)
        throw new BundleError(`the bundle is over ${exports.MAX_BUNDLE_BYTES} bytes`, 1);
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new BundleError('the bundle is not JSON', 1);
    }
    const problems = bundleProblems(raw);
    if (problems.length)
        throw new BundleError(`REFUSED the bundle is not well formed: ${problems.slice(0, 5).join('; ')}`, 1);
    const b = raw;
    if (fingerprintOf(b.signer.public_key) !== b.signer.fingerprint) {
        throw new BundleError('REFUSED the signer fingerprint does not match its public key', 1);
    }
    let ok = false;
    try {
        const pub = (0, node_crypto_1.createPublicKey)({ key: { kty: 'OKP', crv: 'Ed25519', x: b.signer.public_key }, format: 'jwk' });
        ok = (0, node_crypto_1.verify)(null, signedBytes(b), pub, Buffer.from(b.signature, 'base64'));
    }
    catch {
        ok = false;
    }
    if (!ok)
        throw new BundleError('REFUSED the signature does not verify: the bundle was altered after it was signed, or was never signed by this key', 1);
    // Belt and braces: the exporter screens, but a bundle from an older or a foreign exporter may not have.
    const p = b.payload;
    if ((p.profile !== null && (0, remember_1.refusedValue)(p.profile)) ||
        p.memory.notes.some((n) => (0, remember_1.refusedValue)(n.body) || (0, local_store_1.heldAsInjection)(n)) ||
        p.memory.values.some((v) => (0, remember_1.refusedValue)(v.body) || (0, remember_1.refusedValue)(v.key))) {
        throw new BundleError('REFUSED the bundle holds something shaped like a credential, or injection-looking text; nothing was imported', 1);
    }
    const want = opts.signer?.trim().toLowerCase();
    if (want) {
        if (want !== b.signer.fingerprint) {
            throw new BundleError(`NOT_CHECKED signed by ${b.signer.fingerprint}, not the --signer you gave (${want}); nothing was imported`, 2);
        }
        return { bundle: b, trusted_as: '--signer' };
    }
    if (opts.ownFingerprint && opts.ownFingerprint === b.signer.fingerprint)
        return { bundle: b, trusted_as: 'this install' };
    throw new BundleError(`NOT_CHECKED signed by ${b.signer.fingerprint}, which is not this install's key. If it is yours, pass --signer ${b.signer.fingerprint} (export prints it on the machine that made it). Nothing was imported.`, 2);
}
/** What changes in the guardrails if `next` replaces `prev`: the rules that get WIDER, one line each. PURE. */
function widenings(prev, next) {
    if (!prev)
        return ['guardrails: none here before; the bundle\'s rules take effect'];
    const out = [];
    for (const h of next.egress.allow)
        if (!prev.egress.allow.includes(h))
            out.push(`egress.allow gains ${h}`);
    for (const t of next.tools.allow)
        if (!prev.tools.allow.includes(t))
            out.push(`tools.allow gains ${t}`);
    for (const k of ['spend_per_action', 'spend_total']) {
        if (BigInt(next.limits[k]) > BigInt(prev.limits[k]))
            out.push(`limits.${k} rises from ${prev.limits[k]} to ${next.limits[k]}`);
    }
    return out;
}
/**
 * PURE. The person, as text for a model: what any model is handed, so swapping the model changes
 * nothing else. Built only from the bundle. Only RELEASED notes (never a quarantined one: untrusted
 * text does not reach a model until a check releases it). It sends nothing; where it goes is the
 * caller's choice, and through trustshell the outbound scrub and TRUSTSHELL_LOCAL_ONLY still apply.
 */
function brainContext(p) {
    const lines = ['# The person this agent works for (from their signed TrustShell bundle)'];
    if (p.profile !== null) {
        const pr = (0, profile_1.parseProfile)(p.profile).profile;
        if (pr.identity)
            lines.push('', 'Identity:', pr.identity);
        if (pr.context)
            lines.push('', 'Standing context:', pr.context);
        if (pr.values.length)
            lines.push('', 'Values, most important first:', ...pr.values.map((v, i) => `${i + 1}. ${v}`));
        if (pr.people.length)
            lines.push('', 'People they help:', ...pr.people.map((x) => `- ${x.who}${x.why ? ` (why: ${x.why})` : ''}`));
        const style = Object.entries(pr.style);
        if (style.length)
            lines.push('', `Style: ${style.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
        if (pr.constraints.length)
            lines.push('', 'Constraints that must hold:', ...pr.constraints.map((c, i) => `${i + 1}. ${c}`));
        if (pr.priorities)
            lines.push('', `Model priorities: ${'preset' in pr.priorities ? pr.priorities.preset : pr.priorities.order.join(' > ')}`);
        lines.push('', `Trust settings: autonomy ${pr.trust.autonomy}; confidence gate ${pr.trust.confidence_gate}; human-in-the-loop gate ${pr.trust.hitl_gate}`);
    }
    const g = p.guardrails;
    if (g) {
        lines.push('', 'Guardrails (anything not listed is refused):', `- network hosts allowed: ${g.egress.allow.length ? g.egress.allow.join(', ') : 'none'}`, `- tools allowed: ${g.tools.allow.length ? g.tools.allow.join(', ') : 'none'}`, `- spend: up to ${g.limits.spend_per_action} per action and ${g.limits.spend_total} in total (${g.limits.unit})`);
    }
    const notes = p.memory.notes.filter((n) => !n.quarantined);
    if (notes.length)
        lines.push('', 'Notes they wrote or released:', ...notes.map((n) => `- ${n.body}`));
    if (p.memory.values.length)
        lines.push('', 'Saved values:', ...p.memory.values.map((v) => `- ${v.key}: ${v.body}`));
    return lines.join('\n') + '\n';
}
