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

import { digestRecord, tallyClaims, type ActionEvidenceRecord, type ClaimEntry, type ClaimStatus } from './action-evidence';

type Span = { t: 'text' | 'code' | 'strong'; v: string };
type Line = Span[];

const text = (v: string): Span => ({ t: 'text', v });
const code = (v: string): Span => ({ t: 'code', v });
const strong = (v: string): Span => ({ t: 'strong', v });

/** What a template is ABOUT, for the "<topic>: not checked" line. Keyed by template id, never by claim text. */
const TOPIC: Record<string, string> = {
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
  unmapped: 'Unmapped claim',
  truncated: 'Sentences not read',
};

/** The one sentence `demo` adds. Fixed text: nothing from the record or the input reaches it. */
export const DEMO_BANNER = 'Sample output for review, generated from a real public GitHub Actions run. Not an official TrustShell result.';

interface CardModel {
  banner: Line | null;
  title: string;
  facts: Line[];
  tallyLine: string;
  checked: { status: ClaimStatus; head: Line; details: Line[] }[];
  notChecked: Line[];
  doesNotProve: string[];
  footer: Line;
}

function jobSummary(r: ActionEvidenceRecord): Line {
  const j = r.observation.jobs;
  const counts = new Map<string, number>();
  for (const x of j.items) {
    // A GitHub enum (success, skipped, in_progress…). Anything else is counted, never printed.
    const raw = x.conclusion ?? x.status;
    const k = raw && /^[a-z_]{1,32}$/.test(raw) ? raw : 'unrecognised';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const parts = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${n} ${k}`);
  const line: Line = [strong('Jobs'), text(` ${j.items.length} of ${j.total} read (HTTP ${j.http_status})${parts.length ? ': ' + parts.join(', ') : ''}`)];
  const other = j.items.filter((x) => x.conclusion !== 'success' && x.conclusion !== 'skipped');
  if (other.length) {
    line.push(text('. Not success: '));
    other.slice(0, 10).forEach((x, i) => {
      if (i) line.push(text(', '));
      line.push(code(x.name || '(unnamed)'));
    });
    if (other.length > 10) line.push(text(` and ${other.length - 10} more`));
  }
  return line;
}

function claimDetails(c: ClaimEntry): Line[] {
  const d: Line[] = [];
  if (c.sentence !== c.claim) d.push([strong('In'), text(' '), code(c.sentence)]);
  d.push([strong('Template'), text(' '), code(c.template)], [strong('Why'), text(' ' + c.reason)], [strong('Scope'), text(' ' + c.scope)]);
  if (c.evidence_fields.length) {
    const l: Line = [strong('Fields')];
    c.evidence_fields.forEach((f, i) => l.push(text(i ? ', ' : ' '), code(f)));
    d.push(l);
  }
  return d;
}

function buildModel(r: ActionEvidenceRecord, opts: { demo?: boolean }): CardModel {
  const o = r.observation;
  const t = tallyClaims(r.claims);
  const digest = digestRecord(r);

  const facts: Line[] = [
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
  const notChecked: Line[] = r.claims
    .filter((c) => c.status === 'NOT_CHECKED')
    .map((c) => {
      const l: Line = [strong(`${TOPIC[c.template] ?? c.template}: not checked.`), text(' '), code(c.claim), text(' ' + c.reason)];
      if (c.sentence !== c.claim) l.push(text(' In: '), code(c.sentence));
      return l;
    });
  if (r.assurance.cryptographic_integrity === 'NOT_CHECKED') {
    notChecked.push([
      strong('Cryptographic integrity: not checked.'),
      text(' No signed attestation was present or verified. This version does not read attestations.'),
    ]);
  }

  return {
    banner: opts.demo ? [strong('DEMO.'), text(' ' + DEMO_BANNER)] : null,
    title: 'TrustShell · claims checked against a GitHub Actions run',
    facts,
    tallyLine: `${t.SUPPORTED} supported · ${t.CONTRADICTED} contradicted · ${t.NOT_CHECKED} not checked`,
    checked,
    notChecked,
    doesNotProve: r.does_not_prove,
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
function mdText(s: string): string {
  return s.replace(/[\\`*_[\]<>|~]/g, (c, i: number) => {
    // An underscore between two letters or digits (`head_sha`) is never emphasis in CommonMark,
    // so escaping it only makes the raw card harder to read.
    if (c === '_' && /[A-Za-z0-9]/.test(s[i - 1] ?? '') && /[A-Za-z0-9]/.test(s[i + 1] ?? '')) return c;
    return '\\' + c;
  });
}

/** A code span that holds ANY string inertly: the fence is longer than the longest backtick run inside. */
export function mdCode(s: string): string {
  const v = s.replace(/[\r\n]+/g, ' ');
  const longest = Math.max(0, ...(v.match(/`+/g) ?? []).map((r) => r.length));
  const fence = '`'.repeat(longest + 1);
  const pad = v.startsWith('`') || v.endsWith('`') || v.startsWith(' ') || v.endsWith(' ') ? ' ' : '';
  return fence + pad + v + pad + fence;
}

function mdLine(l: Line): string {
  return l.map((s) => (s.t === 'code' ? mdCode(s.v) : s.t === 'strong' ? `**${mdText(s.v)}**` : mdText(s.v))).join('');
}

export function renderCardMarkdown(record: ActionEvidenceRecord, opts: { demo?: boolean } = {}): string {
  const m = buildModel(record, opts);
  const out: string[] = [];
  if (m.banner) out.push(`> ${mdLine(m.banner)}`, '');
  out.push(`## ${mdText(m.title)}`, '');
  for (const f of m.facts) out.push(`- ${mdLine(f)}`);
  out.push('', `### Claims: ${mdText(m.tallyLine)}`, '');
  if (m.checked.length === 0) out.push('No claim could be compared with the run. Everything is listed under "Not checked".', '');
  for (const c of m.checked) {
    out.push(`- ${mdLine(c.head)}`);
    for (const d of c.details) out.push(`  - ${mdLine(d)}`);
  }
  if (m.checked.length) out.push('');
  out.push('### Not checked (none of these is a pass)', '');
  if (m.notChecked.length === 0) out.push('- (nothing)');
  for (const n of m.notChecked) out.push(`- ${mdLine(n)}`);
  out.push('', '### What this does not prove', '');
  for (const s of m.doesNotProve) out.push(`- ${mdText(s)}`);
  out.push('', '---', '', mdLine(m.footer), '');
  return out.join('\n');
}

// ── HTML ────────────────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function htmlLine(l: Line): string {
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

export function renderCardHtml(record: ActionEvidenceRecord, opts: { demo?: boolean } = {}): string {
  const m = buildModel(record, opts);
  const out: string[] = [
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
  if (m.banner) out.push(`<p class="banner">${htmlLine(m.banner)}</p>`);
  out.push(`<h1>${esc(m.title)}</h1>`, '<ul class="facts">', ...m.facts.map((f) => `<li>${htmlLine(f)}</li>`), '</ul>');
  out.push(`<h2>Claims: ${esc(m.tallyLine)}</h2>`);
  if (m.checked.length === 0) out.push('<p>No claim could be compared with the run. Everything is listed under “Not checked”.</p>');
  else {
    out.push('<ul>');
    for (const c of m.checked) {
      out.push(`<li class="${c.status}">${htmlLine(c.head)}<ul class="details">${c.details.map((d) => `<li>${htmlLine(d)}</li>`).join('')}</ul></li>`);
    }
    out.push('</ul>');
  }
  out.push('<h2>Not checked (none of these is a pass)</h2>', '<ul>');
  if (m.notChecked.length === 0) out.push('<li>(nothing)</li>');
  for (const n of m.notChecked) out.push(`<li class="nc">${htmlLine(n)}</li>`);
  out.push('</ul>', '<h2>What this does not prove</h2>', '<ul>', ...m.doesNotProve.map((s) => `<li>${esc(s)}</li>`), '</ul>');
  out.push(`<footer>${htmlLine(m.footer)}</footer>`, '</main></body>', '</html>', '');
  return out.join('\n');
}
