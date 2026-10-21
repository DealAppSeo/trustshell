"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARD_DOES_NOT_COVER = exports.nodeGuardFs = exports.GUARD_CHECKPOINT_FILE = exports.DEFAULT_UNIT = exports.LOCAL_TOOLS = exports.GUARD_RECEIPT_SCHEMA = exports.GUARD_RECEIPTS_FILE = exports.GUARDRAILS_FILE = exports.GUARDRAILS_VERSION = void 0;
exports.defaultGuardrails = defaultGuardrails;
exports.trustshellHome = trustshellHome;
exports.renderGuardrails = renderGuardrails;
exports.parseGuardrails = parseGuardrails;
exports.decide = decide;
exports.receiptHash = receiptHash;
exports.readLedger = readLedger;
exports.readLedgerCheckpointed = readLedgerCheckpointed;
exports.nextReceipt = nextReceipt;
exports.guardrailsSha256 = guardrailsSha256;
exports.loadGuardrails = loadGuardrails;
exports.guardAction = guardAction;
/**
 * `~/.trustshell/guardrails.json` — the one file a person tunes to bound what trustshell may do.
 * ----------------------------------------------------------------------------------------------
 * THREE RULES, ALL DEFAULT-DENY. `trustshell guard init` writes a file that allows no network host,
 * only the commands that touch local files, and a spend limit of zero:
 *   egress.allow   hostnames a command may dial. Exact match, lowercase. Empty = nothing dials out.
 *   tools.allow    command (tool) names that may run at all.
 *   limits         spend_per_action and spend_total, smallest units of `unit`. "0" = no spend.
 *
 * NO FILE = NOTHING ENFORCED, and `guard show` says so. Default-deny is what the file starts as once
 * a person opts in; turning it on for everyone who never asked would break every existing install.
 *
 * A FILE THAT DOES NOT PARSE REFUSES EVERYTHING. A person who wrote a guardrails file and broke it
 * meant to be guarded; failing open on a typo would undo that silently. Unknown keys are a problem
 * too: a misspelt `egres` must not read as "no egress rule".
 *
 * EVERY DECISION IS RECEIPTED. `guard-receipts.jsonl` next to the file, one JSON line per decision,
 * each hashed over its RFC 8785 form and chained to the one before (like inspect's session log).
 * The receipt names the tool, the hosts and the spend, never the text a command was given.
 *
 * WHAT THIS IS NOT. It bounds what trustshell itself does. It is not a sandbox: anything that runs as
 * you can edit this file, delete the receipts, or dial a host without trustshell. The chain is
 * unkeyed, so it detects an edit that left later hashes alone, not a ledger rewritten wholesale.
 */
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
exports.GUARDRAILS_VERSION = 1;
exports.GUARDRAILS_FILE = 'guardrails.json';
exports.GUARD_RECEIPTS_FILE = 'guard-receipts.jsonl';
exports.GUARD_RECEIPT_SCHEMA = 'trustshell.guard-receipt/1';
/** The commands that only read or write local files. The default file allows these and nothing else. */
exports.LOCAL_TOOLS = [
    'bundle',
    'ground',
    'init',
    'inspect',
    'learn',
    'profile',
    'quarantine',
    'recall',
    'redact',
    'remember',
    'report',
    'traps',
];
exports.DEFAULT_UNIT = 'USDC smallest unit (6 decimals)';
function defaultGuardrails() {
    return {
        trustshell_guardrails: exports.GUARDRAILS_VERSION,
        egress: { allow: [] },
        tools: { allow: [...exports.LOCAL_TOOLS] },
        limits: { unit: exports.DEFAULT_UNIT, spend_per_action: '0', spend_total: '0' },
    };
}
/** The folder that holds guardrails, their receipts and the bundle signing key. */
function trustshellHome(env = process.env, home = (0, node_os_1.homedir)()) {
    const o = env.TRUSTSHELL_HOME?.trim();
    return o ? o : (0, node_path_1.join)(home, '.trustshell');
}
/** A hostname as the rules hold it: lowercase letters, digits, dots and dashes; no scheme, port or path. */
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const TOOL = /^[a-z][a-z0-9-]{0,39}$/;
const AMOUNT = /^(?:0|[1-9][0-9]{0,77})$/;
function renderGuardrails(g) {
    return JSON.stringify(g, null, 2) + '\n';
}
/**
 * PURE. Parse the file. Any problem resolves to `guardrails: null`, which refuses every action:
 * never a partial rule set, because a half-read file is not what the person wrote.
 */
function parseGuardrails(text) {
    const problems = [];
    let raw;
    try {
        raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    }
    catch (e) {
        return { guardrails: null, problems: [`not JSON: ${e.message}`] };
    }
    const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const exactKeys = (v, keys, at) => {
        for (const k of Object.keys(v))
            if (!keys.includes(k))
                problems.push(`${at}${k}: unknown key`);
        for (const k of keys)
            if (!(k in v))
                problems.push(`${at}${k}: missing`);
    };
    if (!obj(raw))
        return { guardrails: null, problems: ['the file must hold one JSON object'] };
    exactKeys(raw, ['trustshell_guardrails', 'egress', 'tools', 'limits'], '');
    if (raw.trustshell_guardrails !== exports.GUARDRAILS_VERSION) {
        problems.push(`trustshell_guardrails: expected ${exports.GUARDRAILS_VERSION}, got ${JSON.stringify(raw.trustshell_guardrails)}`);
    }
    const list = (section, name, shape, what) => {
        if (!obj(section)) {
            problems.push(`${name}: must be an object with "allow"`);
            return [];
        }
        exactKeys(section, ['allow'], `${name}.`);
        const allow = section.allow;
        if (!Array.isArray(allow)) {
            problems.push(`${name}.allow: must be a list`);
            return [];
        }
        for (const a of allow)
            if (typeof a !== 'string' || !shape.test(a))
                problems.push(`${name}.allow: ${JSON.stringify(a)} is not ${what}`);
        return allow.filter((a) => typeof a === 'string');
    };
    const egress = list(raw.egress, 'egress', HOSTNAME, 'a lowercase hostname (no scheme, port, path or wildcard)');
    const tools = list(raw.tools, 'tools', TOOL, 'a command name');
    const limits = raw.limits;
    if (!obj(limits))
        problems.push('limits: must be an object');
    else {
        exactKeys(limits, ['unit', 'spend_per_action', 'spend_total'], 'limits.');
        if (typeof limits.unit !== 'string' || !limits.unit.trim())
            problems.push('limits.unit: must name the unit');
        for (const k of ['spend_per_action', 'spend_total']) {
            if (typeof limits[k] !== 'string' || !AMOUNT.test(limits[k])) {
                problems.push(`limits.${k}: must be a whole number of smallest units, as a string ("0" = no spend)`);
            }
        }
    }
    if (problems.length)
        return { guardrails: null, problems };
    const l = limits;
    return {
        guardrails: {
            trustshell_guardrails: exports.GUARDRAILS_VERSION,
            egress: { allow: egress },
            tools: { allow: tools },
            limits: { unit: l.unit, spend_per_action: l.spend_per_action, spend_total: l.spend_total },
        },
        problems,
    };
}
/**
 * PURE. Weigh one action against the rules. `g === null` is a file that did not parse: refused.
 * `spentSoFar` is the sum of spends this ledger already allowed; `null` means the ledger could not be
 * trusted (a broken chain), and then any spend is refused.
 */
function decide(g, action, spentSoFar, problems = []) {
    if (!g)
        return { decision: 'REFUSED', reasons: [`the guardrails file does not parse, so everything is refused: ${problems.join('; ') || 'invalid'}`] };
    const reasons = [];
    if (!g.tools.allow.includes(action.tool))
        reasons.push(`tool "${action.tool}" is not in tools.allow`);
    for (const h of action.hosts) {
        if (!g.egress.allow.includes(h.toLowerCase()))
            reasons.push(`egress to ${h} is not in egress.allow`);
    }
    if (action.spend !== undefined) {
        if (!/^[1-9][0-9]{0,77}$/.test(action.spend))
            reasons.push('spend must be a whole number of smallest units, more than 0');
        else {
            const amount = BigInt(action.spend);
            const per = BigInt(g.limits.spend_per_action);
            const total = BigInt(g.limits.spend_total);
            if (amount > per)
                reasons.push(`spend ${action.spend} is over spend_per_action ${g.limits.spend_per_action} (${g.limits.unit})`);
            if (spentSoFar === null)
                reasons.push('the receipt ledger is BROKEN, so the running total is unknown and no spend is allowed');
            else if (spentSoFar + amount > total) {
                reasons.push(`spend ${action.spend} would take the total to ${spentSoFar + amount}, over spend_total ${g.limits.spend_total} (${g.limits.unit})`);
            }
        }
    }
    return { decision: reasons.length ? 'REFUSED' : 'ALLOWED', reasons };
}
/** The hash a receipt must carry: sha256 of the RFC 8785 form of every field but `hash`. */
function receiptHash(r) {
    return (0, jcs_1.jcsSha256)(r);
}
const allowedSpend = (r) => r.decision === 'ALLOWED' && typeof r.action?.spend === 'string' && /^[1-9][0-9]{0,77}$/.test(r.action.spend) ? BigInt(r.action.spend) : BigInt(0);
/**
 * PURE. Read the receipt ledger: check every hash and every link, and total the allowed spends. `from` is
 * the reading of the lines BEFORE `text` (an already-verified prefix): the chain continues from its last hash.
 */
function readLedger(text, from) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const breaks = [];
    const offset = from?.count ?? 0;
    let prev = from?.last?.hash ?? null;
    let spent = from?.spent ?? BigInt(0);
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
            want = receiptHash(body);
        }
        catch {
            /* not canonicalizable: counted as a break below */
        }
        if (r.schema !== exports.GUARD_RECEIPT_SCHEMA)
            breaks.push(`line ${n}: schema is not ${exports.GUARD_RECEIPT_SCHEMA}`);
        if (want === null || hash !== want)
            breaks.push(`line ${n}: hash does not match the receipt`);
        if (r.prev !== prev)
            breaks.push(`line ${n}: prev does not match the line before`);
        if (r.seq !== n)
            breaks.push(`line ${n}: seq is ${r.seq}`);
        spent += allowedSpend(r);
        prev = typeof hash === 'string' ? hash : null;
        last = { seq: n, hash: String(hash) };
    });
    const count = offset + lines.length;
    if (count === 0)
        return { verdict: 'EMPTY', count: 0, spent: BigInt(0), last: null, breaks };
    return breaks.length || from?.verdict === 'BROKEN'
        ? { verdict: 'BROKEN', count, spent: null, last, breaks }
        : { verdict: 'INTACT', count, spent, last, breaks };
}
/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes (one sha256, fast) and fully verifies only the
 * lines after them; any change to the old bytes misses the cache and the whole ledger is verified again.
 * Measured 2026-10-21 (lane B report, same process A/B, 3 runs): at 10,000 receipts a full verification
 * cost 541-593 ms per decision, a checkpointed decision 236-284 ms.
 */
exports.GUARD_CHECKPOINT_FILE = 'guard-receipts.checkpoint.json';
const sha256 = (b) => (0, node_crypto_1.createHash)('sha256').update(b).digest('hex');
/** The ledger reading, using the checkpoint when its bytes still match. Falls back to a full read on any doubt. */
function readLedgerCheckpointed(text, checkpointText) {
    try {
        const c = JSON.parse(checkpointText ?? 'null');
        const buf = Buffer.from(text, 'utf8');
        if (c && Number.isSafeInteger(c.bytes) && c.bytes <= buf.length && sha256(buf.subarray(0, c.bytes)) === c.sha256) {
            // These bytes were verified line by line when the checkpoint was written: tally them, do not re-hash them.
            let prefix = { verdict: 'EMPTY', count: 0, spent: BigInt(0), last: null, breaks: [] };
            for (const line of buf.subarray(0, c.bytes).toString('utf8').split(/\r?\n/)) {
                if (!line.trim())
                    continue;
                const r = JSON.parse(line);
                prefix = { verdict: 'INTACT', count: prefix.count + 1, spent: prefix.spent + allowedSpend(r), last: { seq: r.seq, hash: r.hash }, breaks: [] };
            }
            return readLedger(buf.subarray(c.bytes).toString('utf8'), prefix);
        }
    }
    catch {
        /* no checkpoint, or one that does not parse: verify everything */
    }
    return readLedger(text);
}
/** PURE. The next receipt line after `ledger`. */
function nextReceipt(ledger, fields) {
    const action = { tool: fields.action.tool, hosts: [...fields.action.hosts] };
    if (fields.action.spend !== undefined)
        action.spend = fields.action.spend;
    const body = {
        schema: exports.GUARD_RECEIPT_SCHEMA,
        seq: (ledger.last?.seq ?? 0) + 1,
        ts: fields.ts ?? new Date().toISOString(),
        origin: fields.origin ?? 'Cli',
        action,
        decision: fields.decision.decision,
        reasons: [...fields.decision.reasons],
        guardrails_sha256: fields.guardrails_sha256,
        prev: ledger.last?.hash ?? null,
    };
    return { ...body, hash: receiptHash(body) };
}
/** sha256 of the rules (RFC 8785 form), the value a receipt binds to. */
function guardrailsSha256(g) {
    return (0, jcs_1.jcsSha256)(g);
}
const nodeGuardFs = () => {
    const fs = require('node:fs');
    return {
        exists: (p) => fs.existsSync(p),
        read: (p) => fs.readFileSync(p, 'utf8'),
        // Owner-only, like the memory file: the ledger says what you did and what you spent.
        append: (p, d) => fs.appendFileSync(p, d, { mode: 0o600 }),
        write: (p, d) => fs.writeFileSync(p, d, { mode: 0o600 }),
        mkdirp: (p) => {
            fs.mkdirSync(p, { recursive: true, mode: 0o700 });
        },
    };
};
exports.nodeGuardFs = nodeGuardFs;
function loadGuardrails(dir, fs = (0, exports.nodeGuardFs)()) {
    const path = (0, node_path_1.join)(dir, exports.GUARDRAILS_FILE);
    if (!fs.exists(path))
        return { state: 'absent', path };
    const { guardrails, problems } = parseGuardrails(fs.read(path));
    return guardrails ? { state: 'ok', path, guardrails, sha256: guardrailsSha256(guardrails) } : { state: 'invalid', path, problems };
}
/**
 * Decide AND receipt one action against the file in `dir`, in that order, and return both. No file:
 * `null` (nothing is enforced, nothing is written). The receipt is appended before the caller acts on
 * an ALLOWED decision, so an action that then crashes is still on the ledger.
 * Only the lines after the checkpoint are re-verified (see GUARD_CHECKPOINT_FILE); a BROKEN ledger is never
 * checkpointed, so it stays BROKEN.
 * ponytail: still reads, parses and hashes the whole file per decision. Measured 2026-10-21 at 10,000
 * receipts: ~260 ms per decision against ~560 ms for re-verifying every line; equal at 1,000. O(1) needs the
 * checkpoint to carry the totals and a tail read by offset, which moves casual-edit detection from every
 * decision to `guard show` only. No lock either: two concurrent writers fork the chain, which then reads
 * BROKEN and refuses spends (fail closed).
 */
function guardAction(dir, action, opts = {}) {
    const fs = opts.fs ?? (0, exports.nodeGuardFs)();
    const loaded = loadGuardrails(dir, fs);
    if (loaded.state === 'absent')
        return null;
    const ledgerPath = (0, node_path_1.join)(dir, exports.GUARD_RECEIPTS_FILE);
    const checkpointPath = (0, node_path_1.join)(dir, exports.GUARD_CHECKPOINT_FILE);
    const text = fs.exists(ledgerPath) ? fs.read(ledgerPath) : '';
    const ledger = readLedgerCheckpointed(text, fs.exists(checkpointPath) ? fs.read(checkpointPath) : null);
    const base = loaded.state === 'ok' ? decide(loaded.guardrails, action, ledger.spent) : decide(null, action, null, loaded.problems);
    // A reason the caller knows and the file cannot express (init --pai's child process) refuses too.
    const reasons = [...base.reasons, ...(opts.extraReasons ?? [])];
    const decision = { decision: reasons.length ? 'REFUSED' : 'ALLOWED', reasons };
    const receipt = nextReceipt(ledger, {
        action,
        decision,
        guardrails_sha256: loaded.state === 'ok' ? loaded.sha256 : null,
        origin: opts.origin,
        ts: opts.ts,
    });
    fs.mkdirp(dir);
    const line = (0, jcs_1.canonicalize)(receipt) + '\n';
    fs.append(ledgerPath, line);
    if (ledger.verdict !== 'BROKEN') {
        const bytes = Buffer.from(text + line, 'utf8');
        fs.write(checkpointPath, JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes) }) + '\n');
    }
    return { decision, receipt, loaded };
}
/** The sentences `guard show` will not let a reader forget. */
exports.GUARD_DOES_NOT_COVER = [
    'It bounds what trustshell does. It is not a sandbox: anything running as you can edit this file, delete the receipts, or reach the network without trustshell.',
    'Egress is enforced on trustshell\'s own fetch calls. A child process (init --pai, a learn check command you registered) is not inside it: init --pai is refused while this file is in force; learn runs under tools.allow only.',
    'The receipt chain is unkeyed: it detects an edit or a deleted line that left the later hashes alone, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.',
    'Spend limits count the spends THIS ledger allowed (guard check --spend). A spend made without asking the guard is not counted.',
];
