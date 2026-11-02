"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Promoter = exports.REVOKED_REASON = exports.TRUSTED_APPROVAL_SOURCES = void 0;
exports.verifyDecision = verifyDecision;
/**
 * Promotion writer: the only thing that turns a quarantined candidate into a trusted artifact.
 *
 * It holds its OWN Ed25519 key (src/lib/install-key.ts) in a directory that is never mounted into a
 * mission container, and it signs every decision, promote or refuse. It does not trust the airlock's
 * verdict: for each candidate it re-reads the quarantine copy, re-hashes it, re-classifies it and
 * re-scans it for canaries. Promoted bytes land in the trusted store (`<store>/<sha256>`, read-only);
 * nothing else writes there.
 *
 * Refused, for every candidate in a request: a revoked mission token, a token that is not the one
 * registered for the mission, no approval, an approval that claims the worker's identity, an approval
 * that did not come from the trusted side (e.g. from the outbox). Refused per candidate: anything without
 * a quarantine copy, a copy whose hash changed, a canary, a worker-written approval or policy, a tool
 * config or proposed memory (held for a human), anything the approval does not name.
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const install_key_1 = require("../lib/install-key");
const airlock_1 = require("./airlock");
/** The only approval source the gate accepts. An approval read from a worker's outbox is never trusted. */
exports.TRUSTED_APPROVAL_SOURCES = ['trusted-harness'];
exports.REVOKED_REASON = 'mission token revoked';
const SHA = /^[0-9a-f]{64}$/;
class Promoter {
    constructor(o) {
        this.o = o;
        this.missions = new Map();
        this.seq = 0;
        const k = (0, install_key_1.signingKey)(o.keyDir);
        this.key = k.key;
        this.signer = k.signer;
        (0, node_fs_1.mkdirSync)(o.stateDir, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(o.storeDir, { recursive: true, mode: 0o755 });
    }
    get revocationFile() {
        return (0, node_path_1.join)(this.o.stateDir, 'revoked-tokens.json');
    }
    /** Revoked token hashes, from disk, so a restarted promoter still refuses them. */
    revoked() {
        if (!(0, node_fs_1.existsSync)(this.revocationFile))
            return [];
        const v = JSON.parse((0, node_fs_1.readFileSync)(this.revocationFile, 'utf8'));
        if (!Array.isArray(v))
            throw new Error('revocation list is not an array');
        return v.map(String);
    }
    revoke(tokenSha256) {
        const list = this.revoked();
        if (!list.includes(tokenSha256))
            list.push(tokenSha256);
        (0, node_fs_1.writeFileSync)(this.revocationFile, JSON.stringify(list), { mode: 0o600 });
    }
    registerMission(missionId, tokenSha256) {
        if (this.revoked().includes(tokenSha256))
            throw new Error('cannot register a revoked token');
        this.missions.set(missionId, tokenSha256);
    }
    decide(req) {
        const tokenSha = (0, airlock_1.sha256hex)(req.token);
        const gate = [];
        if (this.revoked().includes(tokenSha))
            gate.push(exports.REVOKED_REASON);
        if (this.missions.get(req.mission_id) !== tokenSha)
            gate.push('token is not the one registered for this mission');
        const a = req.approval;
        if (!a)
            gate.push('no approval');
        else {
            if (a.approver === req.worker_identity || a.approver.startsWith('mission:'))
                gate.push('approval claims the worker identity (self-approval)');
            if (!exports.TRUSTED_APPROVAL_SOURCES.includes(a.source))
                gate.push(`approval came from "${a.source}", not the trusted side`);
        }
        return req.candidates.map((c) => {
            const d = this.decideOne(req, c, tokenSha, gate);
            return { decision: d, signature: (0, install_key_1.signValue)(d, this.key) };
        });
    }
    decideOne(req, c, tokenSha, gate) {
        const reasons = [...gate];
        const sha = c.sha256 && SHA.test(c.sha256) ? c.sha256 : null;
        let body = null;
        if (c.status !== 'quarantined' || !sha) {
            reasons.push(`no quarantine copy (airlock: ${c.reasons.join('; ') || 'refused'})`);
        }
        else {
            const q = (0, node_path_1.join)(this.o.quarantineDir, sha);
            body = (0, node_fs_1.existsSync)(q) ? (0, node_fs_1.readFileSync)(q) : null;
            if (!body)
                reasons.push('quarantine copy missing');
            else {
                if ((0, airlock_1.sha256hex)(body) !== sha)
                    reasons.push('quarantine copy does not match its hash');
                const cls = (0, airlock_1.classify)(c.name, body);
                if (airlock_1.HELD_CLASSES.includes(cls))
                    reasons.push(`${cls} is held for human review, never auto-promoted`);
                if (airlock_1.REFUSED_CLASSES.includes(cls))
                    reasons.push(`worker-written ${cls}`);
                const hit = (0, airlock_1.canaryHit)(body, this.o.canaries);
                if (hit >= 0)
                    reasons.push(`contains registered canary #${hit}`);
            }
            if (req.approval && !req.approval.approved_sha256.includes(sha))
                reasons.push('not named in the approval');
        }
        if (reasons.length === 0 && body && sha) {
            try {
                (0, node_fs_1.writeFileSync)((0, node_path_1.join)(this.o.storeDir, sha), body, { flag: 'wx', mode: 0o444 });
            }
            catch (e) {
                const p = (0, node_path_1.join)(this.o.storeDir, sha);
                if (e.code !== 'EEXIST' || (0, airlock_1.sha256hex)((0, node_fs_1.readFileSync)(p)) !== sha)
                    reasons.push('trusted store write failed');
            }
        }
        return {
            mission_id: req.mission_id,
            seq: ++this.seq,
            name: c.name,
            sha256: c.sha256,
            decision: reasons.length === 0 ? 'promote' : 'refuse',
            reasons,
            token_sha256: tokenSha,
            approver: req.approval?.approver ?? null,
            at: new Date().toISOString(),
        };
    }
}
exports.Promoter = Promoter;
function verifyDecision(sd, promoter) {
    return (0, install_key_1.verifyValue)(sd.decision, promoter, sd.signature);
}
