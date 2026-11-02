"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SANDBOX_USAGE = exports.missionDir = void 0;
exports.runSandboxed = runSandboxed;
exports.promoteMission = promoteMission;
exports.sandboxCli = sandboxCli;
/**
 * `trustshell run --sandbox` and `trustshell sandbox promote` (C2 in docs/CONTAINMENT_MATRIX.md).
 *
 * After Guard has ALLOWED the command (src/cli/guard.ts decides first, exactly as for a plain run), this starts it
 * in the disposable mission container of mission.ts, the same runner the sandbox CLI uses: the current directory
 * bound READ-ONLY as the input (the command starts there), one outbox, no network, the hardened profile read back
 * before start, limits, the image's environment only. The container is destroyed and proven gone; the outbox goes
 * through the airlock into a per-mission quarantine under the TrustShell home; the mission dirs are deleted.
 * NOTHING is promoted here. Promotion is the owner's separate step, `trustshell sandbox promote <mission>`: the
 * promotion writer (its own key) decides, the mission token is revoked, a replay is refused, and the receipt is
 * signed by the harness key. Its terminal output is hashed, never shown: only files in the outbox come home.
 *
 *   <home>/sandbox/keys-harness, keys-promoter   two keys, never mounted (a cwd that holds the home is refused)
 *   <home>/sandbox/promoter-state                revoked mission tokens
 *   <home>/sandbox/missions/<id>/                quarantine/, passport.json, pending.json (holds the token,
 *                                                deleted on promote), then trusted-store/, receipt.json,
 *                                                public-keys.json
 */
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const guardrails_1 = require("../lib/guardrails");
const install_key_1 = require("../lib/install-key");
const airlock_1 = require("./airlock");
const mission_1 = require("./mission");
const passport_1 = require("./passport");
const promote_1 = require("./promote");
const receipt_1 = require("./receipt");
const keyDirs = (home) => ({ harness: (0, node_path_1.join)(home, 'sandbox', 'keys-harness'), promoter: (0, node_path_1.join)(home, 'sandbox', 'keys-promoter') });
const missionDir = (home, id) => (0, node_path_1.join)(home, 'sandbox', 'missions', id);
exports.missionDir = missionDir;
const MISSION_ID = /^[a-f0-9]{16}$/;
/** Is `p` the directory `dir` or inside it? */
function within(dir, p) {
    const r = (0, node_path_1.relative)(dir, p);
    return r === '' || (!r.startsWith('..') && !(0, node_path_1.isAbsolute)(r));
}
/**
 * The first TrustShell signing-key directory (<home>/sandbox/keys-harness|keys-promoter) nested inside `dir`, or null.
 * The active-home / ~/.trustshell checks in runSandboxed miss a SECOND home left inside the cwd; a read-only mount of
 * the cwd would then expose that home's keys to the worker (Grok, #668).
 * ponytail: bounded depth-6 scan skipping node_modules/.git; a key dir nested deeper or inside those slips. Realistic
 * homes sit at <cwd>/.trustshell/sandbox or <cwd>/sandbox.
 */
function keysUnder(dir, maxDepth = 6) {
    const SKIP = new Set(['node_modules', '.git']);
    const KEY_SUBPATHS = [(0, node_path_1.join)('sandbox', 'keys-harness'), (0, node_path_1.join)('sandbox', 'keys-promoter')];
    const walk = (d, depth) => {
        for (const sub of KEY_SUBPATHS)
            if ((0, node_fs_1.existsSync)((0, node_path_1.join)(d, sub)))
                return (0, node_path_1.join)(d, sub);
        if (depth >= maxDepth)
            return null;
        let entries;
        try {
            entries = (0, node_fs_1.readdirSync)(d, { withFileTypes: true });
        }
        catch {
            return null;
        }
        for (const e of entries) {
            if (!e.isDirectory() || SKIP.has(e.name))
                continue;
            const hit = walk((0, node_path_1.join)(d, e.name), depth + 1);
            if (hit)
                return hit;
        }
        return null;
    };
    return walk(dir, 0);
}
/** Run `command` in a mission container with `cwd` as its read-only input. Throws MissionRefused if nothing started. */
function runSandboxed(o, exec = mission_1.nodeExec) {
    const home = (0, node_path_1.resolve)(o.home);
    const cwd = (0, node_fs_1.realpathSync)(o.cwd);
    // The active home and the default one: either holds keys (this install's, the harness's, the promoter's).
    for (const h of [home, (0, node_path_1.join)((0, node_os_1.homedir)(), '.trustshell')]) {
        const real = (0, node_fs_1.existsSync)(h) ? (0, node_fs_1.realpathSync)(h) : h;
        if (within(cwd, real) || within(real, cwd)) {
            throw new mission_1.MissionRefused(`the current directory ${cwd} holds or is inside the TrustShell home ${real}, whose keys must never be mounted. Run from a project directory.`);
        }
    }
    const nestedKeys = keysUnder(cwd);
    if (nestedKeys) {
        throw new mission_1.MissionRefused(`the current directory ${cwd} contains TrustShell signing keys (${nestedKeys}), which must never be mounted into the container. Move that TrustShell home out of the directory, or run from one that holds none.`);
    }
    const policy = (0, passport_1.supervisorPolicy)(home); // measured as the mission starts
    const missionId = (0, node_crypto_1.randomBytes)(8).toString('hex');
    const { run, token } = (0, mission_1.runMission)({ baseDir: (0, node_os_1.tmpdir)(), missionId, runtime: o.runtime, command: o.command, inputFiles: {}, inputDir: cwd }, exec);
    try {
        // Destroy first: the outbox is read only after nothing can write to it.
        const destroy = (0, mission_1.destroyContainer)(run.container_id, exec);
        if (!destroy.container_removed)
            throw new Error(`container ${run.container_id} was not proven removed, so its outbox was not read`);
        const dir = (0, exports.missionDir)(home, missionId);
        (0, node_fs_1.mkdirSync)(dir, { recursive: true, mode: 0o700 });
        const inspected = (0, airlock_1.inspectOutbox)(run.paths.outbox, (0, node_path_1.join)(dir, 'quarantine'), { ...airlock_1.DEFAULT_AIRLOCK, canaries: [] });
        const cleanup = (0, mission_1.deleteMissionDirs)(run.paths);
        const keys = keyDirs(home);
        const signingKeysInMounts = run.profile.observed.Mounts.some((m) => !!m.Source && (within(keys.harness, m.Source) || within(keys.promoter, m.Source)));
        const harness = (0, install_key_1.signingKey)(keys.harness);
        const passport = (0, passport_1.signPassport)((0, passport_1.buildPassport)(run, policy, harness.signer), harness.key);
        const passportPath = (0, node_path_1.join)(dir, 'passport.json');
        (0, node_fs_1.writeFileSync)(passportPath, JSON.stringify(passport, null, 2) + '\n', { mode: 0o644 });
        const pending = { run, token, inspected, destroy, cleanup, signing_keys_in_mounts: signingKeysInMounts, passport };
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, 'pending.json'), JSON.stringify(pending, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        return { mission_id: missionId, exit_code: run.worker.exit_code, timed_out: run.worker.timed_out, candidates: inspected, passport_path: passportPath };
    }
    finally {
        (0, mission_1.deleteMissionDirs)(run.paths); // the input is the caller's directory and is never under the mission root
    }
}
/** The owner's step: promote what the airlock quarantined, revoke the token, sign the receipt. Once per mission. */
function promoteMission(home, id) {
    const dir = (0, exports.missionDir)((0, node_path_1.resolve)(home), id);
    const receiptPath = (0, node_path_1.join)(dir, 'receipt.json');
    if ((0, node_fs_1.existsSync)(receiptPath))
        throw new mission_1.MissionRefused(`mission ${id} was already promoted: ${receiptPath}`);
    const pendingPath = (0, node_path_1.join)(dir, 'pending.json');
    if (!(0, node_fs_1.existsSync)(pendingPath))
        throw new mission_1.MissionRefused(`no pending mission ${id} under ${(0, node_path_1.join)((0, node_path_1.resolve)(home), 'sandbox', 'missions')}`);
    const p = JSON.parse((0, node_fs_1.readFileSync)(pendingPath, 'utf8'));
    const keys = keyDirs((0, node_path_1.resolve)(home));
    const harness = (0, install_key_1.signingKey)(keys.harness);
    const store = (0, node_path_1.join)(dir, 'trusted-store');
    const promoter = new promote_1.Promoter({ keyDir: keys.promoter, stateDir: (0, node_path_1.join)((0, node_path_1.resolve)(home), 'sandbox', 'promoter-state'), quarantineDir: (0, node_path_1.join)(dir, 'quarantine'), storeDir: store, canaries: [] });
    try {
        promoter.registerMission(id, p.run.token_sha256);
    }
    catch (e) {
        throw new mission_1.MissionRefused(`mission ${id}: ${e.message}`);
    }
    const approval = {
        approver: 'owner:trustshell sandbox promote',
        source: 'trusted-harness',
        approved_sha256: p.inspected.flatMap((c) => (c.status === 'quarantined' && c.sha256 ? [c.sha256] : [])),
    };
    const req = { mission_id: id, token: p.token, worker_identity: `mission:${id}`, candidates: p.inspected, approval };
    const attempts = [{ label: 'the owner ran trustshell sandbox promote; the approval names every quarantined candidate', approval, decisions: promoter.decide(req) }];
    promoter.revoke(p.run.token_sha256);
    const replay = promoter.decide(req);
    const receipt = (0, receipt_1.buildReceipt)({
        run: p.run,
        passport: p.passport,
        signingKeysInMounts: p.signing_keys_in_mounts,
        inspected: p.inspected,
        attempts,
        trustedStoreAfter: (0, node_fs_1.existsSync)(store) ? (0, node_fs_1.readdirSync)(store) : [],
        destroy: p.destroy,
        cleanup: p.cleanup,
        revoked: promoter.revoked().includes(p.run.token_sha256),
        replay,
        harness: harness.signer,
        promoter: promoter.signer,
    });
    receipt.statement = receipt_1.RUN_STATEMENT;
    receipt.not_measured.push(receipt_1.NOT_MEASURED_CWD);
    const signed = (0, receipt_1.signReceipt)(receipt, harness.key);
    (0, node_fs_1.writeFileSync)(receiptPath, JSON.stringify(signed, null, 2) + '\n', { flag: 'wx' });
    const keysPath = (0, node_path_1.join)(dir, 'public-keys.json');
    (0, node_fs_1.writeFileSync)(keysPath, JSON.stringify({ harness: harness.signer, promoter: promoter.signer }, null, 2) + '\n');
    (0, node_fs_1.rmSync)(pendingPath); // the mission token goes with it
    return {
        receipt_path: receiptPath,
        keys_path: keysPath,
        store,
        promoted: receipt.artifacts.promoted.map((a) => ({ name: a.name, sha256: String(a.sha256), path: (0, node_path_1.join)(store, String(a.sha256)) })),
        refused: receipt.artifacts.refused.map((a) => ({ name: a.name, reasons: a.reasons })),
        verify: (0, receipt_1.verifyReceipt)(signed),
    };
}
exports.SANDBOX_USAGE = 'trustshell sandbox promote <mission> [--json]   (the owner step after trustshell run --sandbox)';
/** `trustshell sandbox promote <mission>`. */
function sandboxCli(argv, io, env = process.env) {
    const json = argv.includes('--json');
    const words = argv.filter((a) => a !== '--json');
    if (words[0] === '--help' || words[0] === '-h') {
        io.out(exports.SANDBOX_USAGE);
        return 0;
    }
    if (words[0] !== 'promote' || words.length !== 2 || !MISSION_ID.test(words[1])) {
        io.err(`error: sandbox takes promote and a mission id (16 hex characters)\n${exports.SANDBOX_USAGE}`);
        return 2;
    }
    let r;
    try {
        r = promoteMission((0, guardrails_1.trustshellHome)(env), words[1]);
    }
    catch (e) {
        io.err(e instanceof mission_1.MissionRefused ? `REFUSED: ${e.message}` : `ERROR: ${e.message}`);
        return e instanceof mission_1.MissionRefused ? 3 : 1;
    }
    if (json)
        io.out(JSON.stringify(r, null, 2));
    else {
        io.out([
            `promoted ${r.promoted.length}, refused or held ${r.refused.length}; the mission token is revoked`,
            ...r.promoted.map((a) => `  promoted  ${a.name}  ->  ${a.path}`),
            ...r.refused.map((a) => `  refused   ${a.name}: ${a.reasons.join('; ')}`),
            `receipt   ${r.receipt_path} (${r.verify.ok ? 'verifies' : `DOES NOT VERIFY: ${r.verify.errors.join('; ')}`})`,
            `keys      ${r.keys_path}`,
        ].join('\n'));
    }
    return r.verify.ok ? 0 : 1;
}
