"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AUTONOMY = exports.READ_ONLY_COMMANDS = exports.START_LEVEL = exports.LEVEL_MEANS = exports.AUTONOMY_RECORD_SCHEMA = exports.AUTONOMY_FILE = void 0;
exports.parseAutonomy = parseAutonomy;
exports.levelAllows = levelAllows;
exports.readAutonomy = readAutonomy;
exports.levelState = levelState;
exports.appendAutonomy = appendAutonomy;
exports.evidenceFromRecordFile = evidenceFromRecordFile;
exports.recordAutonomyEvent = recordAutonomyEvent;
exports.measured = measured;
/**
 * AUTONOMY LEVELS, SHADOW FIRST: an agent's autonomy under Guard rises with checked evidence and falls on incidents.
 * ------------------------------------------------------------------------------------------------------------
 * OFF unless the owner policy has an `autonomy` block (`trustshell guard level shadow` writes one). The block is
 * inside `policy`, so the owner's signature covers it and every change to it is a recorded policy change.
 *   mode "shadow"   the default. The level is computed and recorded; Guard allows exactly what the policy allows,
 *                   and nothing in here can stop an action (a failure is swallowed and the decision stands).
 *   mode "enforce"  an explicit owner opt-in. The level can also refuse, and fails closed. It only ever NARROWS the
 *                   policy: a level never allows an action the policy does not list, and the spend caps still bind.
 *
 * LEVELS, as presets over the request classes the guard already has (`--class` is the caller's label, as everywhere
 * in the guard):
 *   L0 observe     nothing starts
 *   L1 read-only   class read, and the trustshell commands that only read (READ_ONLY_COMMANDS)
 *   L2 workspace   L1, and class other: commands that change local files. The guard does not see where they write.
 *   L3 broader     L2, and post and spend, under the policy's spend caps
 * Every agent starts at L1.
 *
 * PROMOTION, one level: `promote_after` Inspect records (`trustshell check <runUrl> --claims-file <f> --out <dir>`)
 * whose EVERY claim is SUPPORTED on a complete run, since the last level change. One record per run, and one commit
 * counts once, ever: re-running a workflow, or a second workflow on the same commit, does not count twice. A record
 * with any NOT_CHECKED claim counts for nothing: NOT_CHECKED never promotes.
 * DEMOTION: one level on an Inspect record with a CONTRADICTED claim, or on a Guard refusal of an out-of-lane attempt
 * (an action the policy does not list, a `run` whose executable is not the named tool, a command always denied, and
 * under enforce, what the level does not allow). To L0 on owner revocation (`guard level revoke`, `guard kill`).
 * A demotion at L0 stays at L0 and starts the count again. Expiry, an over-cap amount or a broken policy file are the
 * owner's state, not the agent's attempt, and are not incidents. In shadow the level falls only on what actually
 * happened; a refusal the level WOULD have made is measured, not counted.
 * Every change is its own hashed record in `autonomy.jsonl`, with the reason.
 *
 * MEASUREMENT: every Guard decision under an autonomy block writes a `would-be` record beside it: what the policy
 * alone decided (fixed autonomy) and what the policy and the level together would decide (earned autonomy). That is
 * the data for a question no published study has measured (hyperdag-protocol docs/WHY.md §2): does autonomy earned
 * from checked records reduce harmful actions compared with fixed autonomy? Nothing here answers it yet.
 *
 * WHAT THIS IS NOT. Local guardrails for cooperative agents, not a security boundary. Anything running as you can
 * edit the policy, edit or delete `autonomy.jsonl`, or hand `guard level record` a record.json it made up: an Inspect
 * record is unsigned, and its digest shows it was not edited, not who made it. A record counts for the policy's
 * subject because whoever ran `guard level record` said it was that agent's. The level is per host: bundles do not
 * carry `autonomy.jsonl`. The chain is unkeyed, like the guard's.
 */
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
const action_evidence_1 = require("./action-evidence");
exports.AUTONOMY_FILE = 'autonomy.jsonl';
exports.AUTONOMY_RECORD_SCHEMA = 'trustshell.autonomy-record/0.1-draft';
exports.LEVEL_MEANS = [
    'L0 observe: nothing starts',
    'L1 read-only: class read, and the trustshell commands that only read (ground, inspect, recall, report, traps)',
    'L2 workspace: L1, and class other, the commands that change local files (the guard does not see where they write)',
    "L3 broader: L2, and post and spend, under the policy's spend caps",
];
/** Every agent starts here. L0 is where revocation puts it. */
exports.START_LEVEL = 1;
/** trustshell commands that only read: L1 lets these start. A `run` names an executable, so it is never one of these. */
exports.READ_ONLY_COMMANDS = ['ground', 'inspect', 'recall', 'report', 'traps'];
exports.DEFAULT_AUTONOMY = { mode: 'shadow', promote_after: { L1: 3, L2: 5, L3: 10 } };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** PURE. The `autonomy` block of a policy, as strictly as the rest of it: unknown keys and missing ones are errors. */
function parseAutonomy(v) {
    if (!isObject(v))
        return { ok: false, errors: ['autonomy must be { mode, promote_after }'] };
    const errors = Object.keys(v)
        .filter((k) => k !== 'mode' && k !== 'promote_after')
        .map((k) => `autonomy: unknown field "${k.slice(0, 40)}"`);
    if (v.mode !== 'shadow' && v.mode !== 'enforce')
        errors.push('autonomy.mode must be shadow or enforce');
    const p = v.promote_after;
    const n = (x) => Number.isSafeInteger(x) && x >= 1 && x <= 10000;
    if (!isObject(p) || Object.keys(p).sort().join() !== 'L1,L2,L3' || !n(p.L1) || !n(p.L2) || !n(p.L3)) {
        errors.push('autonomy.promote_after must be { L1, L2, L3 }, each a whole number from 1 to 10000');
    }
    if (errors.length)
        return { ok: false, errors };
    const q = p;
    return { ok: true, config: { mode: v.mode, promote_after: { L1: q.L1, L2: q.L2, L3: q.L3 } } };
}
/** PURE. Whether a level lets this request start. The policy is weighed separately, and both must allow it. */
function levelAllows(level, req) {
    if (req.class === 'spend' || req.class === 'post')
        return level >= 3;
    if (req.class === 'other')
        return level >= 2 || (level === 1 && req.executable === undefined && exports.READ_ONLY_COMMANDS.includes(req.tool));
    return level >= 1;
}
/** PURE. Check every hash and link of `autonomy.jsonl`, the guard ledger's way. */
function readAutonomy(text) {
    const records = [];
    const breaks = [];
    let prev = null;
    text
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .forEach((line, i) => {
        const n = i + 1;
        let r;
        try {
            r = JSON.parse(line);
        }
        catch {
            breaks.push(`line ${n}: not JSON`);
            return;
        }
        const { hash, ...body } = r;
        let want = null;
        try {
            want = (0, jcs_1.jcsSha256)(body);
        }
        catch {
            /* not canonicalizable: a break below */
        }
        if (r.schema !== exports.AUTONOMY_RECORD_SCHEMA)
            breaks.push(`line ${n}: schema is not ${exports.AUTONOMY_RECORD_SCHEMA}`);
        if (want === null || hash !== want)
            breaks.push(`line ${n}: hash does not match the record`);
        if (r.prev !== prev)
            breaks.push(`line ${n}: prev does not match the line before`);
        if (r.seq !== n)
            breaks.push(`line ${n}: seq is ${r.seq}`);
        prev = typeof hash === 'string' ? hash : null;
        records.push(r);
    });
    return { verdict: breaks.length ? 'BROKEN' : records.length ? 'INTACT' : 'EMPTY', records, breaks };
}
/** PURE. The level is the last change's `to`; the count is what came after it. A BROKEN record reads as L0. */
function levelState(reading, config) {
    if (reading.verdict === 'BROKEN') {
        return { level: 0, reason: `autonomy.jsonl is BROKEN (${reading.breaks[0]}), so the level is unknown and reads as L0`, supported: 0, needed: null, chain: 'BROKEN' };
    }
    let level = exports.START_LEVEL;
    let reason = `every agent starts at L${exports.START_LEVEL}`;
    let supported = 0;
    const counted = new Set();
    for (const r of reading.records) {
        if (r.kind === 'level-change') {
            level = r.to;
            reason = r.reason;
            supported = 0;
        }
        else if (r.kind === 'evidence' && r.outcome === 'SUPPORTED' && !counted.has(r.commit)) {
            counted.add(r.commit);
            supported += 1;
        }
    }
    const needed = level < 3 ? config.promote_after[`L${level + 1}`] : null;
    return { level, reason, supported, needed, chain: reading.verdict };
}
/** PURE. The level change an event causes, given the state with that event already counted. */
function change(s, ev) {
    if (s.chain === 'BROKEN')
        return null;
    const down = Math.max(0, s.level - 1);
    const stays = s.level === 0 ? ' (stays at L0; the count starts again)' : '';
    if (ev.kind === 'revocation')
        return { to: 0, reason: `the owner revoked it (${ev.via})` };
    if (ev.kind === 'incident')
        return { to: down, reason: `Guard refused an out-of-lane attempt, ${ev.action} (guard record ${ev.guard_record.seq})${stays}` };
    if (ev.kind !== 'evidence')
        return null;
    if (ev.outcome === 'CONTRADICTED')
        return { to: down, reason: `an Inspect record has a CONTRADICTED claim (${ev.run})${stays}` };
    if (ev.outcome === 'SUPPORTED' && s.needed !== null && s.supported >= s.needed) {
        return { to: (s.level + 1), reason: `${s.supported} Inspect records SUPPORTED in full, one per commit, since the last change, none CONTRADICTED (the last: ${ev.run})` };
    }
    return null;
}
/**
 * Append events to `autonomy.jsonl` in `dir`, each followed by the level change it causes, if any. The CALLER holds
 * the guard lock. `reading` is that file as the caller already read it.
 * ponytail: reads and verifies the whole file per guard decision, like the guard ledger before its checkpoint; add a
 * checkpoint (GUARD_CHECKPOINT_FILE's shape) when the would-be records make that measurable.
 */
function appendAutonomy(dir, fs, config, events, ts, reading) {
    const path = (0, node_path_1.join)(dir, exports.AUTONOMY_FILE);
    const r = reading ?? readAutonomy(fs.exists(path) ? fs.read(path) : '');
    const all = [...r.records];
    const added = [];
    const push = (ev) => {
        const last = all[all.length - 1];
        const body = { schema: exports.AUTONOMY_RECORD_SCHEMA, seq: (last?.seq ?? 0) + 1, ts, mode: config.mode, ...ev, prev: last?.hash ?? null };
        const rec = { ...body, hash: (0, jcs_1.jcsSha256)(body) };
        all.push(rec);
        added.push(rec);
    };
    for (const ev of events) {
        push(ev);
        const s = levelState({ ...r, records: all }, config);
        const c = change(s, ev);
        if (c)
            push({ kind: 'level-change', from: s.level, to: c.to, reason: c.reason });
    }
    fs.mkdirp(dir);
    fs.append(path, added.map((a) => (0, jcs_1.canonicalize)(a) + '\n').join(''));
    return added;
}
/**
 * PURE. An Inspect record, as `check --out` writes record.json (and `--json` prints): `{ record, digest }`. The digest
 * must match, and one outcome is drawn from it: CONTRADICTED if any claim is, SUPPORTED only when every claim is
 * SUPPORTED on a complete run (exit 0), and NOT_CHECKED otherwise.
 */
function evidenceFromRecordFile(text, subject) {
    const notOne = `not an Inspect record: expected { record, digest } with record.schema ${action_evidence_1.ACTION_EVIDENCE_SCHEMA}, as trustshell check <runUrl> --claims-file <path> --out <dir> writes record.json`;
    let raw;
    try {
        raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    }
    catch (e) {
        return { ok: false, error: `not JSON: ${e.message}` };
    }
    if (!isObject(raw) || !isObject(raw.record) || raw.record.schema !== action_evidence_1.ACTION_EVIDENCE_SCHEMA || !isObject(raw.digest))
        return { ok: false, error: notOne };
    const record = raw.record;
    const o = record.observation;
    const statuses = ['SUPPORTED', 'CONTRADICTED', 'NOT_CHECKED'];
    if (!isObject(o) ||
        !Array.isArray(record.claims) ||
        !record.claims.every((c) => isObject(c) && statuses.includes(c.status)) ||
        !isObject(o.check) ||
        ![o.url, o.owner, o.repo, o.head_sha].every((x) => typeof x === 'string' && x.length > 0)) {
        return { ok: false, error: notOne };
    }
    let sha;
    try {
        sha = (0, action_evidence_1.digestRecord)(record).value;
    }
    catch {
        return { ok: false, error: notOne };
    }
    if (raw.digest.value !== sha)
        return { ok: false, error: 'the digest does not match the record: it was changed after it was made' };
    const tally = (0, action_evidence_1.tallyClaims)(record.claims);
    const outcome = tally.CONTRADICTED > 0 ? 'CONTRADICTED' : (0, action_evidence_1.claimsExitCode)(record) === 0 ? 'SUPPORTED' : 'NOT_CHECKED';
    return {
        ok: true,
        event: { kind: 'evidence', subject, run: `${o.url}/attempts/${o.run_attempt ?? 'unknown'}`, commit: `${o.owner}/${o.repo}@${o.head_sha}`, record_sha256: sha, outcome, tally },
    };
}
/**
 * Record one piece of evidence or a revocation, under the guard lock. A run already recorded is refused, whatever
 * either outcome was: one record per run, so a run cannot be re-inspected with other claims until one counts.
 */
function recordAutonomyEvent(dir, fs, config, ev, ts = new Date().toISOString()) {
    const release = fs.lock(dir);
    try {
        const path = (0, node_path_1.join)(dir, exports.AUTONOMY_FILE);
        const reading = readAutonomy(fs.exists(path) ? fs.read(path) : '');
        if (ev.kind === 'evidence') {
            const dup = reading.records.find((r) => r.kind === 'evidence' && r.run === ev.run);
            if (dup)
                return { ok: false, error: `${ev.run} is already recorded (record ${dup.seq}): one record per run` };
        }
        const before = levelState(reading, config);
        const added = appendAutonomy(dir, fs, config, [ev], ts, reading);
        return { ok: true, added, before, after: levelState({ ...reading, records: [...reading.records, ...added] }, config) };
    }
    finally {
        release();
    }
}
/** What the would-be records measured so far: how often the level would have refused what the policy allowed. */
function measured(reading) {
    let decisions = 0;
    let fixedAllowed = 0;
    let earnedDenied = 0;
    for (const r of reading.records) {
        if (r.kind !== 'would-be')
            continue;
        decisions += 1;
        if (r.fixed === 'ALLOWED') {
            fixedAllowed += 1;
            if (r.earned === 'DENIED')
                earnedDenied += 1;
        }
    }
    return { decisions, fixed_allowed: fixedAllowed, earned_denied: earnedDenied };
}
