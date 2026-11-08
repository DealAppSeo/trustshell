"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_MEDIATED_ALWAYS = exports.TRUST_REPORT_USAGE = exports.TRUST_REPORT_SCHEMA = void 0;
exports.buildTrustReport = buildTrustReport;
exports.renderTrustReportMarkdown = renderTrustReportMarkdown;
exports.renderTrustReportHtml = renderTrustReportHtml;
exports.sealBody = sealBody;
exports.runTrustReport = runTrustReport;
/**
 * `trustshell trust-report`: one readable report and its evidence, built only from what TrustShell already
 * records. Local files only. Opens no socket.
 *
 * It keeps two different capabilities apart on the page, because they prove different things:
 *   Inspect  what the agent SAID, compared with GitHub's record of a run. Needs no access to the agent.
 *   Guard    what was ASKED and decided for commands started through `trustshell run`. Nothing else is seen.
 *
 * There is no overall score. A report reads as what was checked, what was not, and what to do next.
 */
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const action_evidence_1 = require("../lib/action-evidence");
const guardrails_1 = require("../lib/guardrails");
const jcs_1 = require("../lib/jcs");
const owner_receipt_1 = require("../lib/owner-receipt");
const install_key_1 = require("../lib/install-key");
const decode_text_1 = require("../lib/decode-text");
const verify_receipt_1 = require("../lib/verify-receipt");
const version_1 = require("../lib/version");
exports.TRUST_REPORT_SCHEMA = 'dev.trustshell.trust-report/0.1-draft';
exports.TRUST_REPORT_USAGE = `trustshell trust-report --out <new dir> [--record <record.json>]... [--bind "<tool or script>=<claim>"]... [--title <text>] [--json]
trustshell trust-report verify <dir> [--root <0x key>] [--json]`;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MANIFEST = 'MANIFEST.sha256';
const SEAL = 'report-receipt.json';
exports.NOT_MEDIATED_ALWAYS = 'Anything the agent did without `trustshell run`: edits it made directly, its own network calls, commands in another terminal. This report cannot see them.';
const clean = (s, max = 400) => (0, action_evidence_1.cleanCodePoints)(String(s ?? '')).slice(0, max);
const sha256 = (b) => (0, node_crypto_1.createHash)('sha256').update(b).digest('hex');
function parseLedgerLines(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        try {
            const r = JSON.parse(line);
            if (r && typeof r === 'object' && !Array.isArray(r))
                out.push(r);
        }
        catch {
            /* readLedger reports this as a break */
        }
    }
    return out;
}
function resultOf(outcome, kind, decision) {
    if (kind === 'check')
        return { result: 'asked only: Guard decided, nothing was started by TrustShell', exit_code: null };
    if (decision !== 'ALLOWED')
        return { result: 'never started', exit_code: null };
    const ex = outcome?.executed;
    if (!ex || ex === 'not run')
        return { result: 'no outcome recorded', exit_code: null };
    if (ex.exit_code !== null)
        return { result: `exited ${ex.exit_code} after ${ex.duration_ms} ms`, exit_code: ex.exit_code };
    if (ex.signal)
        return { result: `stopped by signal ${ex.signal}`, exit_code: null };
    return { result: 'could not start', exit_code: null };
}
/** The commands a reader cares about: everything `run` started or refused, every `guard check`, every other refusal. */
function commandRows(records) {
    const rows = [];
    records.forEach((r, i) => {
        if (r.kind !== 'decision' && r.kind !== 'check')
            return;
        const started = r.requested.executable !== undefined;
        if (!started && r.kind !== 'check' && r.authorized?.decision === 'ALLOWED')
            return;
        const next = records[i + 1];
        const outcome = next?.kind === 'outcome' && next.requested?.action === r.requested?.action ? next : undefined;
        const req = r.requested;
        rows.push({
            seq: r.seq,
            ts: r.ts,
            action: clean(req.action, 140),
            script_sha256: req.script_sha256 ?? null,
            command_sha256: req.command_sha256 ?? null,
            decision: r.authorized?.decision ?? 'UNKNOWN',
            reasons: (r.authorized?.reasons ?? []).map((x) => clean(x, 300)),
            ...resultOf(outcome, r.kind, r.authorized?.decision),
        });
    });
    return rows;
}
function bindMatches(b, c) {
    if (b.script_sha256)
        return c.script_sha256 === b.script_sha256;
    return c.action === `tool:${b.tool}`;
}
/** The last matching command decides a bound claim. Anything but a clean exit code is NOT_CHECKED or worse. */
function decideBound(b, commands) {
    const base = { claim: b.claim, decided_by: b.decided_by };
    const hits = commands.filter((c) => bindMatches(b, c));
    const last = hits[hits.length - 1];
    if (!last)
        return { ...base, status: 'NOT_CHECKED', why: 'that command was never asked for through TrustShell', record_seq: null };
    // A last run with other arguments could select nothing and exit 0, so "the last run" only means one thing
    // when every run was the same command. An agent must not be able to replace a failure with an easier run.
    const variants = new Set(hits.filter((c) => c.decision === 'ALLOWED').map((c) => c.command_sha256));
    if (variants.size > 1)
        return { ...base, status: 'NOT_CHECKED', why: `it ran with ${variants.size} different command lines, so no one run decides this. Run the exact command you trust, using a fresh TRUSTSHELL_HOME.`, record_seq: last.seq };
    const scope = `record ${last.seq}`;
    if (last.exit_code === 0)
        return { ...base, status: 'SUPPORTED', why: `the last time it ran through trustshell run it exited 0 (${scope}). That shows this command passed, not that it tests what the claim says.`, record_seq: last.seq };
    if (last.exit_code !== null)
        return { ...base, status: 'CONTRADICTED', why: `the last time it ran through trustshell run it exited ${last.exit_code} (${scope})`, record_seq: last.seq };
    return { ...base, status: 'NOT_CHECKED', why: `it did not finish with an exit code: ${last.result} (${scope})`, record_seq: last.seq };
}
function inspectRow(path, text) {
    const parsed = JSON.parse(text);
    const record = parsed.record;
    if (!record || record.schema !== action_evidence_1.ACTION_EVIDENCE_SCHEMA)
        throw new Error(`${path} is not a check --claims record (${action_evidence_1.ACTION_EVIDENCE_SCHEMA})`);
    const o = record.observation;
    const digest = (0, action_evidence_1.digestRecord)(record).value;
    return {
        path,
        run_url: clean(o.url, 300),
        repo: `${clean(o.owner, 100)}/${clean(o.repo, 100)}`,
        run_id: o.run_id,
        head_sha: clean(o.head_sha, 80),
        conclusion: o.conclusion === null ? null : clean(o.conclusion, 40),
        verdict: clean(o.check.verdict, 40),
        fetched_at: clean(o.fetchedAt, 40),
        digest,
        digest_matches: parsed.digest?.value === digest,
        exit: (0, action_evidence_1.claimsExitCode)(record),
        claims: record.claims.map((c) => ({ status: c.status, claim: clean(c.claim, 300), scope: clean(c.scope, 400) })),
    };
}
function nextActions(r) {
    const out = [];
    if (r.guard.ledger.verdict === 'BROKEN')
        out.push('Do not rely on the command section: the Guard record chain is broken. Read the breaks listed there.');
    for (const i of r.inspect)
        if (!i.digest_matches)
            out.push(`Do not rely on the record for run ${i.run_id}: it changed after it was made.`);
    for (const i of r.inspect) {
        for (const c of i.claims)
            if (c.status === 'CONTRADICTED')
                out.push(`Do not accept "${c.claim}". GitHub's record disagrees: ${i.run_url}`);
    }
    for (const b of r.bound_claims)
        if (b.status === 'CONTRADICTED')
            out.push(`Do not accept "${b.claim}". ${b.decided_by} says otherwise. Fix it or ask the agent why, then run it again through trustshell run.`);
    const notChecked = r.inspect.reduce((n, i) => n + i.claims.filter((c) => c.status === 'NOT_CHECKED').length, 0) + r.bound_claims.filter((b) => b.status === 'NOT_CHECKED').length;
    if (notChecked)
        out.push(`${notChecked} claim${notChecked === 1 ? ' was' : 's were'} not checked, which is not a pass. To decide one: say it as one plain sentence that cites the run ("The check workflow succeeded, run 123."), or pair it with a command using --bind.`);
    const seen = new Set();
    for (const c of r.guard.commands.filter((x) => x.decision !== 'ALLOWED')) {
        const why = c.reasons[0] ?? 'no reason was recorded';
        if (seen.has(why))
            continue;
        seen.add(why);
        const unlisted = why.startsWith('the owner policy does not list');
        out.push(`The policy refused ${c.action}: ${why}. If that was what you wanted, nothing to do.${unlisted ? ` If the agent needed it, run trustshell guard allow ${c.action}, then repeat the task.` : ''}`);
    }
    if (out.length === 0)
        out.push('Nothing here contradicts the agent. Read the commands above and decide whether they test what you care about.');
    return out;
}
/** PURE. The whole report, from its inputs. `verify` calls this again to prove the report matches its evidence. */
function buildTrustReport(input) {
    const inspect = input.records.map((r) => inspectRow(r.path, r.text));
    const records = parseLedgerLines(input.ledgerText);
    const ledger = (0, guardrails_1.readLedger)(input.ledgerText);
    const commands = commandRows(records);
    const parsedPolicy = input.policyText === null ? null : (0, guardrails_1.parsePolicyDocument)(input.policyText);
    const doc = parsedPolicy?.ok ? parsedPolicy.doc : null;
    const lastPolicy = [...records].reverse().find((r) => r.authorized?.policy_sha256);
    const dedupe = (pick) => [...new Set(records.filter((r) => r.kind === 'decision' || r.kind === 'outcome').filter((r) => r.requested.executable !== undefined).flatMap((r) => pick(r) ?? []))].map((s) => clean(s, 300));
    const guard = {
        policy: {
            state: input.policyText === null ? 'absent' : doc ? 'ok' : 'unreadable',
            sha256: lastPolicy?.authorized.policy_sha256 ?? null,
            nonce: doc?.policy.nonce ?? null,
            signed: Boolean(doc?.signature),
            actions: (doc?.policy.actions ?? []).map((a) => clean(a, 140)),
        },
        ledger: { verdict: ledger.verdict, count: ledger.count, breaks: ledger.breaks.map((b) => clean(b, 200)) },
        commands,
        mediated: dedupe((r) => r.assurance_scope?.mediated),
        not_mediated: [...dedupe((r) => r.assurance_scope?.not_mediated), exports.NOT_MEDIATED_ALWAYS],
    };
    const bound_claims = input.binds.map((b) => decideBound(b, commands));
    const partial = { inspect, guard, bound_claims };
    const finding = inspect.some((i) => i.exit === 1 || !i.digest_matches) || bound_claims.some((b) => b.status === 'CONTRADICTED') || ledger.verdict === 'BROKEN';
    const open = inspect.some((i) => i.exit !== 0) || bound_claims.some((b) => b.status !== 'SUPPORTED') || (inspect.length === 0 && bound_claims.length === 0);
    return {
        schema: exports.TRUST_REPORT_SCHEMA,
        title: clean(input.title, 140),
        generated_at: input.generatedAt,
        generator: input.generator,
        inputs: { binds: input.binds, records: input.records.map((r) => r.path) },
        inspect,
        guard,
        bound_claims,
        next_actions: nextActions(partial),
        exit: finding ? 1 : open ? 3 : 0,
    };
}
function blocks(r) {
    const out = [];
    out.push({ heading: 'What to do next', rows: r.next_actions.map((text) => ({ text })) });
    if (r.inspect.length) {
        for (const i of r.inspect) {
            out.push({
                heading: `Path 1 · What the agent said about ${i.repo} run ${i.run_id}`,
                note: `Compared with GitHub's own record, read ${i.fetched_at}: ${i.verdict}, conclusion ${i.conclusion ?? 'none'}, commit ${i.head_sha}. TrustShell needed no access to the agent or its keys. ${i.run_url}`,
                rows: i.claims.length ? i.claims.map((c) => ({ status: c.status, text: c.claim, detail: c.scope })) : [{ status: 'NOT_CHECKED', text: 'No claims were given for this run.' }],
            });
        }
    }
    else {
        out.push({ heading: 'Path 1 · What the agent said about a GitHub Actions run', note: 'Not used in this report.', rows: [] });
    }
    if (r.bound_claims.length) {
        out.push({
            heading: 'Claims you paired with a command',
            note: 'You chose which command decides each claim. TrustShell only reads how that command ended.',
            rows: r.bound_claims.map((b) => ({ status: b.status, text: b.claim, detail: `decided by ${b.decided_by}: ${b.why}` })),
        });
    }
    const g = r.guard;
    out.push({
        heading: 'Path 2 · Commands that went through trustshell run',
        note: g.commands.length
            ? `Only these. Policy ${g.policy.state}, ${g.policy.signed ? 'signed' : 'not signed'}, nonce ${g.policy.nonce ?? 'none'}. Record chain ${g.ledger.verdict}, ${g.ledger.count} records.`
            : 'No command went through TrustShell, so this report says nothing about what the agent ran.',
        rows: g.commands.map((c) => ({ status: c.decision, text: `#${c.seq} ${c.action}: ${c.result}`, detail: c.reasons.join('; ') || undefined })),
    });
    if (g.ledger.breaks.length)
        out.push({ heading: 'The record chain is broken', rows: g.ledger.breaks.map((text) => ({ text })) });
    out.push({ heading: 'What Guard saw', rows: g.mediated.map((text) => ({ text })) });
    out.push({ heading: 'What this report cannot see', rows: g.not_mediated.map((text) => ({ text })) });
    return out;
}
const INTRO = 'There is no overall score. Each line says what was checked and what it does not show.';
const PRIVACY = 'Made on this machine. Nothing was uploaded. evidence/policy.json can hold local file paths: read it before sharing this folder.';
const mdSafe = (s) => s.replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1');
function renderTrustReportMarkdown(r) {
    const out = [`# ${mdSafe(r.title)}`, '', `${INTRO} Made ${r.generated_at} by ${mdSafe(r.generator)}.`, ''];
    for (const b of blocks(r)) {
        out.push(`## ${mdSafe(b.heading)}`, '');
        if (b.note)
            out.push(mdSafe(b.note), '');
        for (const row of b.rows)
            out.push(`- ${row.status ? `**${row.status}** ` : ''}${mdSafe(row.text)}${row.detail ? `\n  - ${mdSafe(row.detail)}` : ''}`);
        if (b.rows.length)
            out.push('');
    }
    out.push('---', '', mdSafe(PRIVACY), '');
    return out.join('\n');
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CSS = `:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--ok:#1a7f37;--bad:#cf222e;--nc:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--ok:#3fb950;--bad:#f85149;--nc:#d29922}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 8px}h2{font-size:16px;margin:24px 0 8px}p{margin:0 0 8px;overflow-wrap:anywhere}
ul{padding-left:20px;margin:0}li{margin:6px 0;overflow-wrap:anywhere}.d{color:var(--muted);font-size:14px;display:block}.n{color:var(--muted)}
.SUPPORTED,.ALLOWED{color:var(--ok)}.CONTRADICTED,.DENIED{color:var(--bad)}.NOT_CHECKED{color:var(--nc)}footer{margin-top:24px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}`;
function renderTrustReportHtml(r) {
    const out = [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
        // No script, no remote anything: a stranger may open this file.
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
        `<title>${esc(r.title)}</title><style>${CSS}</style></head><body><main>`,
        `<h1>${esc(r.title)}</h1><p class="n">${esc(INTRO)} Made ${esc(r.generated_at)} by ${esc(r.generator)}.</p>`,
    ];
    for (const b of blocks(r)) {
        out.push(`<h2>${esc(b.heading)}</h2>`);
        if (b.note)
            out.push(`<p class="n">${esc(b.note)}</p>`);
        if (b.rows.length) {
            out.push('<ul>');
            for (const row of b.rows)
                out.push(`<li>${row.status ? `<strong class="${esc(row.status)}">${esc(row.status)}</strong> ` : ''}${esc(row.text)}${row.detail ? `<span class="d">${esc(row.detail)}</span>` : ''}</li>`);
            out.push('</ul>');
        }
    }
    out.push(`<footer>${esc(PRIVACY)}</footer></main></body></html>`, '');
    return out.join('\n');
}
function walk(root, dir = root) {
    return (0, node_fs_1.readdirSync)(dir, { withFileTypes: true }).flatMap((e) => {
        const p = (0, node_path_1.join)(dir, e.name);
        return e.isDirectory() ? walk(root, p) : [(0, node_path_1.relative)(root, p).split(node_path_1.sep).join('/')];
    });
}
function readLimited(path) {
    if ((0, node_fs_1.statSync)(path).size > MAX_INPUT_BYTES)
        throw new Error(`${path} is larger than ${MAX_INPUT_BYTES} bytes`);
    return (0, decode_text_1.decodeText)((0, node_fs_1.readFileSync)(path));
}
function parseBind(raw, cwd) {
    const at = raw.indexOf('=');
    if (at < 1 || at === raw.length - 1)
        return `--bind needs "<tool or script>=<claim>", got: ${clean(raw, 80)}`;
    const decided_by = clean(raw.slice(0, at), 200).trim();
    const claim = clean(raw.slice(at + 1), 300).trim();
    if (!decided_by || !claim)
        return `--bind needs "<tool or script>=<claim>", got: ${clean(raw, 80)}`;
    const file = (0, node_path_1.resolve)(cwd, decided_by);
    if ((0, node_fs_1.existsSync)(file) && (0, node_fs_1.statSync)(file).isFile())
        return { claim, decided_by, tool: null, script_sha256: sha256((0, node_fs_1.readFileSync)(file)) };
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(decided_by))
        return `--bind: ${clean(decided_by, 80)} is not a tool name or a file that exists`;
    return { claim, decided_by, tool: decided_by.replace(/^tool:/, ''), script_sha256: null };
}
/** The sealed receipt names the manifest's sha256 in args_hash, so one signature covers every listed file. */
function sealBody(manifestSha, createdAt) {
    return {
        header: { receipt_id: `trust-report-${manifestSha.slice(0, 16)}`, prev_receipt_id: null, prev_hash: null, created_at: createdAt, env: { network: 'none', chain_id: 0, is_simulated: true } },
        subject: { agent: { agent_id: 'local', agent_name: 'trustshell trust-report' }, owner: { wallet: null, assurance: null, status: 'none' } },
        request: { tool: { name: 'trust-report', class: 'read' }, origin: 'Cli', args_hash: `0x${manifestSha}`, amount_raw: null, payee: null, asset: null, chain_id: null },
        decision: {
            verdict: 'ALLOW',
            blocking: false,
            executed: true,
            reasons: ['sealed the manifest of a trust report'],
            checks: [{ name: 'manifest', outcome: 'PASS', source: 'owner' }],
            does_not_attest: ['that the commands in the report test what the claims say', 'anything done outside trustshell run'],
            policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' },
            limits: {},
            laya: { lane: null, mode: 'shadow', consulted: false },
        },
        payment: { status: 'none' },
        verification: { status: 'none' },
    };
}
async function create(argv, io, env, cwd) {
    let out;
    let title = 'TrustShell Trust Report';
    let json = false;
    const recordPaths = [];
    const binds = [];
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        const value = () => argv[++i];
        if (a === '--json')
            json = true;
        else if (a === '--out' || a === '--title' || a === '--record' || a === '--bind') {
            const v = value();
            if (v === undefined)
                return usage(io, `${a} needs a value`);
            if (a === '--out')
                out = v;
            else if (a === '--title')
                title = v;
            else if (a === '--record')
                recordPaths.push(v);
            else {
                const b = parseBind(v, cwd);
                if (typeof b === 'string')
                    return usage(io, b);
                binds.push(b);
            }
        }
        else
            return usage(io, `unexpected ${clean(a, 60)}`);
    }
    if (!out)
        return usage(io, '--out <new dir> is required');
    const outDir = (0, node_path_1.resolve)(cwd, out);
    if ((0, node_fs_1.existsSync)(outDir) && (0, node_fs_1.readdirSync)(outDir).length > 0)
        return usage(io, `${out} already has files in it. Name a new folder; a report is never written over another.`);
    const home = (0, guardrails_1.trustshellHome)(env);
    const ledgerPath = (0, node_path_1.join)(home, guardrails_1.GUARD_RECEIPTS_FILE);
    const policyPath = (0, node_path_1.join)(home, guardrails_1.POLICY_FILE);
    const ledgerText = (0, node_fs_1.existsSync)(ledgerPath) ? readLimited(ledgerPath) : '';
    const policyText = (0, node_fs_1.existsSync)(policyPath) ? readLimited(policyPath) : null;
    if (recordPaths.length === 0 && binds.length === 0 && ledgerText === '') {
        io.err(`NOT_CHECKED nothing to report: no --record, no --bind, and no Guard records in ${home}.`);
        return 2;
    }
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(outDir, 'evidence'), { recursive: true });
    const records = [];
    try {
        recordPaths.forEach((p, i) => {
            const from = (0, node_path_1.resolve)(cwd, p);
            const rel = `evidence/inspect-${i + 1}/record.json`;
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(outDir, (0, node_path_1.dirname)(rel)), { recursive: true });
            (0, node_fs_1.copyFileSync)(from, (0, node_path_1.join)(outDir, rel));
            for (const card of ['card.md', 'card.html']) {
                const c = (0, node_path_1.join)((0, node_path_1.dirname)(from), card);
                if ((0, node_fs_1.existsSync)(c))
                    (0, node_fs_1.copyFileSync)(c, (0, node_path_1.join)(outDir, (0, node_path_1.dirname)(rel), card));
            }
            records.push({ path: rel, text: readLimited(from) });
        });
        if (ledgerText !== '')
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, 'evidence', guardrails_1.GUARD_RECEIPTS_FILE), ledgerText);
        if (policyText !== null)
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, 'evidence', guardrails_1.POLICY_FILE), policyText);
        const report = buildTrustReport({ title, generatedAt: new Date().toISOString(), generator: `trustshell ${(0, version_1.resolvePackageVersion)(__dirname)}`, binds, records, ledgerText, policyText });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, 'trust-report.md'), renderTrustReportMarkdown(report));
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, 'trust-report.html'), renderTrustReportHtml(report));
        const manifest = walk(outDir).sort().map((f) => `${sha256((0, node_fs_1.readFileSync)((0, node_path_1.join)(outDir, f)))}  ${f}`).join('\n');
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, MANIFEST), `${manifest}\n`);
        const { key } = (0, install_key_1.signingKey)(home);
        const seal = await (0, owner_receipt_1.signOwnerReceipt)(sealBody(sha256(`${manifest}\n`), report.generated_at), key);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, SEAL), `${JSON.stringify(seal, null, 2)}\n`);
        const root = (0, owner_receipt_1.installKeyRootHex)(key);
        if (json)
            io.out(JSON.stringify({ report, out: outDir, root }, null, 2));
        else {
            const count = (s) => report.inspect.reduce((n, i) => n + i.claims.filter((c) => c.status === s).length, 0) + report.bound_claims.filter((b) => b.status === s).length;
            io.out(`Trust Report written to ${outDir}`);
            io.out(`  claims     ${count('SUPPORTED')} supported, ${count('CONTRADICTED')} contradicted, ${count('NOT_CHECKED')} not checked`);
            io.out(`  commands   ${report.guard.commands.filter((c) => c.decision === 'ALLOWED').length} allowed, ${report.guard.commands.filter((c) => c.decision !== 'ALLOWED').length} refused, chain ${report.guard.ledger.verdict}`);
            io.out('  read       trust-report.html or trust-report.md; the evidence is in evidence/');
            io.out(`  check it   trustshell trust-report verify ${out} --root ${root}`);
            io.out('  not seen   anything the agent did without trustshell run');
        }
        return report.exit;
    }
    catch (e) {
        io.err(`trust-report: could not build the report: ${clean(e.message, 300)}`);
        return 3;
    }
}
function usage(io, why) {
    io.err(`trust-report: ${why}\n${exports.TRUST_REPORT_USAGE}`);
    return 2;
}
/** Exit 0 VERIFIED, 1 FAILED, 2 NOT_CHECKED (nothing to check, or no key to check authorship against). */
async function verify(argv, io, cwd) {
    let dirArg;
    let root;
    let json = false;
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--json')
            json = true;
        else if (a === '--root')
            root = argv[++i];
        else if (a.startsWith('--'))
            return usage(io, `unexpected ${clean(a, 60)}`);
        else if (dirArg === undefined)
            dirArg = a;
        else
            return usage(io, `unexpected ${clean(a, 60)}`);
    }
    if (!dirArg)
        return usage(io, 'verify needs <dir>');
    const dir = (0, node_path_1.resolve)(cwd, dirArg);
    const manifestPath = (0, node_path_1.join)(dir, MANIFEST);
    if (!(0, node_fs_1.existsSync)(manifestPath)) {
        io.err(`NOT_CHECKED no ${MANIFEST} in ${dirArg}: this is not a trust report folder, or it is incomplete.`);
        return 2;
    }
    const problems = [];
    const manifestText = readLimited(manifestPath);
    const listed = new Map(manifestText.split('\n').filter(Boolean).map((l) => {
        const at = l.indexOf('  ');
        return [l.slice(at + 2), l.slice(0, at)];
    }));
    for (const [f, want] of listed) {
        const p = (0, node_path_1.join)(dir, f);
        if (f.includes('..') || !(0, node_fs_1.existsSync)(p))
            problems.push(`${f} is listed but missing`);
        else if (sha256((0, node_fs_1.readFileSync)(p)) !== want)
            problems.push(`${f} changed after the report was made`);
    }
    for (const f of walk(dir))
        if (f !== MANIFEST && f !== SEAL && !listed.has(f))
            problems.push(`${f} is not in the manifest`);
    let authorship = 'NOT_CHECKED';
    try {
        const receipt = JSON.parse(readLimited((0, node_path_1.join)(dir, SEAL)));
        if (receipt?.request?.args_hash !== `0x${sha256(manifestText)}`)
            problems.push('the seal does not name this manifest');
        const result = await (0, verify_receipt_1.verifyReceiptOffline)(receipt, root ? { trustedRoots: root.split(',') } : {});
        const integrity = result.claims?.integrity?.status;
        if (root) {
            authorship = integrity === 'VERIFIED' && result.sealer?.trusted ? 'VERIFIED' : 'FAILED';
            if (authorship === 'FAILED')
                problems.push('the seal was not made by the key you pinned, or it was altered');
        }
        else if (integrity === 'FAILED')
            problems.push('the seal was altered');
    }
    catch (e) {
        problems.push(`the seal could not be read: ${clean(e.message, 160)}`);
    }
    try {
        const report = JSON.parse(readLimited((0, node_path_1.join)(dir, 'report.json')));
        const records = report.inputs.records.map((path) => {
            if (path.includes('..'))
                throw new Error(`bad evidence path ${clean(path, 80)}`);
            return { path, text: readLimited((0, node_path_1.join)(dir, path)) };
        });
        const ledger = (0, node_path_1.join)(dir, 'evidence', guardrails_1.GUARD_RECEIPTS_FILE);
        const policy = (0, node_path_1.join)(dir, 'evidence', guardrails_1.POLICY_FILE);
        const again = buildTrustReport({
            title: report.title,
            generatedAt: report.generated_at,
            generator: report.generator,
            binds: report.inputs.binds,
            records,
            ledgerText: (0, node_fs_1.existsSync)(ledger) ? readLimited(ledger) : '',
            policyText: (0, node_fs_1.existsSync)(policy) ? readLimited(policy) : null,
        });
        if ((0, jcs_1.jcsSha256)(again) !== (0, jcs_1.jcsSha256)(report))
            problems.push('report.json does not match what its evidence produces');
        if (renderTrustReportMarkdown(again) !== readLimited((0, node_path_1.join)(dir, 'trust-report.md')))
            problems.push('trust-report.md does not match what its evidence produces');
        if (renderTrustReportHtml(again) !== readLimited((0, node_path_1.join)(dir, 'trust-report.html')))
            problems.push('trust-report.html does not match what its evidence produces');
        if (again.guard.ledger.verdict === 'BROKEN')
            problems.push('the Guard record chain is broken');
        for (const i of again.inspect)
            if (!i.digest_matches)
                problems.push(`${i.path}: its digest does not match its contents`);
    }
    catch (e) {
        problems.push(`the report could not be rebuilt: ${clean(e.message, 200)}`);
    }
    const verdict = problems.length ? 'FAILED' : authorship === 'VERIFIED' ? 'VERIFIED' : 'NOT_CHECKED';
    if (json)
        io.out(JSON.stringify({ verdict, authorship, problems }, null, 2));
    else {
        io.out(`${verdict} ${problems.length ? 'this report does not match its evidence' : authorship === 'VERIFIED' ? 'every file is whole, the report matches its evidence, and the pinned key sealed it' : 'every file is whole and the report matches its evidence, but who made it was not checked: pass --root <key from the author>'}`);
        for (const p of problems)
            io.out(`  - ${p}`);
        io.out('  does not show: that the commands test what the claims say, or anything done outside trustshell run');
    }
    return problems.length ? 1 : authorship === 'VERIFIED' ? 0 : 2;
}
async function runTrustReport(argv, io, env = process.env, cwd = process.cwd()) {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        io.out(exports.TRUST_REPORT_USAGE);
        return argv.length === 0 ? 2 : 0;
    }
    return argv[0] === 'verify' ? verify(argv.slice(1), io, cwd) : create(argv, io, env, cwd);
}
