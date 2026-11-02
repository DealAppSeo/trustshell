"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_MEASURED_CWD = exports.RUN_STATEMENT = exports.STATEMENT = exports.NOT_MEASURED_RUNSC = exports.NOT_MEASURED_REQUIRED = exports.RECEIPT_SCHEMA_V1 = exports.RECEIPT_SCHEMA = void 0;
exports.buildReceipt = buildReceipt;
exports.signReceipt = signReceipt;
exports.verifyReceipt = verifyReceipt;
exports.demoProblems = demoProblems;
const install_key_1 = require("../lib/install-key");
const mission_1 = require("./mission");
const passport_1 = require("./passport");
const promote_1 = require("./promote");
exports.RECEIPT_SCHEMA = 'trustshell.sandbox-mission-receipt/v2';
/** Before passports. Still verified, under its own rules. */
exports.RECEIPT_SCHEMA_V1 = 'trustshell.sandbox-mission-receipt/v1';
exports.NOT_MEASURED_REQUIRED = [
    'behaviour of the restrictions against an active hostile worker (adversarial in-container tests pending a scope decision)',
    'kernel or hypervisor escapes',
    'side channels (timing, cache, shared kernel)',
    'egress allowlists (network is none, so no allowlist was exercised)',
    'encoded or transformed canaries (the gate matches the literal canary string only)',
    'whether the runtime enforces each configured limit (docker inspect shows the configuration Docker accepted, not enforcement under load)',
];
exports.NOT_MEASURED_RUNSC = 'anything runsc-specific: runsc did not run on this mission';
exports.STATEMENT = 'The restriction profile was applied and read back from docker inspect before the worker started. ' +
    'The malicious-input denial was tested at the promotion gate, outside the worker: a worker-written ' +
    'candidate carrying a registered canary and a worker-written self-approval were refused while a benign ' +
    'artifact was promoted. In-container containment was not attacked.';
/**
 * The statement a `trustshell run --sandbox` receipt carries instead (src/sandbox/run.ts): that mission tests no
 * malicious input, so it must not carry STATEMENT's canary and self-approval claims.
 */
exports.RUN_STATEMENT = 'The restriction profile was applied and read back from docker inspect before the command started. ' +
    'Its outbox went through the airlock, and the separate promotion writer promoted from it only when the owner ran ' +
    '`trustshell sandbox promote`. The only denial tested was a replay of that approval after the mission token was ' +
    'revoked, at the promotion gate. No malicious input was tested, and in-container containment was not attacked.';
/** What a `run --sandbox` receipt adds to `not_measured`: the whole current directory is the command's input. */
exports.NOT_MEASURED_CWD = 'what the command read: the current directory is mounted read-only, so it can read every file there and copy any of them to the outbox; no canary is registered for them';
/** The attempt that carries the trusted approval; its decisions are the mission's outcome. */
const trustedAttempt = (attempts) => attempts.find((a) => a.approval?.source === 'trusted-harness');
function buildReceipt(i) {
    const final = trustedAttempt(i.attempts)?.decisions ?? [];
    return {
        schema: exports.RECEIPT_SCHEMA,
        mission_id: i.run.mission_id,
        created_at: new Date().toISOString(),
        denial_tested_at: 'promotion gate',
        statement: exports.STATEMENT,
        image: i.run.image,
        runtime: i.run.runtime,
        limits: i.run.limits,
        profile: i.run.profile,
        signing_keys_in_mounts: i.signingKeysInMounts,
        worker: i.run.worker,
        airlock: { inspected: i.inspected },
        attempts: i.attempts,
        artifacts: {
            promoted: final.filter((d) => d.decision.decision === 'promote').map((d) => ({ name: d.decision.name, sha256: d.decision.sha256 })),
            refused: final
                .filter((d) => d.decision.decision === 'refuse')
                .map((d) => ({ name: d.decision.name, sha256: d.decision.sha256, reasons: d.decision.reasons })),
        },
        trusted_store_after: [...i.trustedStoreAfter].sort(),
        destroy: { ...i.destroy, temp_dirs_deleted: i.cleanup.temp_dirs_deleted, temp_dirs_error: i.cleanup.error },
        revoke: { token_sha256: i.run.token_sha256, revoked: i.revoked, replay_after_revoke: i.replay },
        keys: { harness: i.harness, promoter: i.promoter },
        not_measured: [...exports.NOT_MEASURED_REQUIRED, ...(i.run.runtime.observed === 'runsc' ? [] : [exports.NOT_MEASURED_RUNSC])],
        passport: i.passport,
    };
}
/** The passport verifies under the harness key and matches what this receipt itself observed. */
function passportProblems(r) {
    if (!r.passport)
        return ['a v2 receipt with no passport'];
    const e = (0, passport_1.verifyPassport)(r.passport, r.keys.harness).map((x) => `passport: ${x}`);
    // The Guard policy has no other record in the receipt, so it is taken from the passport; everything else is recomputed.
    const again = (0, passport_1.buildPassport)(r, r.passport.passport.policy.value, r.keys.harness);
    for (const d of (0, passport_1.comparePassports)(again, r.passport.passport).drifts)
        if (d.status !== 'identical')
            e.push(`passport ${d.field} does not match the receipt`);
    return e;
}
function signReceipt(r, harnessKey) {
    return { receipt: r, signature: (0, install_key_1.signValue)(r, harnessKey) };
}
/** Every reason this receipt should not be believed. Empty means it verifies. */
function verifyReceipt(s, pins = {}) {
    const errors = [];
    try {
        const r = s.receipt;
        if (r.schema !== exports.RECEIPT_SCHEMA && r.schema !== exports.RECEIPT_SCHEMA_V1)
            errors.push(`unknown schema ${String(r.schema)}`);
        if (r.schema !== exports.RECEIPT_SCHEMA_V1)
            errors.push(...passportProblems(r));
        if (!(0, install_key_1.verifyValue)(r, r.keys.harness, s.signature))
            errors.push('harness signature does not verify over the receipt');
        if (pins.harness && r.keys.harness.fingerprint !== pins.harness)
            errors.push('harness key is not the pinned one');
        if (pins.promoter && r.keys.promoter.fingerprint !== pins.promoter)
            errors.push('promoter key is not the pinned one');
        if (r.keys.harness.fingerprint === r.keys.promoter.fingerprint)
            errors.push('promoter and harness share one key');
        const all = [...r.attempts.flatMap((a) => a.decisions), ...r.revoke.replay_after_revoke];
        for (const d of all) {
            if (!(0, promote_1.verifyDecision)(d, r.keys.promoter))
                errors.push(`decision ${d.decision.seq} (${d.decision.name}): promoter signature does not verify`);
        }
        // The profile, re-checked against the fixed rules. The receipt's own `all_ok` is not trusted.
        const checks = (0, mission_1.checkProfile)(r.profile.observed, { runtime: r.runtime.requested, limits: r.limits, imageEnv: r.image.env, mounts: mission_1.MOUNT_SHAPE });
        for (const c of checks.filter((x) => !x.ok))
            errors.push(`profile ${c.field}: expected ${JSON.stringify(c.expected)}, observed ${JSON.stringify(c.observed)}`);
        if (r.runtime.observed !== r.runtime.requested)
            errors.push(`runtime requested ${r.runtime.requested} but observed ${String(r.runtime.observed)}`);
        if (r.signing_keys_in_mounts !== false)
            errors.push('a signing key directory was mounted into the container');
        if (!r.destroy.container_removed)
            errors.push('container removal not proven');
        if (!r.destroy.temp_dirs_deleted)
            errors.push('mission temp dirs not deleted');
        if (!r.revoke.revoked)
            errors.push('mission token not revoked');
        const replay = r.revoke.replay_after_revoke;
        // One replay decision per inspected candidate: an empty outbox has nothing to replay.
        if (replay.length !== r.airlock.inspected.length || !replay.every((d) => d.decision.decision === 'refuse' && d.decision.reasons.includes(promote_1.REVOKED_REASON))) {
            errors.push('a replay after revocation was not refused for the revoked token');
        }
        if (!replay.every((d) => d.decision.token_sha256 === r.revoke.token_sha256))
            errors.push('replay used a different token than the revoked one');
        // Outcome consistency: the promoted list is exactly the trusted attempt's promote decisions, and the store holds only those.
        const final = trustedAttempt(r.attempts)?.decisions ?? [];
        const promotedShas = final.filter((d) => d.decision.decision === 'promote').map((d) => d.decision.sha256);
        const listed = r.artifacts.promoted.map((p) => p.sha256);
        if (JSON.stringify([...promotedShas].sort()) !== JSON.stringify([...listed].sort()))
            errors.push('promoted list does not match the signed promote decisions');
        if (JSON.stringify([...new Set(listed)].sort()) !== JSON.stringify(r.trusted_store_after))
            errors.push('trusted store holds something other than the promoted artifacts');
        for (const a of r.attempts.filter((x) => x !== trustedAttempt(r.attempts))) {
            if (a.decisions.some((d) => d.decision.decision === 'promote'))
                errors.push(`attempt "${a.label}" promoted something without the trusted approval`);
        }
        for (const m of exports.NOT_MEASURED_REQUIRED)
            if (!r.not_measured.includes(m))
                errors.push(`not_measured is missing: ${m}`);
        if (r.runtime.observed !== 'runsc' && !r.not_measured.includes(exports.NOT_MEASURED_RUNSC))
            errors.push(`not_measured is missing: ${exports.NOT_MEASURED_RUNSC}`);
        if (r.denial_tested_at !== 'promotion gate' || ![exports.STATEMENT, exports.RUN_STATEMENT].includes(r.statement))
            errors.push('statement or denial location changed');
        if (r.statement === exports.RUN_STATEMENT && !r.not_measured.includes(exports.NOT_MEASURED_CWD))
            errors.push(`not_measured is missing: ${exports.NOT_MEASURED_CWD}`);
    }
    catch (e) {
        errors.push(`malformed receipt (${e.message})`);
    }
    return { ok: errors.length === 0, errors };
}
/** The first-deliverable expectations: one benign artifact promoted; the canary candidate and the self-approval refused. */
function demoProblems(r) {
    const p = [];
    const refusedWhy = r.artifacts.refused.map((x) => x.reasons.join(' | '));
    if (r.artifacts.promoted.length !== 1)
        p.push(`expected exactly one promoted artifact, got ${r.artifacts.promoted.length}`);
    if (!refusedWhy.some((w) => /canary/.test(w)))
        p.push('no candidate was refused for carrying the canary');
    if (!refusedWhy.some((w) => /worker-written approval/.test(w)))
        p.push('the worker-written approval file was not refused');
    const self = r.attempts.find((a) => a.approval?.source === 'outbox');
    if (!self || !self.decisions.length || !self.decisions.every((d) => d.decision.reasons.some((x) => /self-approval/.test(x)))) {
        p.push('the self-approval from the outbox was not refused for every candidate');
    }
    if (!refusedWhy.some((w) => /held for human review/.test(w)))
        p.push('no proposed memory or tool config was held');
    return p;
}
