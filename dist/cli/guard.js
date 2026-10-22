"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARD_USAGE = exports.RUN_USAGE = exports.CHECK_SCOPE = exports.POLICY_SCOPE = exports.RUN_SCOPE = exports.CLI_SCOPE = exports.NEVER_GUARDED = exports.EXIT_REFUSED = void 0;
exports.recordPolicyChange = recordPolicyChange;
exports.plannedAction = plannedAction;
exports.runGuarded = runGuarded;
exports.formatRunCard = formatRunCard;
exports.runRun = runRun;
exports.runGuard = runGuard;
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const cli_1 = require("../learn/cli");
const guardrails_1 = require("../lib/guardrails");
const install_key_1 = require("../lib/install-key");
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
        authorized: { decision: 'ALLOWED', reasons: [], policy_sha256: sha, policy_nonce: after.policy.nonce, policy_signed_by: after.signature?.fingerprint ?? null },
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
/** The card `trustshell run` prints: the five things a reader must keep apart. */
function formatRunCard(decision, outcome) {
    const d = decision;
    const ex = outcome?.executed;
    const executed = ex && ex !== 'not run' ? `started; exited ${ex.exit_code ?? `on signal ${ex.signal}`} after ${ex.duration_ms} ms` : 'not run';
    return [
        `trustshell run  —  ${d.authorized.decision}`,
        `  requested             ${d.requested.action}${d.requested.executable ? ` (starts ${d.requested.executable})` : ''}${d.requested.amount_raw ? ` amount ${d.requested.amount_raw}` : ''}; --class is the caller's label`,
        `  authorized            ${d.authorized.decision}${d.authorized.reasons.length ? `: ${d.authorized.reasons.join('; ')}` : ''} (policy ${String(d.authorized.policy_sha256).slice(0, 12)}…, nonce ${d.authorized.policy_nonce}${d.authorized.policy_signed_by ? ', owner-signed' : ', unsigned'})`,
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
    if (g.decision.decision === 'DENIED') {
        (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome: null }, null, 2) : formatRunCard(g.record, null));
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
    (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome }, null, 2) : formatRunCard(g.record, outcome));
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
trustshell guard limit per-tx|daily|total <n> · guard expire <days> · guard kill · guard sign`;
function showLines(doc, path, ledgerText, defaulted) {
    const p = doc.policy;
    const l = (0, guardrails_1.readLedger)(ledgerText, undefined, undefined, (0, guardrails_1.policySha256)(p));
    const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : `${l.spent.today} in the last 24 h, ${l.spent.total} under this policy`;
    return [
        `policy      ${path}  (sha256 ${(0, guardrails_1.policySha256)(p).slice(0, 16)}…, nonce ${p.nonce}, ${doc.signature ? `signed by ${doc.signature.fingerprint.slice(0, 16)}…` : 'unsigned'})`,
        `subject     ${p.subject}`,
        `actions     ${p.actions.length ? p.actions.join(', ') : 'NONE: everything is denied'}  (anything unlisted is denied)`,
        'always      denied whatever the actions list: init --pai, learn check run, learn probe run (each starts a process the guard cannot see)',
        `limits      per_tx ${p.per_tx_raw} · daily ${p.daily_raw} · total ${p.total_raw} (smallest units)${defaulted.length ? `; left out, so 0: ${defaulted.join(', ')}` : ''}; allowed so far: ${spent}`,
        `expires     ${new Date(p.expires_at * 1000).toISOString()}`,
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
                io.out(json ? JSON.stringify(loaded, null, 2) : [`${path} does not parse, so EVERYTHING is denied:`, ...loaded.problems.map((p) => `  - ${p}`)].join('\n'));
                return 1;
            }
            const l = (0, guardrails_1.readLedger)(ledgerText(), undefined, undefined, loaded.sha256);
            if (json) {
                io.out(JSON.stringify({ state: 'ok', path, ...loaded.doc, sha256: loaded.sha256, defaulted: loaded.defaulted, records: { count: l.count, chain: l.verdict, spent: l.spent && { today: String(l.spent.today), total: String(l.spent.total) }, breaks: l.breaks } }, null, 2));
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
        case 'sign': {
            const loaded = (0, guardrails_1.loadPolicy)(dir);
            if (loaded.state !== 'ok') {
                io.err(loaded.state === 'absent' ? `no policy at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
                return 2;
            }
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
            if (loaded.doc.signature)
                io.err('the owner signature covered the old policy, so it was removed: trustshell guard sign signs this one');
            io.out(showLines({ policy: checked.policy, signature: null }, path, ledgerText(), checked.defaulted).slice(0, 5).join('\n'));
            return 0;
        }
        default:
            return bad('guard takes init, show, check, allow, deny, limit, expire, kill or sign');
    }
}
