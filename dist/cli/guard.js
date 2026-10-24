"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVEL_IS_NOT = exports.GUARD_USAGE = exports.RUN_USAGE = exports.CHECK_SCOPE = exports.POLICY_SCOPE = exports.RUN_SCOPE = exports.CLI_SCOPE = exports.NEVER_GUARDED = exports.EXIT_REFUSED = void 0;
exports.recordPolicyChange = recordPolicyChange;
exports.plannedAction = plannedAction;
exports.runGuarded = runGuarded;
exports.formatRunCard = formatRunCard;
exports.runRun = runRun;
exports.runGuard = runGuard;
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const action_evidence_1 = require("../lib/action-evidence");
const cli_1 = require("../learn/cli");
const guardrails_1 = require("../lib/guardrails");
const install_key_1 = require("../lib/install-key");
const autonomy_1 = require("../lib/autonomy");
/** Exit code for an action the policy denied. Never 0, and distinct from a VETO (1). */
exports.EXIT_REFUSED = 5;
exports.NEVER_GUARDED = new Set(['help', 'version', 'guard', 'run']);
/** The scope a CLI-gate record states. */
exports.CLI_SCOPE = {
    mediated: ['whether this trustshell command was allowed to start, checked against the owner policy before it started'],
    not_mediated: [
        'what the command does once started; its network calls are the fixed ones in `trustshell --help`, not checked per host',
        'anything run without trustshell',
    ],
};
exports.RUN_SCOPE = {
    mediated: ['the decision to start this command through `trustshell run`, checked against the owner policy before it started', 'the exit code of the process `trustshell run` started'],
    not_mediated: ['what the command did after it started: files, network, child processes', 'commands run without `trustshell run`'],
};
exports.POLICY_SCOPE = {
    mediated: ['that the policy in force was changed through trustshell (guard or bundle import), and its hash before and after'],
    not_mediated: ['an edit made to policy.json by hand or by another program: the guard reads the file, it does not know who wrote it'],
};
/** Record that the policy in force changed. A rule change is never silent (Lane D, 2026-10-21). */
function recordPolicyChange(dir, via, before, after) {
    const sha = (0, guardrails_1.policySha256)(after.policy);
    return (0, guardrails_1.appendRecord)(dir, {
        kind: 'policy-change',
        requested: { action: 'policy-change', tool: 'guard', class: 'other' },
        authorized: { decision: 'ALLOWED', reasons: [], policy_sha256: sha, policy_nonce: after.policy.nonce, policy_signed_by: (0, guardrails_1.policySigner)(after) },
        executed: null,
        assurance_scope: exports.POLICY_SCOPE,
        change: { via, before_sha256: before, after_sha256: sha },
    });
}
exports.CHECK_SCOPE = {
    mediated: ['a decision only: `guard check` runs nothing'],
    not_mediated: ['whether the caller obeyed the decision', 'what the caller did afterwards'],
};
/** PURE. What a parsed command is, as the gate weighs it, and any reason it must be denied whatever the policy says. */
function plannedAction(args) {
    const req = { tool: args.command, class: 'other' };
    if (args.command === 'init' && args.pai && !args.dryRun) {
        return { req, refuse: 'init --pai spawns scripts/init-pai.mjs, whose effects the guard cannot see, so it is denied while a policy is in force' };
    }
    const executes = args.command === 'learn' ? (0, cli_1.learnExecutes)(args.learnArgv ?? []) : null;
    if (executes) {
        return { req, refuse: `${executes} runs a stored command through a shell, whose effects the guard cannot see, so it is denied while a policy is in force` };
    }
    return { req };
}
/** Run `inner` under the policy, if there is one. No policy file: `inner` runs exactly as before. */
async function runGuarded(args, inner, io, env = process.env) {
    if (args.error || exports.NEVER_GUARDED.has(args.command))
        return inner();
    const shadow = (0, guardrails_1.homeShadowWarning)(env);
    if (shadow)
        io.err(shadow);
    const { req, refuse } = plannedAction(args);
    const g = (0, guardrails_1.guardDecide)((0, guardrails_1.trustshellHome)(env), req, exports.CLI_SCOPE, { extraReasons: refuse ? [refuse] : [] });
    if (!g)
        return inner();
    if (g.decision.decision === 'DENIED') {
        io.err(`DENIED by the owner policy (${g.loaded.path}), record ${g.record.seq}:`);
        for (const r of g.decision.reasons)
            io.err(`  - ${r}`);
        io.err('Nothing was run. trustshell guard show prints the policy.');
        return exports.EXIT_REFUSED;
    }
    return inner();
}
const sha256 = (s) => (0, node_crypto_1.createHash)('sha256').update(s, 'utf8').digest('hex');
/**
 * The card `trustshell run` prints: the five things a reader must keep apart. `doc` is the policy the decision
 * was made under: with it, a signature that does not verify reads as such instead of as "unsigned". `own` is
 * this install's key: a signature that verifies under any OTHER key read "owner-signed" until 2026-10-22, so a
 * policy anyone self-signed was called the owner's (GUARD_AUTHORITY_CONCLUSION, case 2).
 */
function formatRunCard(decision, outcome, doc = null, own = null) {
    const d = decision;
    const by = d.authorized.policy_signed_by;
    const signed = by ? (by === own ? 'owner-signed' : `signed by ${by.slice(0, 16)}…, NOT this install's key`) : doc?.signature ? guardrails_1.SIGNATURE_DOES_NOT_VERIFY : 'unsigned';
    const ex = outcome?.executed;
    const executed = ex && ex !== 'not run' ? `started; exited ${ex.exit_code ?? `on signal ${ex.signal}`} after ${ex.duration_ms} ms` : 'not run';
    return [
        `trustshell run  —  ${d.authorized.decision}`,
        `  requested             ${d.requested.action}${d.requested.executable ? ` (starts ${d.requested.executable})` : ''}${d.requested.amount_raw ? ` amount ${d.requested.amount_raw}` : ''}; --class is the caller's label`,
        `  authorized            ${d.authorized.decision}${d.authorized.reasons.length ? `: ${d.authorized.reasons.join('; ')}` : ''} (policy ${String(d.authorized.policy_sha256).slice(0, 12)}…, nonce ${d.authorized.policy_nonce}, ${signed})`,
        `  executed              ${executed}`,
        '  independently observed  nothing: no outside party watched this command',
        `  unknown               ${exports.RUN_SCOPE.not_mediated.join('; ')}`,
        `  records               ${d.seq}${outcome ? ` and ${outcome.seq}` : ''} in ${guardrails_1.GUARD_RECEIPTS_FILE}`,
    ].join('\n');
}
const nodeSpawner = (cmd, args) => {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
    return { status: r.status, signal: r.signal ?? null };
};
exports.RUN_USAGE = 'trustshell run --tool <name> [--class read|other|post|spend] [--amount <n>] [--json] -- <command> [args...]';
/** `trustshell run`. The command's own output goes to the terminal; the card goes to stderr (or --json to stdout). */
function runRun(argv, io, env = process.env, spawn = nodeSpawner) {
    const dash = argv.indexOf('--');
    const opts = dash === -1 ? argv : argv.slice(0, dash);
    const command = dash === -1 ? [] : argv.slice(dash + 1);
    let tool;
    let cls = 'other';
    let amount;
    let json = false;
    for (let i = 0; i < opts.length; i += 1) {
        const a = opts[i];
        const v = opts[i + 1];
        if (a === '--json')
            json = true;
        else if ((a === '--tool' || a === '--class' || a === '--amount') && v !== undefined && !v.startsWith('-')) {
            if (a === '--tool')
                tool = v;
            else if (a === '--amount')
                amount = v;
            else if (guardrails_1.TOOL_CLASSES.includes(v))
                cls = v;
            else
                return usage(io, `--class takes ${guardrails_1.TOOL_CLASSES.join(', ')}`);
            i += 1;
        }
        else
            return usage(io, `unexpected ${a}`);
    }
    if (!tool || !/^[A-Za-z0-9_.:-]{1,128}$/.test(tool))
        return usage(io, 'run needs --tool <name> (letters, digits, _ . : -)');
    if (!command.length || !command[0])
        return usage(io, 'run needs the command after --');
    const dir = (0, guardrails_1.trustshellHome)(env);
    const shadow = (0, guardrails_1.homeShadowWarning)(env);
    if (shadow)
        io.err(shadow);
    // The tool label must BE the executable that would start: with only tool:inspect allowed,
    // `run --tool inspect -- node anything.js` used to run node (Lane D, 2026-10-21). The guard bounds which
    // executable starts, not what that executable then does (a script, its arguments).
    const executable = (0, node_path_1.basename)(String(command[0])).replace(/\.(exe|cmd|bat|com)$/i, '').toLowerCase();
    const mismatch = executable !== tool.toLowerCase() ? [`the command starts ${executable}, not ${tool}: run allows an executable only by its own name`] : [];
    const req = { tool, class: cls, executable, command_sha256: sha256(JSON.stringify(command)), ...(amount !== undefined ? { amount_raw: amount } : {}) };
    const g = (0, guardrails_1.guardDecide)(dir, req, exports.RUN_SCOPE, { extraReasons: mismatch });
    if (!g) {
        io.err(`NOT_CHECKED no policy at ${(0, node_path_1.join)(dir, guardrails_1.POLICY_FILE)}: nothing is authorized, so nothing was run. trustshell guard init writes one.`);
        return 2;
    }
    // Read before anything starts: an unreadable key must not throw after the command ran. No key, no owner.
    let own = null;
    try {
        own = (0, install_key_1.ownFingerprint)(dir);
    }
    catch {
        /* not a key: no signature is this install's */
    }
    if (g.decision.decision === 'DENIED') {
        (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome: null }, null, 2) : formatRunCard(g.record, null, g.loaded.state === 'ok' ? g.loaded.doc : null, own));
        return exports.EXIT_REFUSED;
    }
    const t0 = Date.now();
    const r = spawn(command[0], command.slice(1));
    const outcome = (0, guardrails_1.appendRecord)(dir, {
        kind: 'outcome',
        requested: g.record.requested,
        authorized: g.record.authorized,
        executed: { exit_code: r.status, signal: r.signal, duration_ms: Date.now() - t0 },
        assurance_scope: exports.RUN_SCOPE,
    });
    (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome }, null, 2) : formatRunCard(g.record, outcome, g.loaded.state === 'ok' ? g.loaded.doc : null, own));
    return r.status ?? 3;
}
function usage(io, m) {
    io.err(`error: ${m}\n${exports.RUN_USAGE}\n${exports.GUARD_USAGE}`);
    return 2;
}
exports.GUARD_USAGE = `trustshell guard init [--force] [--days N]
trustshell guard show [--json]
trustshell guard check --tool <name> [--class read|other|post|spend] [--amount <n>] [--json]
trustshell guard allow <action> · guard deny <action>      (spend | post | tool | tool:<name>)
trustshell guard limit per-tx|daily|total <n> · guard expire <days> · guard kill · guard sign
trustshell guard level [--json] · guard level shadow|enforce|off · guard level after L1|L2|L3 <n>
trustshell guard level record <record.json> [--json] · guard level revoke      (SHADOW by default)`;
/** The disclaimer every `guard level` reading carries. */
exports.LEVEL_IS_NOT = 'Local guardrails for cooperative agents, not a security boundary: anything running as you can edit the policy or autonomy.jsonl, or hand guard level record a record.json it made up (a record is unsigned).';
function autonomyLine(p) {
    const a = p.autonomy;
    if (!a)
        return 'autonomy    off (trustshell guard level shadow turns it on)';
    return `autonomy    ${a.mode === 'shadow' ? 'SHADOW: the level is computed and recorded, and Guard allows exactly what the policy allows' : 'ENFORCE: the level can also refuse; it never allows what the policy does not list'}`;
}
/** `guard level`, `guard level record <file>`, `guard level revoke`: the ones that do not change the policy. */
function runLevel(words, json, io, dir, p) {
    const [sub] = words;
    const config = p.autonomy;
    if (!config) {
        (sub ? io.err : io.out)(autonomyLine(p));
        return sub ? 2 : 0;
    }
    const fs = (0, guardrails_1.nodeGuardFs)();
    const path = (0, node_path_1.join)(dir, autonomy_1.AUTONOMY_FILE);
    if (sub === 'record' || sub === 'revoke') {
        let ev;
        if (sub === 'revoke') {
            if (words.length !== 1)
                return usage(io, 'guard level revoke takes nothing');
            ev = { kind: 'revocation', via: 'guard level revoke' };
        }
        else {
            if (words.length !== 2)
                return usage(io, 'guard level record takes one record.json, as trustshell check <runUrl> --claims-file <path> --out <dir> writes it');
            const file = words[1];
            let text;
            try {
                const nfs = require('node:fs');
                // A record of the 200 claims `check` reads at most is well under this.
                if (nfs.statSync(file).size > 4 * 1024 * 1024)
                    throw new Error('it is over 4 MB');
                text = nfs.readFileSync(file, 'utf8');
            }
            catch (e) {
                io.err(`not recorded: cannot read ${file}: ${e.message}`);
                return 2;
            }
            const e = (0, autonomy_1.evidenceFromRecordFile)(text, p.subject);
            if (!e.ok) {
                io.err(`not recorded: ${e.error}`);
                return 2;
            }
            ev = e.event;
        }
        const r = (0, autonomy_1.recordAutonomyEvent)(dir, fs, config, ev);
        if (!r.ok) {
            io.err(`not recorded: ${r.error}`);
            return 2;
        }
        if (json) {
            io.out(JSON.stringify(r.added, null, 2));
            return 0;
        }
        const first = r.added[0];
        const lines = [];
        if (first.kind === 'evidence') {
            const t = first.tally;
            lines.push(`recorded ${first.run} for ${p.subject}: ${first.outcome} (${t.SUPPORTED} SUPPORTED, ${t.CONTRADICTED} CONTRADICTED, ${t.NOT_CHECKED} NOT_CHECKED), record ${first.seq}`);
            if (first.outcome === 'NOT_CHECKED')
                lines.push('  counts for nothing: a record counts only when every claim is SUPPORTED on a complete run');
            else if (first.outcome === 'SUPPORTED' && r.after.supported <= r.before.supported && r.added.length === 1) {
                lines.push(r.before.needed === null ? '  L3 is the highest level' : `  does not count: ${first.commit} was already counted`);
            }
        }
        else
            lines.push(`recorded the revocation, record ${first.seq}`);
        const ch = r.added.find((a) => a.kind === 'level-change');
        if (ch && ch.kind === 'level-change')
            lines.push(`level       L${ch.from} -> L${ch.to}: ${ch.reason}`);
        else if (r.after.needed !== null)
            lines.push(`level       L${r.after.level}; L${r.after.level + 1} after ${r.after.needed}, ${r.after.supported} so far`);
        if (config.mode === 'shadow')
            lines.push('            SHADOW: nothing Guard allows has changed');
        io.out(lines.join('\n'));
        return 0;
    }
    if (sub !== undefined)
        return usage(io, 'guard level takes shadow, enforce, off, after, record or revoke');
    const reading = (0, autonomy_1.readAutonomy)(fs.exists(path) ? fs.read(path) : '');
    const s = (0, autonomy_1.levelState)(reading, config);
    const m = (0, autonomy_1.measured)(reading);
    if (json) {
        io.out(JSON.stringify({ subject: p.subject, ...config, ...s, measured: m, records: reading.records.length, breaks: reading.breaks, is_not: exports.LEVEL_IS_NOT }, null, 2));
    }
    else {
        io.out([
            autonomyLine(p),
            `subject     ${p.subject}`,
            `level       ${autonomy_1.LEVEL_MEANS[s.level]}`,
            `why         ${s.reason}`,
            `next        ${s.needed === null ? (s.chain === 'BROKEN' ? 'none while autonomy.jsonl is BROKEN' : 'none: L3 is the highest') : `L${s.level + 1} after ${s.needed} Inspect records SUPPORTED in full, one per commit; ${s.supported} so far since the last change`}`,
            'falls       one level on a CONTRADICTED record or a refused out-of-lane attempt; to L0 on guard level revoke or guard kill',
            `measured    ${m.decisions} Guard decision${m.decisions === 1 ? '' : 's'}: the level would have refused ${m.earned_denied} of the ${m.fixed_allowed} the policy allowed`,
            `records     ${reading.records.length} in ${autonomy_1.AUTONOMY_FILE}, chain ${reading.verdict}${reading.breaks.length ? ': ' + reading.breaks.slice(0, 3).join('; ') : ''}`,
            '',
            exports.LEVEL_IS_NOT,
        ].join('\n'));
    }
    return reading.verdict === 'BROKEN' ? 1 : 0;
}
function showLines(doc, path, ledgerText, defaulted) {
    const p = doc.policy;
    const l = (0, guardrails_1.readLedger)(ledgerText, undefined, undefined, (0, guardrails_1.policySha256)(p));
    const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : `${l.spent.today} in the last 24 h, ${l.spent.total} under this policy`;
    const signer = (0, guardrails_1.policySigner)(doc);
    return [
        `policy      ${path}  (sha256 ${(0, guardrails_1.policySha256)(p).slice(0, 16)}…, nonce ${p.nonce}, ${signer ? `signed by ${signer.slice(0, 16)}…` : doc.signature ? guardrails_1.SIGNATURE_DOES_NOT_VERIFY : 'unsigned'})`,
        `subject     ${(0, action_evidence_1.cleanCodePoints)(p.subject)}`, // policy.json is text someone else may have written (an imported, signed policy): print it as text
        `actions     ${p.actions.length ? p.actions.join(', ') : 'NONE: everything is denied'}  (anything unlisted is denied)`,
        'always      denied whatever the actions list: init --pai, learn check run, learn probe run (each starts a process the guard cannot see)',
        `limits      per_tx ${p.per_tx_raw} · daily ${p.daily_raw} · total ${p.total_raw} (smallest units)${defaulted.length ? `; left out, so 0: ${defaulted.join(', ')}` : ''}; allowed so far: ${spent}`,
        `expires     ${new Date(p.expires_at * 1000).toISOString()}`,
        autonomyLine(p),
        `records     ${l.count} in ${guardrails_1.GUARD_RECEIPTS_FILE}, chain ${l.verdict}${l.breaks.length ? ': ' + l.breaks.slice(0, 3).join('; ') : ''}`,
        ...(l.verdict === 'BROKEN' ? ['            No amount is allowed while it is BROKEN. Keep the file as evidence and move it aside to start a new ledger.'] : []),
        '',
        'What this does not cover',
        ...guardrails_1.GUARD_DOES_NOT_COVER.map((s) => `* ${s}`),
    ];
}
function runGuard(argv, io, env = process.env) {
    const fs = require('node:fs');
    const dir = (0, guardrails_1.trustshellHome)(env);
    const path = (0, node_path_1.join)(dir, guardrails_1.POLICY_FILE);
    const [verb, ...rest] = argv;
    const json = rest.includes('--json');
    const words = rest.filter((w) => w !== '--json');
    const bad = (m) => usage(io, m);
    const write = (doc) => {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path, (0, guardrails_1.renderPolicyDocument)(doc), { mode: 0o600 });
    };
    const ledgerText = () => (fs.existsSync((0, node_path_1.join)(dir, guardrails_1.GUARD_RECEIPTS_FILE)) ? fs.readFileSync((0, node_path_1.join)(dir, guardrails_1.GUARD_RECEIPTS_FILE), 'utf8') : '');
    switch (verb) {
        case 'init': {
            let days = 30;
            for (let i = 0; i < words.length; i += 1) {
                if (words[i] === '--force')
                    continue;
                if (words[i] === '--days' && /^[1-9][0-9]{0,4}$/.test(words[i + 1] ?? '')) {
                    days = Number(words[i + 1]);
                    i += 1;
                }
                else
                    return bad(`guard init: unexpected ${words[i]}`);
            }
            if (fs.existsSync(path) && !words.includes('--force')) {
                io.err(`guard init: ${path} exists; nothing was written (--force replaces it)`);
                return 2;
            }
            const before = (0, guardrails_1.loadPolicy)(dir);
            // The nonce continues from the highest this host has had (file or ledger): init --force after kill used to
            // restart at 1, letting an old, looser owner-signed policy import as enforced (Lane D, 2026-10-21).
            const hw = (0, guardrails_1.nonceHighWater)(dir);
            const doc = { policy: { ...(0, guardrails_1.defaultPolicy)(undefined, days), nonce: hw === null ? '1' : (BigInt(hw) + BigInt(1)).toString() }, signature: null };
            write(doc);
            recordPolicyChange(dir, `guard init${words.includes('--force') ? ' --force' : ''}`, before.state === 'ok' ? before.sha256 : null, doc);
            io.out(`wrote ${path}: local commands only, every limit 0, expires in ${days} days. trustshell guard show prints it.`);
            return 0;
        }
        case 'show': {
            if (words.length)
                return bad(`guard show: unexpected ${words[0]}`);
            const shadow = (0, guardrails_1.homeShadowWarning)(env);
            if (shadow)
                io.err(shadow);
            const loaded = (0, guardrails_1.loadPolicy)(dir);
            if (loaded.state === 'absent') {
                io.out(json ? JSON.stringify({ state: 'absent', path }, null, 2) : `no policy at ${path}: trustshell run authorizes nothing, and nothing else is gated. trustshell guard init writes one.`);
                return 0;
            }
            if (loaded.state === 'invalid') {
                io.out(json ? JSON.stringify(loaded, null, 2) : [`${path} does not parse, so EVERYTHING is denied:`, ...loaded.problems.map((p) => `  - ${(0, action_evidence_1.cleanCodePoints)(p)}`)].join('\n'));
                return 1;
            }
            const l = (0, guardrails_1.readLedger)(ledgerText(), undefined, undefined, loaded.sha256);
            if (json) {
                io.out(JSON.stringify({ state: 'ok', path, ...loaded.doc, signed_by: (0, guardrails_1.policySigner)(loaded.doc), sha256: loaded.sha256, defaulted: loaded.defaulted, records: { count: l.count, chain: l.verdict, spent: l.spent && { today: String(l.spent.today), total: String(l.spent.total) }, breaks: l.breaks } }, null, 2));
            }
            else
                io.out(showLines(loaded.doc, path, ledgerText(), loaded.defaulted).join('\n'));
            return l.verdict === 'BROKEN' ? 1 : 0;
        }
        case 'check': {
            let tool;
            let cls = 'other';
            let amount;
            for (let i = 0; i < words.length; i += 1) {
                const w = words[i];
                const v = words[i + 1];
                if (!['--tool', '--class', '--amount'].includes(w))
                    return bad(`guard check: unexpected ${w}`);
                if (v === undefined || v.startsWith('-'))
                    return bad(`${w} requires a value`);
                if (w === '--tool')
                    tool = v;
                else if (w === '--amount')
                    amount = v;
                else if (guardrails_1.TOOL_CLASSES.includes(v))
                    cls = v;
                else
                    return bad(`--class takes ${guardrails_1.TOOL_CLASSES.join(', ')}`);
                i += 1;
            }
            if (!tool)
                return bad('guard check requires --tool <name>');
            // A check is a question, recorded as kind "check": its amount is never counted as spent.
            const g = (0, guardrails_1.guardDecide)(dir, { tool, class: cls, ...(amount !== undefined ? { amount_raw: amount } : {}) }, exports.CHECK_SCOPE, { kind: 'check' });
            if (!g) {
                io.out(json ? JSON.stringify({ decision: 'NOT_CHECKED', reason: `no policy at ${path}` }, null, 2) : `NOT_CHECKED no policy at ${path}; nothing was decided. This is not an allow.`);
                return 2;
            }
            if (json)
                io.out(JSON.stringify(g.record, null, 2));
            else
                io.out([`${g.decision.decision}  record ${g.record.seq} ${g.record.hash}`, ...g.decision.reasons.map((r) => `  - ${r}`)].join('\n'));
            return g.decision.decision === 'ALLOWED' ? 0 : exports.EXIT_REFUSED;
        }
        case 'allow':
        case 'deny':
        case 'limit':
        case 'expire':
        case 'kill':
        case 'sign':
        case 'level': {
            const loaded = (0, guardrails_1.loadPolicy)(dir);
            if (loaded.state !== 'ok') {
                io.err(loaded.state === 'absent' ? `no policy at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
                return 2;
            }
            if (verb === 'level' && !['shadow', 'enforce', 'off', 'after'].includes(words[0] ?? ''))
                return runLevel(words, json, io, dir, loaded.doc.policy);
            const p = JSON.parse(JSON.stringify(loaded.doc.policy));
            if (verb === 'sign') {
                if (words.length)
                    return bad('guard sign takes nothing');
                const k = (0, install_key_1.signingKey)(dir);
                const signed = { policy: p, signature: { ...k.signer, signature: (0, install_key_1.signValue)(p, k.key) } };
                write(signed);
                recordPolicyChange(dir, 'guard sign', loaded.sha256, signed);
                io.out(`signed ${path} with this install's key ${k.signer.fingerprint}. A bundle can now carry it as owner-signed.`);
                return 0;
            }
            if (verb === 'allow' || verb === 'deny') {
                if (words.length !== 1)
                    return bad(`guard ${verb} takes one action: spend, post, tool or tool:<name>`);
                const a = words[0];
                p.actions = verb === 'allow' ? (p.actions.includes(a) ? p.actions : [...p.actions, a]) : p.actions.filter((x) => x !== a);
            }
            else if (verb === 'limit') {
                const key = { 'per-tx': 'per_tx_raw', daily: 'daily_raw', total: 'total_raw' }[words[0] ?? ''];
                if (!key || words.length !== 2)
                    return bad('guard limit takes per-tx, daily or total, then an amount');
                p[key] = words[1];
            }
            else if (verb === 'expire') {
                if (words.length !== 1 || !/^[1-9][0-9]{0,4}$/.test(words[0]))
                    return bad('guard expire takes a number of days from now');
                p.expires_at = Math.floor(Date.now() / 1000) + Number(words[0]) * 86400;
            }
            else if (verb === 'level') {
                const [sub, lv, n] = words;
                if (sub === 'after') {
                    if (!p.autonomy)
                        return bad('levels are off: trustshell guard level shadow turns them on first');
                    if (words.length !== 3 || !['L1', 'L2', 'L3'].includes(lv) || !/^[1-9][0-9]{0,4}$/.test(n))
                        return bad('guard level after takes L1, L2 or L3, then a number of records');
                    p.autonomy = { ...p.autonomy, promote_after: { ...p.autonomy.promote_after, [lv]: Number(n) } };
                }
                else if (words.length !== 1)
                    return bad(`guard level ${sub} takes nothing`);
                else if (sub === 'off')
                    delete p.autonomy;
                else
                    p.autonomy = { ...(p.autonomy ?? autonomy_1.DEFAULT_AUTONOMY), mode: sub };
            }
            else {
                if (words.length)
                    return bad('guard kill takes nothing');
                p.actions = [];
            }
            // Supersession, as the kernel revokes: every change is a new policy with a higher nonce, so an older
            // policy (an export from before the change) can never be imported over it.
            p.nonce = (BigInt(p.nonce) + BigInt(1)).toString();
            const checked = (0, guardrails_1.parsePolicy)(p);
            if (!checked.ok) {
                io.err(`not written: ${checked.errors.join('; ')}`);
                return 2;
            }
            const next = { policy: checked.policy, signature: null };
            write(next);
            recordPolicyChange(dir, `guard ${verb}${words.length ? ' ' + words.join(' ') : ''}`, loaded.sha256, next);
            // Killing the policy is the owner revoking trust, so the level falls to L0 too.
            if (verb === 'kill' && checked.policy.autonomy)
                (0, autonomy_1.recordAutonomyEvent)(dir, (0, guardrails_1.nodeGuardFs)(), checked.policy.autonomy, { kind: 'revocation', via: 'guard kill' });
            if (loaded.doc.signature)
                io.err('the owner signature covered the old policy, so it was removed: trustshell guard sign signs this one');
            io.out(showLines({ policy: checked.policy, signature: null }, path, ledgerText(), checked.defaulted).slice(0, 5).join('\n'));
            if (verb === 'level')
                io.out(autonomyLine(checked.policy));
            return 0;
        }
        default:
            return bad('guard takes init, show, check, allow, deny, limit, expire, kill, sign or level');
    }
}
