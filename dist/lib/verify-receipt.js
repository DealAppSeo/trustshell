"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUSTLATTICE_VERDICT_SPEC = void 0;
exports.asOfEpoch = asOfEpoch;
exports.verifyReceiptOffline = verifyReceiptOffline;
exports.verifyReceiptChain = verifyReceiptChain;
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
const kernel_client_1 = require("./kernel-client");
const optional_ethers_1 = require("./optional-ethers");
/** The verdict spec this verifier implements. Bump when the reconciliation rules change. */
exports.TRUSTLATTICE_VERDICT_SPEC = 'https://hyperdag.dev/trustlattice/verdicts/v0';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const kindOf = (v) => (Array.isArray(v) ? 'an array' : `a ${typeof v}`);
const policyExpiry = (receipt) => {
    const decision = isObj(receipt) ? receipt['decision'] : null;
    if (!isObj(decision))
        return { kind: 'absent' }; // not a receipt at all: rejected as MALFORMED elsewhere
    const policy = decision['policy'];
    if (policy === null || policy === undefined)
        return { kind: 'absent' };
    if (!isObj(policy))
        return { kind: 'unreadable', why: `decision.policy is ${kindOf(policy)}, not an object` };
    const e = policy['expires_at'];
    if (e === null || e === undefined)
        return { kind: 'absent' };
    if (typeof e !== 'number')
        return { kind: 'unreadable', why: `policy.expires_at is ${kindOf(e)}, not a number` };
    if (!Number.isFinite(e))
        return { kind: 'unreadable', why: 'policy.expires_at is not a finite number' };
    if (e > MAX_ANCHOR_S)
        return { kind: 'unreadable', why: `policy.expires_at ${e} is after ${MAX_ANCHOR_S} (2100), so it is not epoch seconds (a millisecond stamp lands here)` };
    return { kind: 'at', epoch: e };
};
const claim = (status, statement, supports = [], gaps = []) => ({ status, statement, supports, gaps });
const INTEGRITY_STMT = 'The record is whole: its hash matches its contents, and a trusted key sealed it.';
/** The integrity claim when the bytes are whole but NO trusted key was confirmed: only the hash was recomputed. */
const INTEGRITY_STMT_UNSEALED = 'The record is whole: its hash matches its contents. No trusted key was confirmed to have sealed it: the signature was not verified against a pinned key.';
const STMT = {
    integrity: INTEGRITY_STMT,
    authenticity: 'The action was authorized by the agent’s accountable owner.',
    observation: 'An outcome was observed (e.g. a payment settling on chain).',
    correctness: 'The content was verified against its source.',
    authorization: 'The kernel permitted this action under the policy it was given.',
    containment: 'The tool ran only under an ALLOW decision.',
};
const OFFLINE_LIMITATIONS = [
    'Offline verification establishes two things by cryptography: integrity (the bytes are whole) and that a pinned Ed25519 key sealed them. Both are recomputed locally; neither the receipt nor any envelope is trusted for them.',
    'Every other claim (authenticity, observation, correctness, authorization, containment) is the issuer’s own attestation in the six-claim envelope. The envelope is NOT covered by the receipt signature — the signature seals the receipt bytes, and the envelope only names the receipt by id and hash — so its claims are READ, NOT re-derived. They surface as VERIFIED only when the caller declares the envelope arrived over an authenticated channel; otherwise a VERIFIED attestation is shown as NOT_CHECKED, and a FAILED one is shown (self-reported failures are safe to surface). With no envelope each is NOT_CHECKED.',
    'The chain is not walked: prev_hash is reported, not compared with the previous receipt (that needs the prior receipt).',
    'NOT_CHECKED is never a pass. There is no single rollup “valid” verdict — read the six claims.',
];
/** Sanity window: an epoch-seconds anchor outside it is a mis-formatted date (a YYYYMMDD lands in 1970), not an instant. */
const MIN_ANCHOR_S = 946684800; // 2000-01-01T00:00:00Z
const MAX_ANCHOR_S = 4102444800; // 2100-01-01T00:00:00Z
/**
 * Parse a freshness anchor. null = none supplied. {unreadable} = supplied but unparsable — the caller
 * MUST fail closed (never silently skip the freshness check). {epoch} = a usable instant.
 */
function asOfEpoch(asOf) {
    if (asOf === undefined || asOf === null)
        return null;
    if (typeof asOf === 'number')
        return Number.isFinite(asOf) ? { epoch: Math.floor(asOf) } : { unreadable: `${asOf} is not a finite number` };
    const s = asOf.trim();
    if (s === '')
        return { unreadable: 'empty anchor' };
    if (/^\d+$/.test(s)) {
        const n = Math.floor(Number(s)); // epoch seconds passed as a string (e.g. from a CLI flag)
        if (!Number.isFinite(n) || n < MIN_ANCHOR_S || n > MAX_ANCHOR_S) {
            return { unreadable: `${JSON.stringify(s)} is not plausible epoch seconds (expected ${MIN_ANCHOR_S}..${MAX_ANCHOR_S}); a bare YYYYMMDD date lands in 1970` };
        }
        return { epoch: n };
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? { unreadable: `${JSON.stringify(s)} is neither RFC3339 nor epoch seconds` } : { epoch: Math.floor(t / 1000) };
}
/** The engine's six claims, ONLY when the envelope is well-formed and names exactly this receipt+hash. */
function boundEngineClaims(env, receiptId, receiptHash) {
    if (!isObj(env) || env['_type'] !== 'https://in-toto.io/Statement/v1' || env['predicateType'] !== kernel_client_1.SIX_CLAIMS_PREDICATE_TYPE)
        return null;
    const subject = Array.isArray(env['subject']) ? env['subject'][0] : undefined;
    if (!isObj(subject) || subject['name'] !== `kernel-receipt:${receiptId}`)
        return null;
    const digest = isObj(subject['digest']) ? subject['digest']['keccak256'] : undefined;
    const want = (receiptHash ?? '').replace(/^0x/, '').toLowerCase();
    if (!want || typeof digest !== 'string' || digest.toLowerCase() !== want)
        return null;
    const pred = env['predicate'];
    if (!isObj(pred) || !isObj(pred['claims']))
        return null;
    const raw = pred['claims'];
    const out = {};
    for (const k of kernel_client_1.SIX_CLAIM_KEYS) {
        const c = raw[k];
        const status = isObj(c) ? c['status'] : undefined;
        if (!isObj(c) || typeof status !== 'string' || !['VERIFIED', 'NOT_CHECKED', 'FAILED', 'NOT_APPLICABLE'].includes(status))
            return null;
        out[k] = claim(status, typeof c['statement'] === 'string' ? c['statement'] : STMT[k], Array.isArray(c['supports']) ? c['supports'].map(String) : [], Array.isArray(c['gaps']) ? c['gaps'].map(String) : []);
    }
    const dne = Array.isArray(pred['what_this_does_not_establish']) ? pred['what_this_does_not_establish'].map(String) : [];
    return { claims: out, dne };
}
function malformed(reason) {
    const claims = {};
    const source = {};
    for (const k of kernel_client_1.SIX_CLAIM_KEYS) {
        claims[k] = k === 'integrity' ? claim('FAILED', STMT[k], [], [reason]) : claim('NOT_CHECKED', STMT[k], [], ['the receipt is malformed; nothing could be checked']);
        source[k] = 'fail-closed';
    }
    return {
        spec: exports.TRUSTLATTICE_VERDICT_SPEC, schema: 'MALFORMED', receipt_id: null, receipt_hash: null,
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
async function verifyReceiptOffline(receipt, opts = {}) {
    if (!isObj(receipt) || !isObj(receipt['header']) || !isObj(receipt['decision']))
        return malformed('not a kernel receipt (missing header or decision)');
    const header = receipt['header'];
    const schema = header['schema'];
    if (schema !== kernel_client_1.KERNEL_RECEIPT_SCHEMA && schema !== kernel_client_1.KERNEL_RECEIPT_SCHEMA_SIGNED)
        return malformed(`unknown receipt schema ${JSON.stringify(schema).slice(0, 40)}`);
    const receiptId = typeof header['receipt_id'] === 'string' ? header['receipt_id'] : null;
    const headerHash = typeof header['receipt_hash'] === 'string' ? header['receipt_hash'] : null;
    const prevHash = header['prev_hash'];
    // ── integrity: recompute the hash, then fold the Ed25519 signature check into it ──
    let recomputed = null;
    const supports = [];
    const gaps = [];
    let integrityStatus = 'NOT_CHECKED';
    let sealerTrusted = false;
    let fingerprint = null;
    let sealerNote = '';
    try {
        recomputed = await (0, kernel_client_1.kernelReceiptHash)(receipt);
        if (!headerHash) {
            integrityStatus = 'FAILED';
            gaps.push('the receipt carries no receipt_hash to compare against');
        }
        else if (recomputed.toLowerCase() === headerHash.toLowerCase()) {
            integrityStatus = 'VERIFIED';
            supports.push(`receipt_hash recomputed locally over the canonical receipt and matched (${headerHash})`);
        }
        else {
            integrityStatus = 'FAILED';
            gaps.push(`recomputed ${recomputed} does not match header.receipt_hash ${headerHash}; treat the receipt as tampered`);
        }
    }
    catch (e) {
        integrityStatus = 'NOT_CHECKED';
        gaps.push(e instanceof optional_ethers_1.MissingDependencyError ? e.message : `could not recompute the receipt hash (${e?.name ?? 'Error'})`);
    }
    // The signature, against the CALLER's roots (never the header's own signer).
    const roots = (0, kernel_client_1.kernelTrustedSigners)(opts.trustedRoots);
    if (roots === null) {
        // A pin set that cannot be parsed is a FAILED REQUIREMENT, not "no pin": the caller asked for a
        // signature check that could not run. Never fall through to hash-only integrity VERIFIED, which
        // would let a typo'd pin report an unsigned or foreign-signed receipt as a pass.
        if (integrityStatus === 'VERIFIED')
            integrityStatus = 'NOT_CHECKED';
        sealerNote = 'trustedRoots has a non-Ed25519 entry (each must be 0x + 64 hex); nothing was trusted and the signature was not checked';
        gaps.push(sealerNote);
    }
    else {
        try {
            const a = await (0, kernel_client_1.kernelReceiptAuthenticity)(receipt, roots);
            fingerprint = a.status === 'AUTHENTIC' ? a.fingerprint : null;
            if (a.status === 'AUTHENTIC') {
                sealerTrusted = true;
                sealerNote = `Ed25519 signature verified locally under pinned key ${a.fingerprint}`;
                supports.push(sealerNote);
            }
            else if (a.status === 'NOT_AUTHENTIC') {
                // A valid-looking receipt sealed by an untrusted/absent key, or a pin + unsigned downgrade: integrity fails.
                if (integrityStatus === 'VERIFIED')
                    integrityStatus = 'FAILED';
                sealerNote = `${a.reason}: ${a.detail}`;
                gaps.push(`signature: ${sealerNote}`);
            }
            else {
                sealerNote = a.detail; // NOT_CHECKED: no roots pinned, or an unsigned /1 with no pin
                gaps.push(`signature: ${sealerNote}`);
            }
        }
        catch (e) {
            sealerNote = e instanceof optional_ethers_1.MissingDependencyError ? e.message : `signature check failed (${e?.name ?? 'Error'})`;
            gaps.push(sealerNote);
        }
    }
    if (prevHash && prevHash !== null)
        gaps.push('prev_hash is reported, not compared with the previous receipt (the chain is not walked offline)');
    const integrity = claim(integrityStatus, integrityStatus === 'VERIFIED' && sealerTrusted ? INTEGRITY_STMT : INTEGRITY_STMT_UNSEALED, supports, gaps);
    // ── the other five: engine attestations, gated on integrity + a trusted sealer ──
    const engine = boundEngineClaims(opts.engineEnvelope, receiptId, recomputed ?? headerHash);
    const claims = { integrity };
    const source = { integrity: 'local' };
    const downgraded = [];
    const trustBytes = integrityStatus === 'VERIFIED';
    for (const k of kernel_client_1.SIX_CLAIM_KEYS) {
        if (k === 'integrity')
            continue;
        const eng = engine?.claims[k];
        if (!trustBytes) {
            claims[k] = claim('NOT_CHECKED', eng?.statement ?? STMT[k], [], ['integrity is not VERIFIED, so the receipt’s decision fields cannot be trusted']);
            source[k] = 'fail-closed';
            if (eng && (eng.status === 'VERIFIED' || eng.status === 'NOT_APPLICABLE'))
                downgraded.push(k);
            continue;
        }
        if (!eng) {
            claims[k] = claim('NOT_CHECKED', STMT[k], [], ['no six-claim envelope was supplied, and this claim cannot be derived from the receipt alone']);
            source[k] = 'fail-closed';
            continue;
        }
        // The envelope is NOT covered by the receipt's signature: binding by (receipt_id, receipt_hash) says
        // WHICH receipt it describes, not WHO wrote it. The receipt's sealer therefore proves nothing about
        // this document, so an issuer attestation may only reach VERIFIED when the envelope's own provenance
        // is vouched for — the sealer is trusted AND the caller declares the envelope arrived authenticated.
        // Otherwise a VERIFIED attestation is read, not re-derived (NOT_CHECKED); FAILED/NOT_APPLICABLE are
        // surfaced as-is (a self-reported failure is safe to show).
        if (eng.status === 'VERIFIED' && !(sealerTrusted && opts.envelopeAuthenticated === true)) {
            claims[k] = claim('NOT_CHECKED', eng.statement, eng.supports, [...eng.gaps, 'the six-claim envelope is not covered by the receipt signature and was not declared authenticated, so this issuer attestation is read, not verified']);
            source[k] = 'fail-closed';
            downgraded.push(k);
            continue;
        }
        claims[k] = eng;
        source[k] = 'engine';
    }
    // Freshness: a policy that expired at/before as_of fails authorization, however the issuer labelled it.
    // An anchor that cannot be read must NOT silently skip the check — it fails closed to NOT_CHECKED.
    // With no anchor at all, v0 leaves the status as read, but the gap says the check was skipped:
    // before this, an already-expired policy read VERIFIED with nothing saying freshness went unchecked.
    // The same holds for the expiry: one present but unreadable fails closed exactly like an unreadable anchor.
    const anchor = asOfEpoch(opts.asOf);
    const expiry = policyExpiry(receipt);
    if (anchor !== null && 'unreadable' in anchor && claims.authorization.status !== 'FAILED') {
        if (source.authorization === 'engine')
            downgraded.push('authorization');
        claims.authorization = claim('NOT_CHECKED', claims.authorization.statement, claims.authorization.supports, [...claims.authorization.gaps, `a freshness anchor was supplied but could not be read (${anchor.unreadable}), so freshness was NOT checked: this is not a pass`]);
        source.authorization = 'fail-closed';
    }
    else if (anchor !== null && 'epoch' in anchor && expiry.kind === 'at' && anchor.epoch >= expiry.epoch && claims.authorization.status !== 'FAILED') {
        claims.authorization = claim('FAILED', claims.authorization.statement, claims.authorization.supports, [...claims.authorization.gaps, `policy expired at ${expiry.epoch}, at or before as_of ${anchor.epoch}: the authorization is stale`]);
        source.authorization = 'local';
    }
    else if (anchor !== null && expiry.kind === 'unreadable' && claims.authorization.status !== 'FAILED') {
        if (source.authorization === 'engine')
            downgraded.push('authorization');
        claims.authorization = claim('NOT_CHECKED', claims.authorization.statement, claims.authorization.supports, [...claims.authorization.gaps, `${expiry.why}, so freshness was NOT checked: this is not a pass`]);
        source.authorization = 'fail-closed';
    }
    else if (anchor === null && expiry.kind !== 'absent' && claims.authorization.status !== 'FAILED') {
        const gap = expiry.kind === 'at'
            ? `the policy expires at ${expiry.epoch} and no as_of was supplied, so freshness was NOT checked`
            : `${expiry.why}, and no as_of was supplied, so freshness was NOT checked`;
        claims.authorization = claim(claims.authorization.status, claims.authorization.statement, claims.authorization.supports, [...claims.authorization.gaps, gap]);
    }
    const dne = engine?.dne ?? [];
    const statement = {
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: `kernel-receipt:${receiptId ?? 'unknown'}`, digest: { keccak256: (recomputed ?? headerHash ?? '').replace(/^0x/, '') } }],
        predicateType: kernel_client_1.SIX_CLAIMS_PREDICATE_TYPE,
        predicate: { claims, what_this_does_not_establish: dne },
    };
    return {
        spec: exports.TRUSTLATTICE_VERDICT_SPEC,
        schema: schema,
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
const CHAIN_LIMITATIONS = [
    'The chain is verified only INTERNALLY: index 0 is the root of the supplied sequence (its prev pointers are reported, not compared), and each later receipt is checked to carry the prior one’s receipt_id and recomputed hash. This does not assert index 0 is the true genesis.',
    'A chain is VERIFIED only when every receipt’s own integrity is VERIFIED, none of its six claims is FAILED, its sealer was confirmed against a caller-pinned trusted root, and every link matches; one tampered, unlinkable, or unauthenticated receipt fails or defers the whole chain, and so does one expired receipt when as_of is given. NOT_CHECKED (a hash that could not be recomputed, or no trusted root pinned) is never a pass.',
];
/**
 * Verify a sequence of kernel receipts (oldest→newest) offline. NEVER THROWS. Each receipt is run
 * through {@link verifyReceiptOffline}; consecutive receipts are checked for a matching
 * (prev_receipt_id, prev_hash) → (receipt_id, recomputed hash) link. Fail-closed roll-up.
 */
async function verifyReceiptChain(receipts, opts = {}) {
    if (!Array.isArray(receipts)) {
        // Not an array at all (null, undefined, a bare receipt object) is a hard failure, NOT an empty
        // sequence: the two must be distinguishable so garbage never reads like a legitimately empty chain.
        return { spec: exports.TRUSTLATTICE_VERDICT_SPEC, length: 0, chain: 'FAILED', links: [], broken_at: 0, limitations: [...CHAIN_LIMITATIONS, 'The input was not an array of receipts, so nothing could be verified: a hard failure, never an empty sequence.'] };
    }
    if (receipts.length === 0) {
        return { spec: exports.TRUSTLATTICE_VERDICT_SPEC, length: 0, chain: 'EMPTY', links: [], broken_at: null, limitations: [...CHAIN_LIMITATIONS] };
    }
    const links = [];
    let anyFailed = false;
    let anyNotChecked = false;
    let brokenAt = null;
    for (let i = 0; i < receipts.length; i++) {
        const verdict = await verifyReceiptOffline(receipts[i], { trustedRoots: opts.trustedRoots, asOf: opts.asOf, engineEnvelope: opts.engineEnvelopes?.[i] });
        const header = isObj(receipts[i]) && isObj(receipts[i]['header']) ? receipts[i]['header'] : null;
        const actualPrevHash = header && typeof header['prev_hash'] === 'string' ? header['prev_hash'] : null;
        const actualPrevId = header && typeof header['prev_receipt_id'] === 'string' ? header['prev_receipt_id'] : null;
        const integrity = verdict.claims.integrity.status;
        const notes = [];
        let status;
        let expectedPrevHash = null;
        if (i === 0) {
            status = 'NOT_APPLICABLE';
            notes.push('chain root: prev_hash and prev_receipt_id are reported, not compared (no prior receipt was supplied)');
        }
        else {
            const prior = links[i - 1];
            expectedPrevHash = prior.verdict.receipt_hash;
            const priorId = prior.verdict.receipt_id;
            if (integrity === 'NOT_CHECKED' || prior.verdict.claims.integrity.status === 'NOT_CHECKED') {
                status = 'NOT_CHECKED';
                notes.push('a receipt hash could not be recomputed, so the link could not be checked');
            }
            else {
                const hashMatch = expectedPrevHash !== null && actualPrevHash !== null && actualPrevHash.toLowerCase() === expectedPrevHash.toLowerCase();
                const idMatch = priorId !== null && actualPrevId !== null && actualPrevId === priorId;
                if (hashMatch && idMatch) {
                    status = 'VERIFIED';
                    notes.push(`links to ${priorId}: prev_hash matches the recomputed hash of index ${i - 1}`);
                }
                else {
                    status = 'FAILED';
                    if (!hashMatch)
                        notes.push(`prev_hash ${actualPrevHash ?? 'null'} does not match the recomputed hash ${expectedPrevHash ?? 'null'} of index ${i - 1}`);
                    if (!idMatch)
                        notes.push(`prev_receipt_id ${actualPrevId ?? 'null'} does not match receipt_id ${priorId ?? 'null'} of index ${i - 1}`);
                }
            }
        }
        links.push({ index: i, receipt_id: verdict.receipt_id, verdict, link: { status, expected_prev_hash: expectedPrevHash, actual_prev_hash: actualPrevHash, notes } });
        // A FAILED on ANY of the six claims is a hard failure for the whole chain, not integrity alone: a
        // receipt whose authorization failed on freshness must never roll up to a chain pass.
        const claimFailed = kernel_client_1.SIX_CLAIM_KEYS.some((k) => verdict.claims[k].status === 'FAILED');
        const hardFail = status === 'FAILED' || integrity === 'FAILED' || claimFailed;
        if (hardFail) {
            anyFailed = true;
            if (brokenAt === null)
                brokenAt = i;
        }
        if (status === 'NOT_CHECKED' || integrity === 'NOT_CHECKED')
            anyNotChecked = true;
    }
    // Fail-closed precedence: any hard failure → FAILED; else anything uncheckable, or any receipt whose
    // bytes were not sealed by a caller-pinned trusted root → NOT_CHECKED; else VERIFIED.
    const anyUnauthenticated = links.some((l) => !l.verdict.sealer.trusted);
    const chain = anyFailed ? 'FAILED' : anyNotChecked || anyUnauthenticated ? 'NOT_CHECKED' : 'VERIFIED';
    // Freshness is only checked against as_of, so without one the roll-up above never saw an expiry. Say so,
    // or an expired chain reads VERIFIED next to a limitation promising that expiry fails it. Status unchanged.
    // A per-receipt NOT_CHECKED authorization does not move the chain status, so the reason goes here too.
    const limitations = [...CHAIN_LIMITATIONS];
    const anchor = asOfEpoch(opts.asOf);
    const unchecked = receipts.filter((r) => {
        const x = policyExpiry(r);
        return x.kind !== 'absent' && (anchor === null || 'unreadable' in anchor || x.kind === 'unreadable');
    }).length;
    const why = anchor === null ? 'no as_of was supplied' : 'unreadable' in anchor ? 'the as_of could not be read' : 'their policy expiry could not be read';
    if (unchecked > 0)
        limitations.push(`Freshness was NOT checked for ${unchecked} of ${receipts.length} receipt(s) whose policy carries an expiry (${why}): this chain status says nothing about whether those policies were still in force.`);
    return { spec: exports.TRUSTLATTICE_VERDICT_SPEC, length: receipts.length, chain, links, broken_at: brokenAt, limitations };
}
