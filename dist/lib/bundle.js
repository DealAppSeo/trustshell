"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleError = exports.MAX_BUNDLE_BYTES = exports.BUNDLE_SCHEMA = void 0;
exports.unsafeText = unsafeText;
exports.buildBundle = buildBundle;
exports.bundleProblems = bundleProblems;
exports.verifyBundle = verifyBundle;
exports.policyImportDecision = policyImportDecision;
exports.brainContext = brainContext;
const guardrails_1 = require("./guardrails");
const install_key_1 = require("./install-key");
const profile_1 = require("./profile");
const remember_1 = require("../cli/remember");
const ingest_1 = require("./ingest");
const action_evidence_1 = require("./action-evidence");
exports.BUNDLE_SCHEMA = 'trustshell.bundle/2';
/** A bundle larger than this is refused before it is parsed. */
exports.MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
class BundleError extends Error {
    constructor(message, 
    /** 1 = refused (altered, malformed, partial, other version, credential shape); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    exit) {
        super(message);
        this.exit = exit;
        this.name = 'BundleError';
    }
}
exports.BundleError = BundleError;
/** Text that may not travel, or may not be handed to a model: a credential shape or injection-looking text. */
function unsafeText(s) {
    if ((0, remember_1.refusedValue)(s))
        return 'credential';
    if ((0, ingest_1.ingest)(s).ingest !== 'clean')
        return 'injection';
    return null;
}
/** PURE apart from signing. A profile or a selected note holding unsafe text refuses the whole export. */
function buildBundle(payload, key, author, version, now = new Date().toISOString()) {
    if (payload.profile !== null && (0, remember_1.refusedValue)(payload.profile)) {
        throw new BundleError('profile.md holds something shaped like a credential, so nothing was exported. Remove it and run export again.', 1);
    }
    // The profile is handed to models on the other host: an instruction hidden in it travels like a poisoned note.
    if (payload.profile !== null && (0, ingest_1.ingest)(payload.profile).ingest !== 'clean') {
        throw new BundleError('profile.md holds injection-looking text (an instruction to an agent), so nothing was exported. Remove it and run export again.', 1);
    }
    for (const m of payload.memories) {
        const why = unsafeText(m.text);
        if (why)
            throw new BundleError(`a selected note looks like ${why === 'credential' ? 'a credential' : 'an injection'}; it may not travel, so nothing was exported`, 1);
    }
    const unsigned = { schema: exports.BUNDLE_SCHEMA, created_at: now, author, tool: { name: '@hyperdag/trustshell', version }, payload };
    return { ...unsigned, signature: (0, install_key_1.signValue)(unsigned, key) };
}
/** PURE. Every field a bundle may hold, of the type it must be. */
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
    if (!obj(v))
        return ['not a JSON object'];
    keys(v, ['schema', 'created_at', 'author', 'tool', 'payload', 'signature'], '');
    if (!str(v.created_at) || !str(v.signature))
        p.push('created_at and signature must be strings');
    if (!obj(v.author) || v.author.alg !== 'ed25519' || !str(v.author.public_key) || !str(v.author.fingerprint))
        p.push('author: { alg: ed25519, public_key, fingerprint }');
    else
        keys(v.author, ['alg', 'public_key', 'fingerprint'], 'author.');
    if (!obj(v.tool) || !str(v.tool.name) || !str(v.tool.version))
        p.push('tool: { name, version }');
    const pl = v.payload;
    if (!obj(pl))
        return [...p, 'payload: must be an object'];
    keys(pl, ['profile', 'policy', 'memories', 'evidence'], 'payload.');
    if (pl.profile !== null && !str(pl.profile))
        p.push('payload.profile: text or null');
    if (pl.policy !== null) {
        if (!obj(pl.policy) || !str(pl.policy.sha256) || !str(pl.policy.nonce))
            p.push('payload.policy: { sha256, nonce, document } or null');
        else {
            keys(pl.policy, ['sha256', 'nonce', 'document'], 'payload.policy.');
            const d = (0, guardrails_1.parsePolicyDocument)(JSON.stringify(pl.policy.document ?? null));
            if (!d.ok)
                p.push(...d.errors.map((e) => `payload.policy.document: ${e}`));
            else if ((0, guardrails_1.policySha256)(d.doc.policy) !== pl.policy.sha256 || d.doc.policy.nonce !== pl.policy.nonce)
                p.push('payload.policy: sha256 or nonce does not match its document');
        }
    }
    if (!Array.isArray(pl.memories))
        p.push('payload.memories: a list');
    else
        for (const [i, m] of pl.memories.entries())
            if (!obj(m) || !str(m.text) || !str(m.created_at) || Object.keys(m).length !== 2)
                p.push(`payload.memories[${i}]: { text, created_at }`);
    if (!Array.isArray(pl.evidence))
        p.push('payload.evidence: a list');
    else {
        for (const [i, e] of pl.evidence.entries()) {
            if (!obj(e) || !['file', 'guard-ledger-head'].includes(e.kind) || !str(e.name) || !/^[0-9a-f]{64}$/.test(String(e.sha256)) || Object.keys(e).length !== 3) {
                p.push(`payload.evidence[${i}]: { kind: file | guard-ledger-head, name, sha256 }`);
            }
        }
    }
    return p;
}
/**
 * Parse, check the version, check every field, check the signature, then check the author is one you trust,
 * in that order. Throws {@link BundleError}: exit 1 when the file is malformed, partial, another version,
 * altered or carries a credential shape; exit 2 when it is intact but its author is not one you named.
 */
function verifyBundle(text, opts) {
    if (Buffer.byteLength(text, 'utf8') > exports.MAX_BUNDLE_BYTES)
        throw new BundleError(`REFUSED the bundle is over ${exports.MAX_BUNDLE_BYTES} bytes`, 1);
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new BundleError('REFUSED the bundle is not complete JSON (corrupt or partial); nothing was imported', 1);
    }
    const schema = raw && typeof raw === 'object' ? raw.schema : undefined;
    if (schema !== exports.BUNDLE_SCHEMA) {
        throw new BundleError(`REFUSED the bundle is ${JSON.stringify(schema ?? null)}; this build reads ${exports.BUNDLE_SCHEMA} only, and nothing is guessed across versions`, 1);
    }
    const problems = bundleProblems(raw);
    if (problems.length)
        throw new BundleError(`REFUSED the bundle is not well formed: ${problems.slice(0, 5).join('; ')}`, 1);
    const b = raw;
    if ((0, install_key_1.fingerprintOf)(b.author.public_key) !== b.author.fingerprint)
        throw new BundleError('REFUSED the author fingerprint does not match its public key', 1);
    const { signature, ...unsigned } = b;
    if (!(0, install_key_1.verifyValue)(unsigned, b.author, signature)) {
        throw new BundleError('REFUSED the signature does not verify: the bundle was altered after it was signed, or never signed by this key', 1);
    }
    const p = b.payload;
    if ((p.profile !== null && (0, remember_1.refusedValue)(p.profile)) || p.memories.some((m) => (0, remember_1.refusedValue)(m.text))) {
        throw new BundleError('REFUSED the bundle holds something shaped like a credential; nothing was imported', 1);
    }
    const want = opts.signer?.trim().toLowerCase();
    if (want) {
        if (want !== b.author.fingerprint)
            throw new BundleError(`NOT_CHECKED signed by ${b.author.fingerprint}, not the --signer you gave (${want}); nothing was imported`, 2);
        return { bundle: b, trusted_as: '--signer' };
    }
    if (opts.ownFingerprint && opts.ownFingerprint === b.author.fingerprint)
        return { bundle: b, trusted_as: 'this install' };
    throw new BundleError(`NOT_CHECKED signed by ${b.author.fingerprint}, which is not this install's key. If it is yours, pass --signer ${b.author.fingerprint} (export prints it on the machine that made it). Nothing was imported.`, 2);
}
/**
 * Should the bundle's policy be ENFORCED here? Only when its owner signature verifies with a trusted key and
 * its nonce supersedes the policy in force. PURE (the signature check is passed in).
 */
function policyImportDecision(carried, trustedOwners, inForce, signedBy) {
    if (!carried)
        return null;
    const doc = carried.document;
    if (!doc.signature)
        return { enforce: false, why: 'it is unsigned: a bundle cannot grant authority, only an owner signature can' };
    if (!signedBy(doc, trustedOwners))
        return { enforce: false, why: 'its owner signature does not verify with a key you trust' };
    if (inForce && BigInt(doc.policy.nonce) <= BigInt(inForce.nonce)) {
        return { enforce: false, why: `its nonce ${doc.policy.nonce} does not supersede the policy in force (nonce ${inForce.nonce}): a downgrade or a replay` };
    }
    return { enforce: true, why: `owner-signed by ${doc.signature.fingerprint.slice(0, 16)}… and supersedes ${inForce ? `nonce ${inForce.nonce}` : 'no policy'}` };
}
/**
 * PURE. The person, as text for a model. Built only from the bundle; the policy is shown as INFORMATION
 * (enforcement stays in the harness, whatever a model does with this text). Any profile entry or memory that
 * looks like an injection is left out, so a poisoned line never reaches a model through this path, and control
 * and bidi characters are scrubbed (they reached the terminal through `bundle context`: Lane D, 2026-10-21).
 * The screen is a fixed pattern set (src/lib/ingest.ts): it misses paraphrased orders, so it narrows, not closes.
 */
function brainContext(p) {
    const safe = (t) => unsafeText(t) === null;
    const lines = ['# The person this agent works for (from their signed TrustShell bundle)'];
    if (p.profile !== null) {
        const pr = (0, profile_1.parseProfile)(p.profile).profile;
        const values = pr.values.filter(safe);
        const people = pr.people.filter((x) => safe(x.who) && safe(x.why));
        const style = Object.entries(pr.style).filter(([, v]) => safe(String(v)));
        const constraints = pr.constraints.filter(safe);
        if (pr.identity && safe(pr.identity))
            lines.push('', 'Identity:', pr.identity);
        if (pr.context && safe(pr.context))
            lines.push('', 'Standing context:', pr.context);
        if (values.length)
            lines.push('', 'Values, most important first:', ...values.map((v, i) => `${i + 1}. ${v}`));
        if (people.length)
            lines.push('', 'People they help:', ...people.map((x) => `- ${x.who}${x.why ? ` (why: ${x.why})` : ''}`));
        if (style.length)
            lines.push('', `Style: ${style.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
        if (constraints.length)
            lines.push('', 'Constraints that must hold:', ...constraints.map((c, i) => `${i + 1}. ${c}`));
        if (pr.priorities)
            lines.push('', `Model priorities: ${'preset' in pr.priorities ? pr.priorities.preset : pr.priorities.order.join(' > ')}`);
        lines.push('', `Trust settings: autonomy ${pr.trust.autonomy}; confidence gate ${pr.trust.confidence_gate}; human-in-the-loop gate ${pr.trust.hitl_gate}`);
    }
    if (p.policy) {
        const q = p.policy.document.policy;
        lines.push('', 'Owner policy (enforced by the harness, not by you; anything not listed is denied):', `- allowed actions: ${q.actions.length ? q.actions.join(', ') : 'none'}`, `- limits: per action ${q.per_tx_raw}, per day ${q.daily_raw}, in total ${q.total_raw} (smallest units)`, `- expires: ${new Date(q.expires_at * 1000).toISOString()}`);
    }
    const notes = p.memories.filter((m) => safe(m.text));
    if (notes.length)
        lines.push('', 'Notes they chose to carry:', ...notes.map((m) => `- ${m.text}`));
    return (0, action_evidence_1.cleanCodePoints)(lines.join('\n'), true) + '\n';
}
