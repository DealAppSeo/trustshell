"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRIFT_CLASS = exports.NOT_PROVEN = exports.ATTESTATION_SOURCE = exports.PASSPORT_SCHEMA = void 0;
exports.supervisorPolicy = supervisorPolicy;
exports.buildPassport = buildPassport;
exports.signPassport = signPassport;
exports.verifyPassport = verifyPassport;
exports.comparePassports = comparePassports;
const guardrails_1 = require("../lib/guardrails");
const install_key_1 = require("../lib/install-key");
const jcs_1 = require("../lib/jcs");
const mission_1 = require("./mission");
exports.PASSPORT_SCHEMA = 'trustshell.trustmedic-passport/v0';
exports.ATTESTATION_SOURCE = 'supervisor:docker-inspect';
exports.NOT_PROVEN = 'A matching passport means the supervisor measured the same configuration twice. It does not prove that the ' +
    "worker's reasoning, outputs or memory are safe, and it says nothing about what ran inside the container.";
/** The Guard policy in the supervisor's home, named by policySha256. Never a file from the mission. */
function supervisorPolicy(home) {
    const p = (0, guardrails_1.loadPolicy)(home);
    return p.state === 'ok' ? { state: 'ok', sha256: p.sha256 } : { state: p.state, sha256: null };
}
function buildPassport(r, policy, harness) {
    const o = r.profile.observed;
    const manifest = {
        commands: [r.worker.command],
        // Destinations and modes only: host-side sources are per-run temp paths.
        mounts: o.Mounts.map((m) => ({ destination: m.Destination, rw: m.RW })).sort((a, b) => (String(a.destination) < String(b.destination) ? -1 : 1)),
        network: o.NetworkMode,
        limits: { pids: o.PidsLimit, memory: o.Memory, memory_swap: o.MemorySwap, nano_cpus: o.NanoCpus, timeout_ms: r.limits.timeoutMs },
    };
    const granted = new Set(mission_1.MOUNT_SHAPE.map((m) => m.destination));
    return {
        schema: exports.PASSPORT_SCHEMA,
        mission: { value: { mission_id: r.mission_id }, source: 'supervisor:mission id it generated' },
        identity: { value: { kind: 'sandbox-worker', program_sha256: (0, jcs_1.jcsSha256)(r.worker.command) }, source: 'supervisor:docker-create arguments (worker command)' },
        model_build: {
            value: { image_ref: r.image.ref, pinned_digest: r.image.pinned_digest, image_id: r.image.id, pin_in_repo_digests: r.image.repo_digests.some((d) => d.endsWith(`@${r.image.pinned_digest}`)) },
            source: 'supervisor:docker-image-inspect of the pinned digest',
        },
        tool_belt: { value: { manifest, manifest_sha256: (0, jcs_1.jcsSha256)(manifest) }, source: 'supervisor:docker-inspect (Mounts, NetworkMode, limits) + docker-create command + wall-clock limit' },
        permissions: { value: { user: o.User, cap_drop: o.CapDrop, cap_add: o.CapAdd, privileged: o.Privileged, security_opt: o.SecurityOpt }, source: exports.ATTESTATION_SOURCE },
        policy: { value: policy, source: 'supervisor:Guard policy file in the supervisor home (policySha256)' },
        isolation: { value: { readonly_rootfs: o.ReadonlyRootfs, tmpfs: o.Tmpfs }, source: exports.ATTESTATION_SOURCE },
        runtime: { value: { requested: r.runtime.requested, observed: r.runtime.observed }, source: 'supervisor:docker-inspect HostConfig.Runtime' },
        // The mission is granted no memory: a mount beyond input, outbox and token would make this unknown.
        trusted_memory: { value: { version: o.Mounts.every((m) => granted.has(String(m.Destination))) ? 'none' : 'unknown' }, source: 'supervisor:docker-inspect Mounts' },
        deployment: { value: { docker_server_version: r.runtime.docker_server_version }, source: 'supervisor:docker version' },
        attestation: { value: { source: exports.ATTESTATION_SOURCE, harness_key_fingerprint: harness.fingerprint }, source: 'supervisor:harness key' },
        not_proven: exports.NOT_PROVEN,
    };
}
function signPassport(p, harnessKey) {
    return { passport: p, sha256: (0, jcs_1.jcsSha256)(p), signature: (0, install_key_1.signValue)(p, harnessKey) };
}
/** Every reason this signed passport should not be believed. Empty means it verifies against `harness`. */
function verifyPassport(s, harness) {
    const e = [];
    try {
        if (s.passport.schema !== exports.PASSPORT_SCHEMA)
            e.push(`unknown passport schema ${String(s.passport.schema)}`);
        if ((0, jcs_1.jcsSha256)(s.passport) !== s.sha256)
            e.push('digest does not match the passport');
        if (!(0, install_key_1.verifyValue)(s.passport, harness, s.signature))
            e.push('harness signature does not verify over the passport');
        if (s.passport.attestation?.value?.harness_key_fingerprint !== harness.fingerprint)
            e.push('the passport names a different harness key');
    }
    catch (x) {
        e.push(`malformed passport (${x.message})`);
    }
    return e;
}
/** Severity of a change per field. A field not listed here (unknown, added) requalifies. */
exports.DRIFT_CLASS = {
    schema: 'requalify',
    mission: 'ignored',
    identity: 'requalify',
    model_build: 'requalify',
    tool_belt: 'requalify',
    permissions: 'requalify',
    policy: 'requalify',
    isolation: 'requalify',
    runtime: 'requalify',
    trusted_memory: 'requalify',
    deployment: 'review',
    attestation: 'review',
    not_proven: 'review',
};
/** Field-by-field drift between two passports (value and source both count). */
function comparePassports(a, b) {
    const A = a;
    const B = b;
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const drifts = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort().map((field) => {
        const cls = exports.DRIFT_CLASS[field] ?? 'requalify';
        if (!has(A, field) || !has(B, field))
            return { field, status: 'missing', class: cls, a: A[field] ?? null, b: B[field] ?? null };
        return (0, jcs_1.canonicalize)(A[field]) === (0, jcs_1.canonicalize)(B[field]) ? { field, status: 'identical', class: cls } : { field, status: 'changed', class: cls, a: A[field], b: B[field] };
    });
    const live = drifts.filter((d) => d.status !== 'identical' && d.class !== 'ignored');
    return { verdict: live.some((d) => d.class === 'requalify') ? 'requalify' : live.length ? 'review' : 'match', drifts, not_proven: exports.NOT_PROVEN };
}
