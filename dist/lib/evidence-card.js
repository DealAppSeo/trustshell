"use strict";
/**
 * The static card for an action-evidence record — Markdown and HTML.
 * ------------------------------------------------------------------
 * RENDERED FROM THE RECORD AND NOTHING ELSE. Both renderers take an {@link ActionEvidenceRecord}
 * and compute its digest themselves, so the hash printed on a card is always the hash of the
 * record it was drawn from. There is no parameter through which raw claim text, or anything not in
 * the record, could reach the card. (`demo` adds one fixed banner sentence and nothing else.)
 *
 * EVERY NOT_CHECKED ITEM IS ON THE CARD, in its own section, next to the reason. A card that
 * shows the supported claims and lets the rest fall off the bottom is the product failing.
 *
 * FOREIGN TEXT IS INERT. Claim sentences, and names GitHub returns for someone else's repository
 * (workflow, job), are attacker-controlled. In Markdown they go in code spans, where nothing is a
 * link, an image, emphasis or HTML; in HTML they are entity-escaped. Both renderers share one
 * model, so they cannot disagree about what is on the card.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_BANNER = void 0;
exports.mdCode = mdCode;
exports.renderCardMarkdown = renderCardMarkdown;
exports.renderCardHtml = renderCardHtml;
const check_1 = require("./check");
const action_evidence_1 = require("./action-evidence");
// EVERY string on the card passes through cleanCodePoints here, in the only three constructors
// there are. A workflow or job name is someone else's text; with an ESC in it, the default stdout
// card carried an OSC 52 clipboard write and a clear-screen to the terminal (XC1 S1). The record
// keeps the raw value, where JSON escaping makes it inert.
const text = (v) => ({ t: 'text', v: (0, action_evidence_1.cleanCodePoints)(v) });
const code = (v) => ({ t: 'code', v: (0, action_evidence_1.cleanCodePoints)(v) });
const strong = (v) => ({ t: 'strong', v: (0, action_evidence_1.cleanCodePoints)(v) });
/** What a template is ABOUT, for the "<topic>: not checked" line. Keyed by template id, never by claim text. */
const TOPIC = {
    'gha.run_succeeded': 'This workflow run succeeding',
    'ci.all_checks_pass': 'All checks on the commit passing',
    'ci.tests_pass': 'Tests passing',
    'ci.build_unscoped': 'An unnamed build passing',
    'git.head_sha': 'Cited commit',
    'gha.run_id': 'Cited run',
    'gha.run_attempt': 'Cited attempt',
    'excluded.completion': 'Task completion',
    'excluded.security': 'Broader security',
    'excluded.no_bugs': 'Absence of bugs',
    'excluded.readiness': 'Production readiness',
    'excluded.fix': 'Whether the change fixes the problem',
    'excluded.local_run': 'Runs outside this workflow',
    'excluded.test_count': 'Test counts',
    'excluded.coverage': 'Coverage',
    'excluded.deployment': 'Deployment',
    'excluded.performance': 'Performance',
    'excluded.review': 'Review and approval',
    'excluded.markup': 'Markup or non-ASCII text',
    unmapped: 'Unmapped claim',
    truncated: 'Sentences not read',
};
/** The one sentence `demo` adds. Fixed text: nothing from the record or the input reaches it. */
exports.DEMO_BANNER = 'Sample output for review, generated from a real public GitHub Actions run. Not an official TrustShell result.';
function jobSummary(r) {
    const j = r.observation.jobs;
    const counts = new Map();
    for (const x of j.items) {
        // A GitHub enum (success, skipped, in_progress…). Anything else is counted, never printed.
        const raw = x.conclusion ?? x.status;
        const k = raw && /^[a-z_]{1,32}$/.test(raw) ? raw : 'unrecognised';
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const parts = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${n} ${k}`);
    const line = [strong('Jobs'), text(` ${j.items.length} of ${j.total} read (HTTP ${j.http_status})${parts.length ? ': ' + parts.join(', ') : ''}`)];
    const other = j.items.filter((x) => x.conclusion !== 'success' && x.conclusion !== 'skipped');
    if (other.length) {
        line.push(text('. Not success: '));
        other.slice(0, 10).forEach((x, i) => {
            if (i)
                line.push(text(', '));
            line.push(code(x.name || '(unnamed)'));
        });
        if (other.length > 10)
            line.push(text(` and ${other.length - 10} more`));
    }
    return line;
}
const BASE_HOW = {
    associated: 'the pull requests GitHub associates with this commit',
    head: "the pull request found by the run's head branch (a fork)",
    push: 'the branch this push ran on',
    unresolved: 'nothing: the pull request could not be found, so required checks are unknown',
};
/** Guided mode: every check on the commit, as counts. Check names are third-party text and stay out. */
function commitChecksSummary(r) {
    const c = r.observation.commit_checks;
    if (!c)
        return [];
    const tally = (values) => {
        const m = new Map();
        for (const v of values) {
            const k = /^[a-z_]{1,32}$/.test(v) ? v : 'unrecognised';
            m.set(k, (m.get(k) ?? 0) + 1);
        }
        return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
    };
    const reported = new Set([...c.check_runs.items.map((x) => x.name), ...c.statuses.items.map((x) => x.context)]);
    // A required check pinned to an app counts only when that app's run reported it.
    const met = (q) => q.app_id !== null ? c.check_runs.items.some((x) => x.name === q.context && x.app_id === q.app_id) : reported.has(q.context);
    const req = c.required === null ? 'not read' : `${c.required.filter(met).length} of ${c.required.length} reported`;
    const rerun = c.superseded_failures === null ? 'not read' : String(c.superseded_failures);
    const wf = c.workflows_changed === null ? 'not read' : c.workflows_changed ? 'yes' : 'no';
    return [
        [strong('Guided mode (experimental).'), text(' A claim line that cites nothing was read as being about this run.')],
        [
            strong('Every check on the commit'),
            text(` read ${c.started_at} to ${c.retrieved_at}: ${c.check_runs.items.length} of ${c.check_runs.total_count} check runs (${tally(c.check_runs.items.map((x) => x.conclusion ?? x.status))})` +
                ` · ${c.statuses.items.length} of ${c.statuses.total_count} statuses (${tally(c.statuses.items.map((x) => x.state))})` +
                ` · required checks: ${req} · failed on an earlier attempt: ${rerun} · the change edits its own workflows: ${wf}`),
        ],
        [
            strong('Base branch'),
            text(` (whose required checks apply), found from ${BASE_HOW[c.base.how]}: `),
            ...(c.base.branches.length ? c.base.branches.slice(0, 5).flatMap((b, i) => [...(i ? [text(', ')] : []), code(b)]) : [text('none')]),
        ],
    ];
}
function claimDetails(c) {
    const d = [];
    if (c.sentence !== c.claim)
        d.push([strong('In'), text(' '), code(c.sentence)]);
    d.push([strong('Template'), text(' '), code(c.template)], [strong('Why'), text(' ' + c.reason)], [strong('Scope'), text(' ' + c.scope)]);
    if (c.evidence_fields.length) {
        const l = [strong('Fields')];
        c.evidence_fields.forEach((f, i) => l.push(text(i ? ', ' : ' '), code(f)));
        d.push(l);
    }
    return d;
}
function buildModel(r, opts) {
    const o = r.observation;
    const t = (0, action_evidence_1.tallyClaims)(r.claims);
    const digest = (0, action_evidence_1.digestRecord)(r);
    const facts = [
        [strong('Run'), text(' '), code(`${o.owner}/${o.repo}`), text(` · run ${o.run_id} · attempt ${o.run_attempt ?? 'unknown'} · commit `), code(o.head_sha || '(none)')],
        [strong('Workflow'), text(' '), code(o.workflow.name || '(unnamed)'), text(' · '), code(o.workflow.path || '(no path)')],
        [
            strong('GitHub reports'),
            text(' status '),
            code(o.status || '(none)'),
            text(' · conclusion '),
            code(o.conclusion ?? '(none)'),
            text(' · check verdict '),
            strong(o.check.verdict),
        ],
        jobSummary(r),
        ...commitChecksSummary(r),
        [strong('Observed'), text(` ${o.fetchedAt} from ${o.host} (${o.freshness} at that time)`)],
        [
            strong('Evidence class'),
            text(` ${r.assurance.observation}: GitHub describing its own run. A platform record, not an independent grade.`),
        ],
    ];
    const checked = r.claims
        .filter((c) => c.status !== 'NOT_CHECKED')
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'CONTRADICTED' ? -1 : 1))
        .map((c) => ({ status: c.status, head: [strong(c.status), text(' '), code(c.claim)], details: claimDetails(c) }));
    // Each atomic claim is listed on its own, with the sentence it came from when that is wider.
    const notChecked = r.claims
        .filter((c) => c.status === 'NOT_CHECKED')
        .map((c) => {
        const l = [strong(`${TOPIC[c.template] ?? c.template}: not checked.`), text(' '), code(c.claim), text(' ' + c.reason)];
        if (c.sentence !== c.claim)
            l.push(text(' In: '), code(c.sentence));
        return l;
    });
    if (r.assurance.cryptographic_integrity === 'NOT_CHECKED') {
        notChecked.push([
            strong('Cryptographic integrity: not checked.'),
            text(' No signed attestation was present or verified. This version does not read attestations.'),
        ]);
    }
    return {
        banner: opts.demo ? [strong('DEMO.'), text(' ' + exports.DEMO_BANNER)] : null,
        title: 'TrustShell · claims checked against a GitHub Actions run',
        facts,
        tallyLine: `${t.SUPPORTED} supported · ${t.CONTRADICTED} contradicted · ${t.NOT_CHECKED} not checked`,
        // The list below also carries the fixed cryptographic-integrity line, so the heading counts it
        // separately rather than letting the tally and the list disagree by one (XC1 L2).
        notCheckedTitle: `Not checked: ${(0, check_1.plural)(t.NOT_CHECKED, 'claim')}${r.assurance.cryptographic_integrity === 'NOT_CHECKED' ? ', and cryptographic integrity' : ''} (none of these is a pass)`,
        checked,
        notChecked,
        doesNotProve: r.does_not_prove.map((x) => (0, action_evidence_1.cleanCodePoints)(x)),
        footer: [
            text('Record '),
            code(r.schema),
            text(' · sha-256 '),
            code(digest.value),
            text(` over ${digest.canonicalization} canonical JSON · built by trustshell check --claims from api.github.com only; nothing uploaded`),
        ],
    };
}
// ── Markdown ────────────────────────────────────────────────────────────────────────────────────
/** Escape the characters that would turn generated prose into markup. Generated prose has few. */
function mdText(s) {
    return s.replace(/[\\`*_[\]<>|~]/g, (c, i) => {
        // An underscore between two letters or digits (`head_sha`) is never emphasis in CommonMark,
        // so escaping it only makes the raw card harder to read.
        if (c === '_' && /[A-Za-z0-9]/.test(s[i - 1] ?? '') && /[A-Za-z0-9]/.test(s[i + 1] ?? ''))
            return c;
        return '\\' + c;
    });
}
/** A code span that holds ANY string inertly: the fence is longer than the longest backtick run inside. */
function mdCode(s) {
    const v = s.replace(/[\r\n]+/g, ' ');
    const longest = Math.max(0, ...(v.match(/`+/g) ?? []).map((r) => r.length));
    const fence = '`'.repeat(longest + 1);
    const pad = v.startsWith('`') || v.endsWith('`') || v.startsWith(' ') || v.endsWith(' ') ? ' ' : '';
    return fence + pad + v + pad + fence;
}
function mdLine(l) {
    return l.map((s) => (s.t === 'code' ? mdCode(s.v) : s.t === 'strong' ? `**${mdText(s.v)}**` : mdText(s.v))).join('');
}
function renderCardMarkdown(record, opts = {}) {
    const m = buildModel(record, opts);
    const out = [];
    if (m.banner)
        out.push(`> ${mdLine(m.banner)}`, '');
    out.push(`## ${mdText(m.title)}`, '');
    for (const f of m.facts)
        out.push(`- ${mdLine(f)}`);
    out.push('', `### Claims: ${mdText(m.tallyLine)}`, '');
    if (m.checked.length === 0)
        out.push('No claim could be compared with the run. Everything is listed under "Not checked".', '');
    for (const c of m.checked) {
        out.push(`- ${mdLine(c.head)}`);
        for (const d of c.details)
            out.push(`  - ${mdLine(d)}`);
    }
    if (m.checked.length)
        out.push('');
    out.push(`### ${mdText(m.notCheckedTitle)}`, '');
    if (m.notChecked.length === 0)
        out.push('- (nothing)');
    for (const n of m.notChecked)
        out.push(`- ${mdLine(n)}`);
    out.push('', '### What this does not prove', '');
    for (const s of m.doesNotProve)
        out.push(`- ${mdText(s)}`);
    out.push('', '---', '', mdLine(m.footer), '');
    return out.join('\n');
}
// ── HTML ────────────────────────────────────────────────────────────────────────────────────────
function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function htmlLine(l) {
    return l.map((s) => (s.t === 'code' ? `<code>${esc(s.v)}</code>` : s.t === 'strong' ? `<strong>${esc(s.v)}</strong>` : esc(s.v))).join('');
}
const CSS = `
:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--ok:#1a7f37;--bad:#cf222e;--nc:#9a6700;--code:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--ok:#3fb950;--bad:#f85149;--nc:#d29922;--code:#161b22}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:24px 0 8px}
ul{padding-left:20px;margin:0}li{margin:4px 0;overflow-wrap:anywhere}code{background:var(--code);border:1px solid var(--line);border-radius:4px;padding:0 4px;font:13px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}
.banner{border:2px solid var(--nc);border-radius:6px;padding:8px 12px;margin-bottom:16px}.facts li{list-style:none;margin-left:-20px}
.SUPPORTED>strong:first-child{color:var(--ok)}.CONTRADICTED>strong:first-child{color:var(--bad)}.nc>strong:first-child{color:var(--nc)}
.details{color:var(--muted);font-size:14px}footer{margin-top:24px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;overflow-wrap:anywhere}
`;
function renderCardHtml(record, opts = {}) {
    const m = buildModel(record, opts);
    const out = [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        // No script, no remote anything: the card is a document, and a stranger may open it.
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
        `<title>${esc(m.banner ? 'DEMO · ' : '')}TrustShell evidence card</title>`,
        `<style>${CSS}</style>`,
        '</head>',
        '<body><main>',
    ];
    if (m.banner)
        out.push(`<p class="banner">${htmlLine(m.banner)}</p>`);
    out.push(`<h1>${esc(m.title)}</h1>`, '<ul class="facts">', ...m.facts.map((f) => `<li>${htmlLine(f)}</li>`), '</ul>');
    out.push(`<h2>Claims: ${esc(m.tallyLine)}</h2>`);
    if (m.checked.length === 0)
        out.push('<p>No claim could be compared with the run. Everything is listed under “Not checked”.</p>');
    else {
        out.push('<ul>');
        for (const c of m.checked) {
            out.push(`<li class="${c.status}">${htmlLine(c.head)}<ul class="details">${c.details.map((d) => `<li>${htmlLine(d)}</li>`).join('')}</ul></li>`);
        }
        out.push('</ul>');
    }
    out.push(`<h2>${esc(m.notCheckedTitle)}</h2>`, '<ul>');
    if (m.notChecked.length === 0)
        out.push('<li>(nothing)</li>');
    for (const n of m.notChecked)
        out.push(`<li class="nc">${htmlLine(n)}</li>`);
    out.push('</ul>', '<h2>What this does not prove</h2>', '<ul>', ...m.doesNotProve.map((s) => `<li>${esc(s)}</li>`), '</ul>');
    out.push(`<footer>${htmlLine(m.footer)}</footer>`, '</main></body>', '</html>', '');
    return out.join('\n');
}
