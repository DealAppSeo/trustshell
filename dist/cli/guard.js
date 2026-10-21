"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARD_USAGE = exports.GuardRefusedError = exports.NEVER_GUARDED = exports.EXIT_REFUSED = void 0;
exports.backendHost = backendHost;
exports.plannedAction = plannedAction;
exports.guardedFetch = guardedFetch;
exports.runGuarded = runGuarded;
exports.runGuard = runGuard;
const api_url_1 = require("../lib/api-url");
const claim_1 = require("../lib/claim");
const guardrails_1 = require("../lib/guardrails");
const node_path_1 = require("node:path");
/** Exit code for an action the guardrails file refused. Never 0, and distinct from a VETO (1). */
exports.EXIT_REFUSED = 5;
/** Commands the gate never stops: the person can always read and change the rules. */
exports.NEVER_GUARDED = new Set(['help', 'version', 'guard']);
function hostOf(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return url;
    }
}
/** The backend host a command will dial: TRUSTSHELL_API_URL or the default. An unparseable value is kept as is, so it can never match a rule. */
function backendHost(env) {
    return hostOf(env.TRUSTSHELL_API_URL?.trim() || api_url_1.DEFAULT_API_URL);
}
/**
 * PURE. What a parsed command will do, as the guard weighs it: its name, the hosts it dials, and any
 * reason it must be refused whatever the file says. Mirrors HELP's NETWORK EGRESS table.
 */
function plannedAction(args, env) {
    const tool = args.command;
    const offline = env.OFFLINE === '1';
    const backend = [backendHost(env)];
    switch (tool) {
        case 'verify':
        case 'evaluate':
            return { action: { tool, hosts: offline ? [] : backend } };
        case 'repid':
        case 'proof':
        case 'badge':
        case 'receipt':
        case 'status':
        case 'bind-status':
            return { action: { tool, hosts: backend } };
        case 'check': {
            if (offline)
                return { action: { tool, hosts: [] } };
            if ((0, claim_1.isUrlOperand)(String(args.operand ?? '')))
                return { action: { tool, hosts: ['api.github.com'] } };
            return { action: { tool, hosts: env.TRUSTSHELL_LOCAL_ONLY === '1' ? [] : backend } };
        }
        case 'quarantine':
            // release --check hal asks the DEFAULT endpoint only (quarantine-hal.ts), whatever TRUSTSHELL_API_URL says.
            return { action: { tool, hosts: args.check === 'hal' ? [hostOf(api_url_1.DEFAULT_API_URL)] : [] } };
        case 'init':
            if (args.pai && !args.dryRun) {
                return { action: { tool, hosts: [] }, refuse: 'init --pai spawns scripts/init-pai.mjs, whose network the guard cannot see, so it is refused while a guardrails file is in force' };
            }
            return { action: { tool, hosts: [] } };
        default:
            return { action: { tool, hosts: [] } };
    }
}
class GuardRefusedError extends Error {
    constructor(host) {
        super(`REFUSED by guardrails: egress to ${host} is not in egress.allow`);
        this.host = host;
        this.name = 'GuardRefusedError';
    }
}
exports.GuardRefusedError = GuardRefusedError;
/** A `fetch` that refuses any host not in `allow`, calling `onRefuse` first. Everything else passes through untouched. */
function guardedFetch(inner, allow, onRefuse) {
    return (async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const host = hostOf(url);
        if (!allow.includes(host)) {
            onRefuse(host);
            throw new GuardRefusedError(host);
        }
        return inner(input, init);
    });
}
/**
 * Run `inner` (the command) under the guardrails file, if there is one. No file: `inner` runs exactly
 * as before. A refusal returns {@link EXIT_REFUSED} and never calls `inner`.
 */
async function runGuarded(args, inner, io, env = process.env) {
    if (args.error || exports.NEVER_GUARDED.has(args.command))
        return inner();
    const dir = (0, guardrails_1.trustshellHome)(env);
    const { action, refuse } = plannedAction(args, env);
    const g = (0, guardrails_1.guardAction)(dir, action, { extraReasons: refuse ? [refuse] : [] });
    if (!g)
        return inner();
    if (g.decision.decision === 'REFUSED') {
        io.err(`REFUSED by guardrails (${g.loaded.path}), receipt ${g.receipt.seq}:`);
        for (const r of g.decision.reasons)
            io.err(`  - ${r}`);
        io.err('Nothing was run. trustshell guard show prints the rules.');
        return exports.EXIT_REFUSED;
    }
    const allow = g.loaded.state === 'ok' ? g.loaded.guardrails.egress.allow : [];
    const realFetch = globalThis.fetch;
    let refused = false;
    globalThis.fetch = guardedFetch(realFetch, allow, (host) => {
        refused = true;
        (0, guardrails_1.guardAction)(dir, { tool: args.command, hosts: [host] });
        io.err(`REFUSED by guardrails: ${args.command} tried to reach ${host}, which is not in egress.allow (receipted)`);
    });
    try {
        const code = await inner();
        return refused ? exports.EXIT_REFUSED : code;
    }
    finally {
        globalThis.fetch = realFetch;
    }
}
exports.GUARD_USAGE = `trustshell guard init [--force]
trustshell guard show [--json]
trustshell guard check --tool <name> [--host <host>]... [--spend <amount>] [--json]
trustshell guard allow host|tool <value>
trustshell guard deny host|tool <value>
trustshell guard limit per-action|total <amount>`;
function showLines(g, path, ledgerText) {
    const l = (0, guardrails_1.readLedger)(ledgerText);
    const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : String(l.spent);
    return [
        `guardrails  ${path}`,
        `egress      ${g.egress.allow.length ? g.egress.allow.join(', ') : 'NONE: no command may dial out'}`,
        `tools       ${g.tools.allow.length ? g.tools.allow.join(', ') : 'NONE'} (help, version and guard always run)`,
        `spend       up to ${g.limits.spend_per_action} per action, ${g.limits.spend_total} in total; ${spent} allowed so far (${g.limits.unit})`,
        `receipts    ${l.count} in ${guardrails_1.GUARD_RECEIPTS_FILE}, chain ${l.verdict}${l.breaks.length ? ': ' + l.breaks.slice(0, 3).join('; ') : ''}`,
        ...(l.verdict === 'BROKEN'
            ? ['            No spend is allowed while it is BROKEN. Keep this file as evidence and move it aside to start a new ledger.']
            : []),
        '',
        'What this does not cover',
        ...guardrails_1.GUARD_DOES_NOT_COVER.map((s) => `* ${s}`),
    ];
}
function runGuard(argv, io, env = process.env) {
    const fs = require('node:fs');
    const dir = (0, guardrails_1.trustshellHome)(env);
    const path = (0, node_path_1.join)(dir, 'guardrails.json');
    const [verb, ...rest] = argv;
    const json = rest.includes('--json');
    const words = rest.filter((w) => w !== '--json');
    const usage = (m) => {
        io.err(`error: ${m}\n${exports.GUARD_USAGE}`);
        return 2;
    };
    const write = (g) => {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path, (0, guardrails_1.renderGuardrails)(g), { mode: 0o600 });
    };
    switch (verb) {
        case 'init': {
            if (words.some((w) => w !== '--force'))
                return usage(`guard init: unexpected ${words.find((w) => w !== '--force')}`);
            if (fs.existsSync(path) && !words.includes('--force')) {
                io.err(`guard init: ${path} exists; nothing was written (--force replaces it)`);
                return 2;
            }
            write((0, guardrails_1.defaultGuardrails)());
            io.out(`wrote ${path}: no network host, local commands only, spend limit 0. trustshell guard show prints it.`);
            return 0;
        }
        case 'show': {
            if (words.length)
                return usage(`guard show: unexpected ${words[0]}`);
            const loaded = (0, guardrails_1.loadGuardrails)(dir);
            const ledgerPath = (0, node_path_1.join)(dir, guardrails_1.GUARD_RECEIPTS_FILE);
            const ledgerText = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
            if (loaded.state === 'absent') {
                io.out(json ? JSON.stringify({ state: 'absent', path }, null, 2) : `no guardrails file at ${path}: nothing is enforced. trustshell guard init writes a default-deny one.`);
                return 0;
            }
            if (loaded.state === 'invalid') {
                io.out(json ? JSON.stringify(loaded, null, 2) : [`${path} does not parse, so EVERY guarded command is refused:`, ...loaded.problems.map((p) => `  - ${p}`)].join('\n'));
                return 1;
            }
            const l = (0, guardrails_1.readLedger)(ledgerText);
            if (json) {
                io.out(JSON.stringify({ state: 'ok', path, guardrails: loaded.guardrails, sha256: loaded.sha256, receipts: { count: l.count, chain: l.verdict, spent: l.spent === null ? null : String(l.spent), breaks: l.breaks } }, null, 2));
            }
            else
                io.out(showLines(loaded.guardrails, path, ledgerText).join('\n'));
            return l.verdict === 'BROKEN' ? 1 : 0;
        }
        case 'check': {
            let tool;
            let spend;
            const hosts = [];
            for (let i = 0; i < words.length; i += 1) {
                const w = words[i];
                const v = words[i + 1];
                if (w !== '--tool' && w !== '--host' && w !== '--spend')
                    return usage(`guard check: unexpected ${w}`);
                if (v === undefined || v.startsWith('-'))
                    return usage(`${w} requires a value`);
                if (w === '--tool')
                    tool = v;
                else if (w === '--host')
                    hosts.push(v.toLowerCase());
                else
                    spend = v;
                i += 1;
            }
            if (!tool)
                return usage('guard check requires --tool <name>');
            const action = { tool, hosts, ...(spend !== undefined ? { spend } : {}) };
            const g = (0, guardrails_1.guardAction)(dir, action, { origin: 'Cli' });
            if (!g) {
                io.out(json ? JSON.stringify({ decision: 'NOT_CHECKED', reason: `no guardrails file at ${path}` }, null, 2) : `NOT_CHECKED no guardrails file at ${path}; nothing was decided. This is not an allow.`);
                return 2;
            }
            if (json)
                io.out(JSON.stringify({ ...g.decision, receipt: g.receipt }, null, 2));
            else
                io.out([`${g.decision.decision}  receipt ${g.receipt.seq} ${g.receipt.hash}`, ...g.decision.reasons.map((r) => `  - ${r}`)].join('\n'));
            return g.decision.decision === 'ALLOWED' ? 0 : exports.EXIT_REFUSED;
        }
        case 'allow':
        case 'deny':
        case 'limit': {
            const loaded = (0, guardrails_1.loadGuardrails)(dir);
            if (loaded.state !== 'ok') {
                io.err(loaded.state === 'absent' ? `no guardrails file at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
                return 2;
            }
            const [what, value, extra] = words;
            if (!what || value === undefined || extra !== undefined)
                return usage(`guard ${verb} takes two words`);
            const g = JSON.parse(JSON.stringify(loaded.guardrails));
            if (verb === 'limit') {
                if (what !== 'per-action' && what !== 'total')
                    return usage('guard limit takes per-action or total');
                g.limits[what === 'per-action' ? 'spend_per_action' : 'spend_total'] = value;
            }
            else {
                if (what !== 'host' && what !== 'tool')
                    return usage(`guard ${verb} takes host or tool`);
                const list = what === 'host' ? g.egress.allow : g.tools.allow;
                const v = what === 'host' ? value.toLowerCase() : value;
                const next = verb === 'allow' ? (list.includes(v) ? list : [...list, v]) : list.filter((x) => x !== v);
                if (what === 'host')
                    g.egress.allow = next;
                else
                    g.tools.allow = next;
            }
            const checked = (0, guardrails_1.parseGuardrails)((0, guardrails_1.renderGuardrails)(g));
            if (!checked.guardrails) {
                io.err(`not written: ${checked.problems.join('; ')}`);
                return 2;
            }
            write(checked.guardrails);
            io.out(showLines(checked.guardrails, path, fs.existsSync((0, node_path_1.join)(dir, guardrails_1.GUARD_RECEIPTS_FILE)) ? fs.readFileSync((0, node_path_1.join)(dir, guardrails_1.GUARD_RECEIPTS_FILE), 'utf8') : '').slice(0, 4).join('\n'));
            return 0;
        }
        default:
            return usage('guard takes init, show, check, allow, deny or limit');
    }
}
