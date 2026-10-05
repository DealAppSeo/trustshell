"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditThenAct = auditThenAct;
const fs_1 = require("fs");
const path_1 = require("path");
const trustshell_1 = require("./trustshell");
function trustshellDir(dir) {
    if (dir)
        return dir;
    if (process.env.TRUSTSHELL_HOME)
        return process.env.TRUSTSHELL_HOME;
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return (0, path_1.join)(home, '.trustshell');
}
// ponytail: mirrors scripts/value-events.mjs's `{ ...data, ts, event }` line + 0700/0600 perms.
// Two writers on purpose — that script is device-only and unpublished (package files[] ships dist/
// only), this runs inside the published SDK. Keep the line schema identical; consolidate if they drift.
function appendIntentRow(intent, opts) {
    const line = JSON.stringify({
        origin: intent.origin,
        amount: intent.amount,
        cap: intent.cap,
        agentId: intent.agentId,
        ts: opts.now ?? new Date().toISOString(),
        event: 'intent',
    }) + '\n';
    if (opts.stream) {
        opts.stream.write(line);
        return;
    }
    const dir = trustshellDir(opts.dir);
    (0, fs_1.mkdirSync)(dir, { recursive: true, mode: 0o700 });
    try {
        (0, fs_1.chmodSync)(dir, 0o700);
    }
    catch { /* windows */ }
    const file = (0, path_1.join)(dir, 'value-events.jsonl');
    (0, fs_1.appendFileSync)(file, line, { mode: 0o600 });
    try {
        (0, fs_1.chmodSync)(file, 0o600);
    }
    catch { /* windows */ }
}
/**
 * Audit before act. Record the intent row FIRST (so the attempt is on the device log whether or not
 * it proceeds), THEN require a policy, THEN run `act`. A missing (`undefined`/`null`) policy throws
 * `policy_required` before `act` is ever called — a spend with no policy behind it does not run.
 * `{ allow: false }` throws `policy_denied`. Same fail-closed posture as the cap and the origin.
 *
 * Wrap `buildX402Payment` / `executeA2A` with this at the spend boundary.
 */
async function auditThenAct(intent, policy, act, opts = {}) {
    appendIntentRow(intent, opts);
    if (policy === null || policy === undefined) {
        throw new trustshell_1.TrustShellError('policy_required: spend intent has no policy (fail-closed — missing policy refuses)', 403);
    }
    if (!policy.allow) {
        throw new trustshell_1.TrustShellError(`policy_denied: ${policy.reason ?? 'policy did not admit this spend'}`, 403);
    }
    return act();
}
