"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARD_DOES_NOT_COVER = exports.nodeGuardFs = exports.GUARD_LOCK_FILE = exports.GUARD_CHECKPOINT_FILE = exports.LOCAL_TOOLS = exports.TOOL_CLASSES = exports.GUARD_RECORD_SCHEMA = exports.GUARD_RECEIPTS_FILE = exports.SUGGESTED_POLICY_FILE = exports.POLICY_FILE = void 0;
exports.defaultPolicy = defaultPolicy;
exports.trustshellHome = trustshellHome;
exports.parsePolicy = parsePolicy;
exports.parsePolicyDocument = parsePolicyDocument;
exports.renderPolicyDocument = renderPolicyDocument;
exports.policySha256 = policySha256;
exports.policySignedBy = policySignedBy;
exports.actionFor = actionFor;
exports.decide = decide;
exports.recordHash = recordHash;
exports.readLedger = readLedger;
exports.readLedgerCheckpointed = readLedgerCheckpointed;
exports.loadPolicy = loadPolicy;
exports.appendRecord = appendRecord;
exports.guardDecide = guardDecide;
exports.homeShadowWarning = homeShadowWarning;
/**
 * GUARD: the owner's local policy, enforced in code before an action starts, with a record of every decision.
 * ---------------------------------------------------------------------------------------------------------
 * ONE POLICY LANGUAGE. `~/.trustshell/policy.json` (or TRUSTSHELL_HOME) holds `{ policy, signature }`, the
 * body shape of the engine kernel's signed owner policy (repid-engine src/kernel/policy.ts), and `policy` is a
 * SUBSET of the kernel's OwnerPolicy with the same names and the same meanings:
 *   subject                 the agent the policy is for
 *   actions                 spend | post | tool | tool:<name>. Anything unlisted is DENIED. `tool` allows every
 *                           read/other tool; `tool:<name>` allows one.
 *   per_tx_raw, daily_raw,  smallest units, canonical decimal strings. A limit the owner leaves out is "0",
 *   total_raw               never unlimited. The one that binds is the smallest.
 *   expires_at              unix seconds. At or after it, everything is denied.
 *   nonce                   supersession: revoking is writing a policy with a higher nonce (the kernel has no
 *                           revocation list either). `guard kill` writes one that allows nothing.
 * Not in the subset, because the local guard neither pays nor binds code: `owner` (a wallet), `payees`,
 * `authorized_impl_hashes`. The local hash is sha256 of the RFC 8785 form, not the kernel's EIP-712 digest.
 *
 * NO FILE = NOTHING AUTHORIZED for `trustshell run` (it refuses), and nothing changes for the other commands.
 * A FILE THAT DOES NOT PARSE DENIES EVERYTHING. A person who wrote a policy and broke it meant to be guarded.
 *
 * EVERY DECISION IS A RECORD (`trustshell.guard-record/1`), appended to `guard-receipts.jsonl` before the action
 * runs, hash-chained (RFC 8785 + sha256), with what was REQUESTED, what was AUTHORIZED (and under which policy
 * hash and nonce), what was EXECUTED, and the ASSURANCE SCOPE: what the guard mediated and what it did not. A
 * missing record never proves that no action happened: the guard sees only what goes through it.
 *
 * WHAT THIS IS NOT. Not a sandbox: anything running as you can edit these files or act without trustshell.
 * The chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch.
 */
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
const install_key_1 = require("./install-key");
exports.POLICY_FILE = 'policy.json';
/** An imported policy that could not be enforced (unsigned, or signed by a key nobody named) lands here. */
exports.SUGGESTED_POLICY_FILE = 'policy.suggested.json';
exports.GUARD_RECEIPTS_FILE = 'guard-receipts.jsonl';
exports.GUARD_RECORD_SCHEMA = 'trustshell.guard-record/1';
exports.TOOL_CLASSES = ['read', 'spend', 'post', 'other'];
/** The commands that only read or write local files: what `guard init` allows. */
exports.LOCAL_TOOLS = ['bundle', 'ground', 'init', 'inspect', 'learn', 'profile', 'quarantine', 'recall', 'redact', 'remember', 'report', 'traps'];
const ACTION = /^(spend|post|tool|tool:[A-Za-z0-9_.:-]{1,128})$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]{0,77})$/;
const POLICY_KEYS = ['subject', 'actions', 'per_tx_raw', 'daily_raw', 'total_raw', 'expires_at', 'nonce'];
const UINT256_MAX = BigInt('0x' + 'f'.repeat(64));
/** The policy `guard init` writes: local commands only, every limit 0, expires in `days` days. */
function defaultPolicy(nowS = Math.floor(Date.now() / 1000), days = 30) {
    return {
        subject: 'local',
        actions: exports.LOCAL_TOOLS.map((t) => `tool:${t}`),
        per_tx_raw: '0',
        daily_raw: '0',
        total_raw: '0',
        expires_at: nowS + days * 86400,
        nonce: '1',
    };
}
function trustshellHome(env = process.env, home = (0, node_os_1.homedir)()) {
    const o = env.TRUSTSHELL_HOME?.trim();
    return o ? o : (0, node_path_1.join)(home, '.trustshell');
}
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * PURE. Parse a policy the way the kernel's parsePolicy does: unknown keys are errors, a MISSING limit is "0"
 * (and listed in `defaulted`), a PRESENT malformed one is an error, never quietly zeroed.
 */
function parsePolicy(input) {
    if (!isObject(input))
        return { ok: false, errors: ['policy must be an object'] };
    const errors = [];
    for (const k of Object.keys(input))
        if (!POLICY_KEYS.includes(k))
            errors.push(`unknown field "${k.slice(0, 40)}"`);
    const subject = input.subject;
    if (typeof subject !== 'string' || subject.length === 0 || subject.length > 128)
        errors.push('subject must be the agent id (1-128 characters)');
    const actions = [];
    if (!Array.isArray(input.actions) || input.actions.length > 64)
        errors.push('actions must be a list of spend, post, tool or tool:<name>');
    else {
        for (const a of input.actions) {
            if (typeof a !== 'string' || !ACTION.test(a))
                errors.push('actions holds an entry that is not spend, post, tool or tool:<name>');
            else if (actions.includes(a))
                errors.push(`actions lists "${a.slice(0, 40)}" twice`);
            else
                actions.push(a);
        }
    }
    const defaulted = [];
    const limit = (k) => {
        const v = input[k];
        if (v === undefined || v === null) {
            defaulted.push(k);
            return '0';
        }
        const s = typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? String(v) : v;
        if (typeof s !== 'string' || !CANONICAL_UINT.test(s) || BigInt(s) > UINT256_MAX) {
            errors.push(`${k}: not a canonical non-negative decimal integer`);
            return '0';
        }
        return s;
    };
    const per = limit('per_tx_raw');
    const daily = limit('daily_raw');
    const total = limit('total_raw');
    const exp = input.expires_at;
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0)
        errors.push('expires_at must be unix seconds');
    const nonce = typeof input.nonce === 'number' && Number.isSafeInteger(input.nonce) && input.nonce >= 0 ? String(input.nonce) : input.nonce;
    if (typeof nonce !== 'string' || !CANONICAL_UINT.test(nonce))
        errors.push('nonce must be a non-negative decimal integer');
    if (errors.length)
        return { ok: false, errors };
    return {
        ok: true,
        defaulted,
        policy: { subject: subject, actions, per_tx_raw: per, daily_raw: daily, total_raw: total, expires_at: exp, nonce: nonce },
    };
}
/** PURE. Parse `{ policy, signature }` text. A signature that is present must be well formed (verified separately). */
function parsePolicyDocument(text) {
    let raw;
    try {
        raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    }
    catch (e) {
        return { ok: false, errors: [`not JSON: ${e.message}`] };
    }
    if (!isObject(raw))
        return { ok: false, errors: ['the file must be { policy, signature }'] };
    const extra = Object.keys(raw).filter((k) => k !== 'policy' && k !== 'signature');
    if (extra.length)
        return { ok: false, errors: extra.map((k) => `unknown field "${k.slice(0, 40)}"`) };
    const p = parsePolicy(raw.policy);
    if (!p.ok)
        return p;
    const s = raw.signature;
    if (s === null || s === undefined)
        return { ok: true, doc: { policy: p.policy, signature: null }, defaulted: p.defaulted };
    const sigOk = isObject(s) &&
        Object.keys(s).every((k) => ['alg', 'public_key', 'fingerprint', 'signature'].includes(k)) &&
        s.alg === 'ed25519' &&
        typeof s.public_key === 'string' &&
        typeof s.fingerprint === 'string' &&
        typeof s.signature === 'string';
    if (!sigOk)
        return { ok: false, errors: ['signature must be null or { alg: ed25519, public_key, fingerprint, signature }'] };
    return { ok: true, doc: { policy: p.policy, signature: s }, defaulted: p.defaulted };
}
function renderPolicyDocument(doc) {
    return JSON.stringify(doc, null, 2) + '\n';
}
/** sha256 of the RFC 8785 form of the policy: what records and bundles name it by. */
function policySha256(p) {
    return (0, jcs_1.jcsSha256)(p);
}
/** Does the signature verify over the policy, by a key whose fingerprint is one of `trusted`? */
function policySignedBy(doc, trusted) {
    const s = doc.signature;
    return !!s && trusted.includes(s.fingerprint) && (0, install_key_1.verifyValue)(doc.policy, s, s.signature);
}
/** The action string the policy must list for this request (the kernel's actionPermitted). */
function actionFor(req) {
    return req.class === 'spend' ? 'spend' : req.class === 'post' ? 'post' : `tool:${req.tool}`;
}
function permitted(actions, req) {
    if (req.class === 'spend')
        return actions.includes('spend');
    if (req.class === 'post')
        return actions.includes('post');
    return actions.includes('tool') || actions.includes(`tool:${req.tool}`);
}
/**
 * PURE. Weigh one request against the policy. `policy === null` is a file that did not parse: denied.
 * `spent` is what this ledger already ALLOWED today and in total; null means the ledger could not be
 * trusted (a broken chain), and then any amount is denied.
 */
function decide(policy, req, spent, nowS, problems = []) {
    if (!policy)
        return { decision: 'DENIED', reasons: [`the policy file does not parse, so everything is denied: ${problems.join('; ') || 'invalid'}`] };
    const reasons = [];
    if (nowS >= policy.expires_at)
        reasons.push(`the policy expired at ${new Date(policy.expires_at * 1000).toISOString()}`);
    if (!permitted(policy.actions, req))
        reasons.push(`the owner policy does not list ${actionFor(req)}`);
    if (req.amount_raw !== undefined) {
        if (!/^[1-9][0-9]{0,77}$/.test(req.amount_raw))
            reasons.push('the amount must be a whole number of smallest units, more than 0');
        else if (spent === null)
            reasons.push('the receipt ledger is BROKEN, so what was already spent is unknown and no amount is allowed');
        else {
            const amount = BigInt(req.amount_raw);
            const per = BigInt(policy.per_tx_raw);
            const dailyLeft = BigInt(policy.daily_raw) > spent.today ? BigInt(policy.daily_raw) - spent.today : BigInt(0);
            const totalLeft = BigInt(policy.total_raw) > spent.total ? BigInt(policy.total_raw) - spent.total : BigInt(0);
            if (amount > per)
                reasons.push(`${req.amount_raw} is over per_tx_raw ${policy.per_tx_raw}`);
            if (amount > dailyLeft)
                reasons.push(`${req.amount_raw} is over what daily_raw ${policy.daily_raw} leaves today (${dailyLeft})`);
            if (amount > totalLeft)
                reasons.push(`${req.amount_raw} is over what total_raw ${policy.total_raw} leaves (${totalLeft})`);
        }
    }
    return { decision: reasons.length ? 'DENIED' : 'ALLOWED', reasons };
}
function recordHash(r) {
    return (0, jcs_1.jcsSha256)(r);
}
const utcDay = (nowS) => new Date(nowS * 1000).toISOString().slice(0, 10);
function tally(r, day, s) {
    const a = r.kind === 'decision' && r.authorized?.decision === 'ALLOWED' ? r.requested?.amount_raw : undefined;
    if (typeof a !== 'string' || !/^[1-9][0-9]{0,77}$/.test(a))
        return s;
    const amount = BigInt(a);
    return { today: s.today + (String(r.ts).slice(0, 10) === day ? amount : BigInt(0)), total: s.total + amount };
}
/**
 * PURE. Check every hash and every link, and total the allowed amounts. `from` is the reading of an
 * already-verified prefix: the chain continues from its last hash.
 */
function readLedger(text, nowS = Math.floor(Date.now() / 1000), from) {
    const day = utcDay(nowS);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const breaks = [];
    const offset = from?.count ?? 0;
    let prev = from?.last?.hash ?? null;
    let spent = from?.spent ?? { today: BigInt(0), total: BigInt(0) };
    let last = from?.last ?? null;
    lines.forEach((line, i) => {
        const n = offset + i + 1;
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
            want = recordHash(body);
        }
        catch {
            /* not canonicalizable: a break below */
        }
        if (r.schema !== exports.GUARD_RECORD_SCHEMA)
            breaks.push(`line ${n}: schema is not ${exports.GUARD_RECORD_SCHEMA}`);
        if (want === null || hash !== want)
            breaks.push(`line ${n}: hash does not match the record`);
        if (r.prev !== prev)
            breaks.push(`line ${n}: prev does not match the line before`);
        if (r.seq !== n)
            breaks.push(`line ${n}: seq is ${r.seq}`);
        spent = tally(r, day, spent);
        prev = typeof hash === 'string' ? hash : null;
        last = { seq: n, hash: String(hash) };
    });
    const count = offset + lines.length;
    if (count === 0)
        return { verdict: 'EMPTY', count: 0, spent: { today: BigInt(0), total: BigInt(0) }, last: null, breaks };
    return breaks.length || from?.verdict === 'BROKEN'
        ? { verdict: 'BROKEN', count, spent: null, last, breaks }
        : { verdict: 'INTACT', count, spent, last, breaks };
}
/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes and fully verifies only the lines after them;
 * any change to the old bytes misses the cache and the whole ledger is verified again. Measured 2026-10-21
 * (lane B report, same-process A/B, 3 runs): at 10,000 records a full verification cost 541-593 ms per
 * decision, a checkpointed decision 236-284 ms; equal at 1,000. `guard show` always verifies every line.
 */
exports.GUARD_CHECKPOINT_FILE = 'guard-receipts.checkpoint.json';
const sha256 = (b) => (0, node_crypto_1.createHash)('sha256').update(b).digest('hex');
function readLedgerCheckpointed(text, checkpointText, nowS = Math.floor(Date.now() / 1000)) {
    try {
        const c = JSON.parse(checkpointText ?? 'null');
        const buf = Buffer.from(text, 'utf8');
        if (c && Number.isSafeInteger(c.bytes) && c.bytes <= buf.length && sha256(buf.subarray(0, c.bytes)) === c.sha256) {
            const day = utcDay(nowS);
            let prefix = { verdict: 'EMPTY', count: 0, spent: { today: BigInt(0), total: BigInt(0) }, last: null, breaks: [] };
            for (const line of buf.subarray(0, c.bytes).toString('utf8').split(/\r?\n/)) {
                if (!line.trim())
                    continue;
                const r = JSON.parse(line);
                prefix = { verdict: 'INTACT', count: prefix.count + 1, spent: tally(r, day, prefix.spent), last: { seq: r.seq, hash: r.hash }, breaks: [] };
            }
            return readLedger(buf.subarray(c.bytes).toString('utf8'), nowS, prefix);
        }
    }
    catch {
        /* no checkpoint, or one that does not parse: verify everything */
    }
    return readLedger(text, nowS);
}
exports.GUARD_LOCK_FILE = 'guard-receipts.lock';
const nodeGuardFs = () => {
    const fs = require('node:fs');
    return {
        exists: (p) => fs.existsSync(p),
        read: (p) => fs.readFileSync(p, 'utf8'),
        append: (p, d) => fs.appendFileSync(p, d, { mode: 0o600 }),
        write: (p, d) => fs.writeFileSync(p, d, { mode: 0o600 }),
        mkdirp: (p) => {
            fs.mkdirSync(p, { recursive: true, mode: 0o700 });
        },
        // One writer at a time. Eight simultaneous `guard check` calls forked the chain (Lane D, 2026-10-21), and a
        // forked chain reads BROKEN, which refuses every amount. Create-exclusive lock file; a lock older than 30 s
        // is a crashed writer and is taken over.
        // ponytail: a sync spin of 15 ms steps, up to 10 s; a real queue if contention ever matters.
        lock: (dir) => {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            const path = (0, node_path_1.join)(dir, exports.GUARD_LOCK_FILE);
            const deadline = Date.now() + 10000;
            const pause = new Int32Array(new SharedArrayBuffer(4));
            for (;;) {
                try {
                    fs.closeSync(fs.openSync(path, 'wx'));
                    return () => {
                        try {
                            fs.unlinkSync(path);
                        }
                        catch {
                            /* already gone */
                        }
                    };
                }
                catch (e) {
                    if (e.code !== 'EEXIST')
                        throw e;
                    try {
                        if (Date.now() - fs.statSync(path).mtimeMs > 30000)
                            fs.unlinkSync(path);
                    }
                    catch {
                        /* released meanwhile: try again */
                    }
                    if (Date.now() > deadline)
                        throw new Error(`NOT_CHECKED the guard ledger is locked by another writer (${path}); nothing was decided`);
                    Atomics.wait(pause, 0, 0, 15);
                }
            }
        },
    };
};
exports.nodeGuardFs = nodeGuardFs;
function loadPolicy(dir, fs = (0, exports.nodeGuardFs)()) {
    const path = (0, node_path_1.join)(dir, exports.POLICY_FILE);
    if (!fs.exists(path))
        return { state: 'absent', path };
    const r = parsePolicyDocument(fs.read(path));
    return r.ok ? { state: 'ok', path, doc: r.doc, sha256: policySha256(r.doc.policy), defaulted: r.defaulted } : { state: 'invalid', path, problems: r.errors };
}
/** Append one record to the ledger in `dir`, chained to the last one, and move the checkpoint. Takes the lock. */
function appendRecord(dir, fields, ctx = {}) {
    const fs = ctx.fs ?? (0, exports.nodeGuardFs)();
    const release = fs.lock(dir);
    try {
        return appendUnlocked(dir, fields, { ...ctx, fs });
    }
    finally {
        release();
    }
}
function appendUnlocked(dir, fields, ctx) {
    const fs = ctx.fs;
    const nowS = ctx.nowS ?? Math.floor(Date.now() / 1000);
    const ledgerPath = (0, node_path_1.join)(dir, exports.GUARD_RECEIPTS_FILE);
    const checkpointPath = (0, node_path_1.join)(dir, exports.GUARD_CHECKPOINT_FILE);
    const text = fs.exists(ledgerPath) ? fs.read(ledgerPath) : '';
    const ledger = readLedgerCheckpointed(text, fs.exists(checkpointPath) ? fs.read(checkpointPath) : null, nowS);
    const body = {
        schema: exports.GUARD_RECORD_SCHEMA,
        seq: (ledger.last?.seq ?? 0) + 1,
        ts: ctx.ts ?? new Date(nowS * 1000).toISOString(),
        origin: ctx.origin ?? 'Cli',
        ...fields,
        prev: ledger.last?.hash ?? null,
    };
    const record = { ...body, hash: recordHash(body) };
    const line = (0, jcs_1.canonicalize)(record) + '\n';
    fs.mkdirp(dir);
    fs.append(ledgerPath, line);
    if (ledger.verdict !== 'BROKEN') {
        const bytes = Buffer.from(text + line, 'utf8');
        fs.write(checkpointPath, JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes) }) + '\n');
    }
    return record;
}
/**
 * Decide ONE request against the policy in `dir` and record the decision BEFORE the caller acts. No policy file:
 * null (nothing decided, nothing written). The caller then runs the action only on ALLOWED.
 * Reading the ledger, deciding and appending happen under ONE lock, so a concurrent writer can neither fork the
 * chain nor spend the same allowance twice.
 * ponytail: reads and hashes the whole ledger file per decision (see GUARD_CHECKPOINT_FILE for the measured cost).
 */
function guardDecide(dir, req, scope, ctx = {}) {
    const fs = ctx.fs ?? (0, exports.nodeGuardFs)();
    const nowS = ctx.nowS ?? Math.floor(Date.now() / 1000);
    const loaded = loadPolicy(dir, fs);
    if (loaded.state === 'absent')
        return null;
    const release = fs.lock(dir);
    try {
        return decideLocked(dir, req, scope, { ...ctx, fs, nowS }, loaded);
    }
    finally {
        release();
    }
}
function decideLocked(dir, req, scope, ctx, loaded) {
    const { fs, nowS } = ctx;
    const ledgerPath = (0, node_path_1.join)(dir, exports.GUARD_RECEIPTS_FILE);
    const checkpointPath = (0, node_path_1.join)(dir, exports.GUARD_CHECKPOINT_FILE);
    const ledger = readLedgerCheckpointed(fs.exists(ledgerPath) ? fs.read(ledgerPath) : '', fs.exists(checkpointPath) ? fs.read(checkpointPath) : null, nowS);
    const base = loaded.state === 'ok' ? decide(loaded.doc.policy, req, ledger.spent, nowS) : decide(null, req, null, nowS, loaded.problems);
    const reasons = [...base.reasons, ...(ctx.extraReasons ?? [])];
    const decision = { decision: reasons.length ? 'DENIED' : 'ALLOWED', reasons };
    const requested = { action: actionFor(req), tool: req.tool, class: req.class };
    if (req.amount_raw !== undefined)
        requested.amount_raw = req.amount_raw;
    if (req.command_sha256 !== undefined)
        requested.command_sha256 = req.command_sha256;
    const record = appendUnlocked(dir, {
        kind: 'decision',
        requested,
        authorized: {
            ...decision,
            policy_sha256: loaded.state === 'ok' ? loaded.sha256 : null,
            policy_nonce: loaded.state === 'ok' ? loaded.doc.policy.nonce : null,
            policy_signed_by: loaded.state === 'ok' ? (loaded.doc.signature?.fingerprint ?? null) : null,
        },
        executed: decision.decision === 'DENIED' ? 'not run' : null,
        assurance_scope: scope,
    }, ctx);
    return { decision, record, loaded };
}
/** The sentences `guard show` will not let a reader forget. */
exports.GUARD_DOES_NOT_COVER = [
    'It covers the trustshell CLI and `trustshell run`. The MCP server (trustshell-mcp) does not read this policy yet.',
    'It stops a mistaken command, not an agent that can run the CLI itself: `guard allow` changes the policy (every change is recorded, with the hash before and after).',
    'It is not a sandbox. Anything running as you can edit the policy, delete records, or act without trustshell.',
    'It decides before an action starts. What a started command does (files, network, child processes) is not observed.',
    'A missing record never proves no action happened: the guard sees only what goes through it.',
    'The record chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.',
    'Amounts are counted from the decisions THIS ledger allowed. A spend made without asking the guard is not counted.',
];
/**
 * The loud line for a TRUSTSHELL_HOME that hides a policy: set to a folder with no policy while the default
 * `~/.trustshell/policy.json` exists, it switches the guard off for that command (Lane D, 2026-10-21). null when
 * nothing is hidden.
 */
function homeShadowWarning(env = process.env, home = (0, node_os_1.homedir)()) {
    const set = env.TRUSTSHELL_HOME?.trim();
    if (!set)
        return null;
    const { existsSync } = require('node:fs');
    const { resolve } = require('node:path');
    const def = (0, node_path_1.join)(home, '.trustshell');
    if (resolve(set) === resolve(def) || existsSync((0, node_path_1.join)(set, exports.POLICY_FILE)) || !existsSync((0, node_path_1.join)(def, exports.POLICY_FILE)))
        return null;
    return `WARNING: TRUSTSHELL_HOME=${set} has no policy, so the owner policy at ${(0, node_path_1.join)(def, exports.POLICY_FILE)} is NOT in force for this command`;
}
