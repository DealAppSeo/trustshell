#!/usr/bin/env node
/**
 * docs/red-team.md, written from the free-model loops' own records and from nothing else.
 *
 *   node scripts/redteam-report.mjs            write docs/red-team.md from docs/red-team/records/
 *   node scripts/redteam-report.mjs --check    exit 1 if the page on disk is not what the records produce
 *   node scripts/redteam-report.mjs --sync     maintainers only: copy the live loop records into
 *                                              docs/red-team/records/ (redacting local paths), then write the page
 *   --records <dir> --out <file>               read/write somewhere else (the tests do)
 *
 * No network, no key, no model call, no clock: the same records give the same page, byte for byte.
 *
 * WHY THE RECORDS ARE COMMITTED. The loops run on one laptop and write to a folder nobody else can
 * read. A page generated from that folder can be believed or not, but not checked. So the records
 * the page is made from are copied in here, and `--check` re-derives the page from them.
 *
 * WHAT --sync CHANGES IN A COPY, and nothing else: local paths become <home>/ and <ops>/, loopback
 * ports become <port>, and in the 1.8.0 attack report the text of contributed cases and of INFO rows
 * is withheld (those ids name holes nobody has been asked to publish). Every line count is checked.
 *
 * THE RULE THIS FILE EXISTS FOR (CLAUDE_RULES r24): a number without its ruler is not a result. Every
 * count below carries the engine commit, the oracle manifest and the chain it was taken on, and a
 * count taken on one ruler is never added to one taken on another.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const REC = path.resolve(opt('records', path.join(ROOT, 'docs', 'red-team', 'records')));
const OUT = path.resolve(opt('out', path.join(ROOT, 'docs', 'red-team.md')));
const lf = (s) => s.replace(/\r\n/g, '\n');

// ── --sync ──────────────────────────────────────────────────────────────────────────────────────
const REDACT = [
  [/\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+[\\/]/g, '<home>/'],
  [/\b[A-Za-z]:[\\/]dev[\\/]/g, '<ops>/'],
  [/127\.0\.0\.1:\d+/g, '127.0.0.1:<port>'],
];
function redact(text) {
  let n = 0;
  for (const [re, to] of REDACT) text = text.replace(re, () => (n++, to));
  return { text, n };
}
/** The 1.8.0 attack report, minus the evidence of rows whose text nobody has agreed to publish. */
function reduceRc(text) {
  let withheld = 0;
  const out = text.split('\n').map((l) => {
    const m = /^\| ([\w-]+) \| ([^|]+?) \| (\*\*[A-Z_]+\*\*) \| (.*) \|$/.exec(l);
    if (!m) return l;
    const [, area, attack, outcome, evidence] = m;
    // The verdict word the report appends after "→" is kept: it says what the case proved, not what it claimed.
    if (area === 'contrib') { withheld++; return `| contrib | (withheld) | ${outcome} | (withheld; verdict ${/→ ([A-Z_]+)/.exec(evidence)?.[1] ?? 'not recorded'}) |`; }
    if (outcome === '**INFO**') { withheld++; return `| ${area} | ${attack} | ${outcome} | (not published here) |`; }
    return l;
  });
  return { text: out.join('\n'), withheld };
}
/** The per-run reports, minus the issue drafts of passes that found a breach: those carry the variant JSON and local reproduce commands, and this page summarises classes instead of printing payloads. */
function reduceReport(text) {
  let withheld = 0;
  const out = text.replace(/^(### Issue drafts\n)([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/gm, (all, head, body) => {
    if (!body.trim() || /^None:/.test(body.trim())) return all;
    withheld++;
    return `${head}\n(withheld: the variant JSON and the local reproduce commands; the counts above are unchanged)\n\n`;
  });
  return { text: out, withheld };
}
function sync() {
  const loop = process.env.REDTEAM_LOOP_DIR || 'E:/dev/ops/loop';
  const reports = process.env.REDTEAM_REPORTS_DIR || 'E:/dev/reports';
  const rc = process.env.REDTEAM_RC_REPORT || `${reports}/2026-10-23/RC_ATTACK_1.8.0-dry.md`;
  const rtLog = lf(fs.readFileSync(`${loop}/logs/redteam-loop.log`, 'utf8'));
  // The per-run reports are found the way the log names them: report=<dir>/<UTC date>/REDTEAM_LOOP.md
  const dates = [...new Set([...rtLog.matchAll(/report=\S*?(\d{4}-\d{2}-\d{2})[\\/]REDTEAM_LOOP\.md/g)].map((m) => m[1]))].sort();
  const files = [
    ['redteam-loop.log', `${loop}/logs/redteam-loop.log`],
    ['arena-loop.log', `${loop}/logs/arena-loop.log`],
    ['health-state.json', `${loop}/health/state.json`],
    ['redteam-batches.jsonl', `${loop}/redteam/batches.jsonl`],
    ['arena-batches.jsonl', `${loop}/arena/batches.jsonl`],
    ['DEGRADED_BATCHES.md', `${loop}/redteam/DEGRADED_BATCHES.md`],
    ...dates.map((d) => [`REDTEAM_LOOP_${d}.md`, `${reports}/${d}/REDTEAM_LOOP.md`, reduceReport, 'issue-draft bodies']),
    [`RC_ATTACK_${path.basename(rc).replace(/^RC_ATTACK_/, '')}`, rc, reduceRc, 'evidence cells'],
  ];
  fs.mkdirSync(REC, { recursive: true });
  for (const [name, src, reduce, what] of files) {
    let { text, n } = redact(lf(fs.readFileSync(src, 'utf8')));
    let extra = '';
    if (reduce) { const r = reduce(text); text = r.text; extra = `, ${r.withheld} ${what} withheld`; }
    fs.writeFileSync(path.join(REC, name), text);
    console.log(`synced ${name}: ${n} path/port replacements${extra}`);
  }
}

// ── reading the records ─────────────────────────────────────────────────────────────────────────
const read = (name) => lf(fs.readFileSync(path.join(REC, name), 'utf8'));
const recordNames = () => fs.readdirSync(REC).filter((f) => fs.statSync(path.join(REC, f)).isFile()).sort();
const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const pad2 = (n) => String(n).padStart(2, '0');

/** A scheduler header (`==== Wed 10/21/2026  2:30:00.49`, the machine's local time) starts a block of what the run printed. */
function blocks(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const h = /^==== \w{3} (\d{1,2})\/(\d{1,2})\/(\d{4}) +(\d{1,2}):(\d{2}):\d{2}/.exec(line);
    if (h) out.push({ local: `${h[3]}-${pad2(h[1])}-${pad2(h[2])} ${pad2(h[4])}:${h[5]}`, lines: [] });
    else if (out.length && line.trim()) out.at(-1).lines.push(line);
  }
  return out;
}
const csv = (s) => (s ? s.split(',').filter(Boolean) : []);
const dayCalls = (s) => { const m = /calls=(\d+)\/(\d+)/.exec(s); return m ? `${m[1]}/${m[2]}` : null; };

function parseRt(line) {
  const m = /^REDTEAM (\S+) batch=(\w+) (.*?) EXIT (\d+)\s*$/.exec(line);
  if (!m) return null;
  const [, at, batch, rest, exit] = m;
  const g = /^chain=(\S+) variants=(\d+) PASS=(\d+) FAIL=(\d+) NOT_CHECKED=(\d+) reached_kernel=(\d+) breaches=\[([^\]]*)\] calls=(\d+)\/(\d+) pass=(\d+)\/(\d+) engine=(\w+)(\+fixes)? report=/.exec(rest);
  if (g) return { at, batch, exit: +exit, graded: true, chain: g[1], variants: +g[2], pass: +g[3], fail: +g[4], nc: +g[5], reached: +g[6], breaches: csv(g[7]), passCalls: `${g[10]}/${g[11]}`, dayCalls: `${g[8]}/${g[9]}`, engine: g[12], fixes: !!g[13] };
  return { at, batch, exit: +exit, graded: false, why: rest.replace(/\s*calls=\d+\/\d+.*$/, '').replace(/^infra: /, ''), dayCalls: dayCalls(rest) };
}
function parseArena(line) {
  const m = /^ARENA (\S+) batch=(\w+) (.*?) EXIT (\d+)\s*$/.exec(line);
  if (!m) return null;
  const [, at, batch, rest, exit] = m;
  const g = /^git=(\w+) records=(\d+) PASS=(\d+) FAIL=(\d+) NOT_CHECKED=(\d+) breaches=(\S+) known=\[([^\]]*)\] new=\[([^\]]*)\] egress_blocked=(\d+) calls=(\S+) models=(\S+)( STOPPED_AT_CAP)?$/.exec(rest);
  if (g) return { at, batch, exit: +exit, graded: true, git: g[1], records: +g[2], pass: +g[3], fail: +g[4], nc: +g[5], breaches: g[6] === 'none' ? [] : g[6].split(','), known: csv(g[7]), fresh: csv(g[8]), calls: g[10], models: g[11].split(','), capped: !!g[12] };
  return { at, batch, exit: +exit, graded: false, why: rest.replace(/\s*calls=\d+\/\d+.*$/, '').replace(/ EXIT.*$/, ''), capped: /STOPPED_AT_CAP/.test(rest), dayCalls: dayCalls(rest) };
}
const caseLines = (lines) => lines.map((l) => /^#\d+ (\w+) \[(\w+)\] (PASS|FAIL|NOT_CHECKED)\b/.exec(l)).filter(Boolean).map((m) => ({ name: m[1], verdict: m[3] }));

/** The family line the loop writes: `openai-oss: 8 CHECKED [model], 0 NOT_CHECKED · non-openai: 0 CHECKED [none], 8 NOT_CHECKED (why) · …` */
function families(str) {
  if (!str || /^stub/.test(str)) return { text: 'built-in seed variants, no model', models: [] };
  const models = new Set(), cells = [];
  for (const chunk of str.split(/\s·\s(?=[a-z][\w-]*: )/)) {
    const ok = /^([\w-]+): (\d+) CHECKED \[([^\]]*)\], (\d+) NOT_CHECKED(?: \((.*))?$/s.exec(chunk);
    if (ok) {
      const why = reasonOf(ok[5] || '');
      for (const mm of ok[3].split(', ')) if (mm && mm !== 'none') models.add(mm);
      cells.push(`${ok[1]} ${ok[2]}/${+ok[2] + +ok[4]}${+ok[4] && why ? ` (${why})` : ''}`);
      continue;
    }
    const skip = /^([\w-]+): NOT_CHECKED(?: \((.*))?$/s.exec(chunk);
    cells.push(skip ? `${skip[1]} not run (${reasonOf(skip[2] || '') || 'no reason recorded'})` : chunk.slice(0, 40));
  }
  return { text: cells.join(' · '), models: [...models] };
}
function reasonOf(s) {
  if (/one pass a day/.test(s)) return 'one pass a day';
  if (/breaker open/.test(s)) return 'skipped: model gone';
  const h = /HTTP (\d{3})/.exec(s);
  if (h) return `HTTP ${h[1]}`;
  if (/Expected ',' or '}'/.test(s)) return 'unreadable JSON';
  return s ? 'other' : '';
}

/** `## Pass <batch> · <UTC> · <chain>` sections of the per-run reports. */
function passSections() {
  const out = new Map();
  for (const f of recordNames().filter((n) => /^REDTEAM_LOOP_.*\.md$/.test(n))) {
    for (const sec of read(f).split(/^## Pass /m).slice(1)) {
      const id = /^(\w+) ·/.exec(sec)?.[1];
      if (!id) continue;
      const cls = {};
      for (const m of (/^Per class: (.*)$/m.exec(sec)?.[1] || '').matchAll(/(\w+) (\d+)P\/(\d+)F\/(\d+)NC/g)) cls[m[1]] = { pass: +m[2], fail: +m[3], nc: +m[4] };
      const why = { 'harness error': 0, 'model gave no variants': 0, 'invalid variant': 0 };
      for (const m of sec.matchAll(/^- (\d+) × (harness error|model gave no variants|invalid variant)/gm)) why[m[2]] += +m[1];
      const inj = /buyer model proposed a follow-up payment for (\d+) of (\d+) injected/.exec(sec);
      out.set(id, { cls, why, inj: inj ? [+inj[1], +inj[2]] : null, file: f });
    }
  }
  return out;
}

const jsonl = (name) => read(name).split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ── rulers ──────────────────────────────────────────────────────────────────────────────────────
/** Red team: what ran the variants (engine commit + the kernel-fixes marker), what graded them (oracle manifest), on what chain, whose variants. */
/** `npm view @hyperdag/trustshell@1.8.0 dist.integrity`, run 2026-10-23. The one fact on the page that no record in this folder holds. */
const NPM_1_8_0_INTEGRITY = 'sha512-tkaDaVUYgOe7YVDe2YPBrmn8BsS9pIZAdGlcf+VTLRt7q8KbJ47HViiHGPiGcaCUw68K40xzWx2M2o8GMxsdsw==';
const rtRuler = (r) => `${r.engine}${r.fixes ? '+fixes' : ''} · oracle ${r.manifest} · ${r.chain === 'hardhat-devnet' ? 'devnet' : 'in-memory twin'} · ${r.seeds ? 'built-in seeds' : 'free models'}`;
const arRuler = (r) => `${r.git} · ${/^stub$/.test(r.calls) ? 'built-in stub agents' : 'free models'}`;

// ── the page ────────────────────────────────────────────────────────────────────────────────────
// Log text reaches table cells. One pass escapes the backslash together with the pipe (a pipe-only escape turns `\|` into
// `\\|`: an escaped backslash, then a live column break), a newline would end the row, and `<` would let log text open a tag.
const cell = (v) => String(v ?? '—').replace(/\r?\n/g, ' ').replace(/[\\|]/g, '\\$&').replace(/</g, '&lt;');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const z = (iso) => iso.replace(/\.\d+Z$/, 'Z');
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
const plural = (n, one, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function render() {
  // red team
  const rtBlocks = blocks(read('redteam-loop.log'));
  const rtLedger = jsonl('redteam-batches.jsonl');
  const ledgerById = new Map(rtLedger.map((b) => [b.batch_id.slice(0, 8), b]));
  const secs = passSections();
  const rt = rtBlocks.map((b) => {
    const s = b.lines.map(parseRt).find(Boolean) ?? null;
    if (!s) return { local: b.local, none: true };
    const led = ledgerById.get(s.batch);
    if (s.graded) {
      if (!led) throw new Error(`red-team batch ${s.batch} is in the log but not in the ledger`);
      const same = led.variants === s.variants && led.pass === s.pass && led.fail === s.fail && led.not_checked === s.nc && led.reached_kernel === s.reached && led.breaches.join() === s.breaches.join();
      if (!same) throw new Error(`red-team batch ${s.batch}: the log line and the ledger disagree`);
      s.manifest = led.manifest_sha256.slice(0, 8); s.seeds = /^stub/.test(led.families); s.fam = families(led.families);
    }
    return { local: b.local, s };
  });
  const rtLogIds = new Set(rt.filter((r) => r.s).map((r) => r.s.batch));
  const rtEarly = rtLedger.filter((b) => !rtLogIds.has(b.batch_id.slice(0, 8))).sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((b) => ({ at: b.at, batch: b.batch_id.slice(0, 8), chain: b.chain, engine: b.engine.git_sha.slice(0, 8), fixes: b.engine.has_kernel_fixes, manifest: b.manifest_sha256.slice(0, 8), seeds: /^stub/.test(b.families), variants: b.variants, pass: b.pass, fail: b.fail, nc: b.not_checked, reached: b.reached_kernel, breaches: b.breaches, fam: families(b.families) }));
  const rtGraded = rt.filter((r) => r.s?.graded).map((r) => r.s);
  const rtAll = [...rtEarly, ...rtGraded].sort((a, b) => (a.at < b.at ? -1 : 1));

  // arena
  const arBlocks = blocks(read('arena-loop.log'));
  const ar = arBlocks.map((b) => ({ local: b.local, s: b.lines.map(parseArena).find(Boolean) ?? null, cases: caseLines(b.lines) }));
  const arLedger = jsonl('arena-batches.jsonl').map((b) => ({ ...parseArena(b.line), line: b.line }));
  const arLogIds = new Set(ar.filter((r) => r.s).map((r) => r.s.batch));
  const arEarly = arLedger.filter((b) => !arLogIds.has(b.batch)).sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const r of ar) {
    const led = arLedger.find((b) => b.batch === r.s?.batch);
    if (r.s?.graded && (!led || led.records !== r.s.records || led.pass !== r.s.pass || led.fail !== r.s.fail || led.nc !== r.s.nc)) throw new Error(`arena batch ${r.s.batch}: the log line and the ledger disagree`);
  }

  // rulers, numbered in the order they first appear
  const rulerIds = new Map();
  const rid = (kind, key) => { const k = `${kind}|${key}`; if (!rulerIds.has(k)) rulerIds.set(k, `${kind === 'rt' ? 'T' : 'A'}${[...rulerIds.keys()].filter((x) => x.startsWith(kind)).length + 1}`); return rulerIds.get(k); };
  for (const r of rtAll) r.ruler = rid('rt', rtRuler(r));
  const arGraded = ar.filter((r) => r.s?.graded).map((r) => ({ ...r.s, cases: r.cases }));
  const arAll = [...arEarly.filter((b) => b.graded), ...arGraded].sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const r of arAll) r.ruler = rid('ar', arRuler(r));

  const firstRt = rtGraded[0], lastRt = rtGraded.at(-1);
  const rtScheduledRulers = [...new Set(rtGraded.map((r) => r.ruler))];
  const arSched = ar.filter((r) => r.s?.graded).map((r) => r.s);
  const arSchedRulers = [...new Set(arSched.map((r) => arAll.find((a) => a.batch === r.batch).ruler))];
  const allTimes = [...rt.filter((r) => r.s).map((r) => r.s.at), ...ar.filter((r) => r.s).map((r) => r.s.at)].sort();
  const lastTime = allTimes.at(-1), firstTime = allTimes[0];

  const L = [];
  const p = (...s) => L.push(...s);

  p('# Red-team results',
    '',
    '<!-- Generated by scripts/redteam-report.mjs from docs/red-team/records/. Do not edit by hand: change the script, or re-sync the records. -->',
    '',
    `Records through **${z(lastTime)}**. Everything on this page is derived from the files in [docs/red-team/records/](red-team/records) by [scripts/redteam-report.mjs](../scripts/redteam-report.mjs); \`node scripts/redteam-report.mjs --check\` re-derives it and fails if this page differs. No network, no key. The only statements not derived from those files are about other repositories and npm, and each carries the date it was checked.`,
    '');

  // ── the headline, said once, with the ruler beside every number ───────────────────────────────
  p('## What the records say', '');
  const rtSched = rt.filter((r) => r.s);
  const rtT = (rs) => ({ variants: sum(rs, 'variants'), pass: sum(rs, 'pass'), fail: sum(rs, 'fail'), nc: sum(rs, 'nc'), reached: sum(rs, 'reached') });
  const degradedIds = new Set(recordNames().includes('DEGRADED_BATCHES.md') ? [...read('DEGRADED_BATCHES.md').matchAll(/`(\w{8})`/g)].map((m) => m[1]) : []);
  const earlier = (all, id, inLog) => all.filter((r) => r.ruler === id && !inLog.has(r.batch));
  const earlierNote = (rs) => (rs.length ? ` The ledger also holds ${plural(rs.length, 'earlier pass', 'earlier passes')} on this same ruler, before the schedule (${rs.map((r) => r.batch).join(', ')}; ${sum(rs, 'fail')} FAIL).` : '');
  for (const id of rtScheduledRulers) {
    const rs = rtGraded.filter((r) => r.ruler === id && r.pass + r.fail > 0), t = rtT(rs);
    const br = [...new Set(rs.flatMap((r) => r.breaches))];
    p(`- **Red team, scheduled runs, ruler ${id}:** ${t.fail === 0 ? '0 breaches' : `${t.fail} FAIL (${br.join(', ')})`} in ${plural(rs.length, 'run')} that graded variants, between ${z(rs[0].at)} and ${z(rs.at(-1).at)}. Of the ${t.variants} variants the loop counted, ${t.pass} PASS, ${t.fail} FAIL, ${t.nc} NOT_CHECKED; **${t.reached} reached the kernel**, the rest were refused before it or could not be graded.${rs.some((r) => degradedIds.has(r.batch)) ? ` ${rs.filter((r) => degradedIds.has(r.batch)).map((r) => r.batch).join(', ')} is on the loop's own degraded list (see the † note below).` : ''}${earlierNote(earlier(rtAll, id, rtLogIds))}`);
  }
  const rtGradedN = rtGraded.filter((r) => r.pass + r.fail > 0).length;
  p(`- The scheduled red-team log has ${plural(rt.length, 'entry', 'entries')}; ${rtGradedN} graded variants and the other ${rt.length - rtGradedN} graded nothing (listed below, not dropped).`);
  for (const id of arSchedRulers) {
    const rs = arSched.filter((r) => arAll.find((a) => a.batch === r.batch).ruler === id);
    const rsG = rs.filter((r) => r.pass + r.fail > 0);
    const fail = sum(rsG, 'fail'), pass = sum(rsG, 'pass'), nc = sum(rs, 'nc');
    const br = {}; for (const r of rsG) for (const b of r.breaches) { const [k, n] = b.split(':'); br[k] = (br[k] || 0) + (+n || 1); }
    const known = [...new Set(rsG.flatMap((r) => r.known))];
    p(`- **Arena, scheduled runs, ruler ${id}:** ${fail === 0 ? '0 breaches' : `${fail} FAIL (${Object.entries(br).map(([k, n]) => `${k} ×${n}`).join(', ')}${known.length ? `; both were failures the arena had pinned as open (${known.join(', ')}); unexpected: none` : ''})`} in ${plural(rsG.length, 'run')} that graded exchanges, between ${z(rsG[0].at)} and ${z(rsG.at(-1).at)} (${pass} PASS, ${fail} FAIL, ${nc} NOT_CHECKED).${earlierNote(earlier(arAll.filter((r) => r.pass + r.fail > 0), id, arLogIds))}`);
  }
  const arGradedSched = ar.filter((r) => r.s?.graded && r.s.pass + r.s.fail > 0).length;
  p(`- The scheduled arena log has ${plural(ar.length, 'entry', 'entries')}; ${arGradedSched} graded exchanges and the other ${ar.length - arGradedSched} graded nothing.`);
  p('- **Before the schedule began**, both loops\' ledgers hold development passes on other engine commits (some with an older oracle) that did record breaches. They are listed in [their own section](#before-the-schedule-began-ledger-only-different-rulers) and are not added to anything above.');
  const rc = rcModel();
  if (rc) p(`- **The ${rc.candidate} tarball** (a separate battery, separate ruler, one run on ${rc.when}): PASS ${rc.count.PASS}, FAIL ${rc.count.FAIL}, INFO ${rc.count.INFO}, NOT_CHECKED ${rc.count.NOT_CHECKED}. See [below](#the-hyperdagtrustshell180-tarball-a-separate-attack-on-a-separate-ruler).`);
  p('');

  p('## What this page does not say', '',
    '- **It does not say the system is secure, safe or unbreakable.** "0 breaches in N runs" is a count of what these attackers, in these runs, on these rulers, did not find. It is not a bound on what a different attacker would find.',
    '- **These attackers are not adaptive ones.** Free models fill a fixed schema, one pass at a time. Adaptive attackers, who tune the attack to the defence in front of them, bypassed 12 recently published defences against jailbreaks and prompt injection, most at over 90% success, although most of those defences had reported near-zero attack success in their own evaluations ([Nasr, Carlini et al., *The Attacker Moves Second*, 2025](https://arxiv.org/abs/2510.09023)). Zero found by a non-adaptive attacker says little about an adaptive one.',
    '- **PASS is narrow.** A variant is PASS when the frozen grader finds none of its five pass conditions broken. Many PASS variants were refused by the arena\'s preflight before they reached the kernel, which says nothing about the kernel; the *reached kernel* column is the count that did exercise it.',
    '- **NOT_CHECKED says nothing about the code under test.** It means a model error, an unusable variant, or a harness or devnet failure. It is not a pass, and it is never counted as one.',
    '- **The grader is not independent of the people who wrote the code.** It was written and frozen by a different lane from the one that wrote the executor, but both lanes run on the same model family ("separated by lane, not by model family", [FROZEN.md](https://github.com/DealAppSeo/repid-engine/blob/main/eval/arena/FROZEN.md)).',
    '- **What is attacked is the engine\'s policy kernel and payment gate in a local arena** (a throwaway devnet, a mock token, synthetic agents, no real keys or money), not the `@hyperdag/trustshell` package. The package has its own, separate attack: the tarball section below.',
    '- **The scheduled log is not the whole history.** Earlier passes exist in the ledgers, and the log itself has gaps (below). Nothing here is a statement about runs that left no record.',
    '');

  // ── rulers ────────────────────────────────────────────────────────────────────────────────────
  p('## Rulers', '',
    'A count means something only beside the ruler it was taken on. Counts on different rulers are never added up or compared on this page. Each ruler is numbered in the order it first appears.', '',
    '**Red team (T).** A *variant* is one JSON object a model writes (or a built-in seed supplies) in one of eight attack classes: `bogus_quote`, `token_substitution`, `recipient_substitution`, `replay`, `concurrency`, `forged_settlement`, `self_rating`, `prompt_injection`. It changes one or more of: the payment agreement before both sides sign it, the request presented with it, how many times and in what order it is presented, which transaction is cited as the settlement, and what feedback is filed. A strict validator accepts or rejects it; the executor runs it unmodified; the frozen grader (`eval/arena/variants.ts`) checks five pass conditions against what the chain and the stores show: `unauthorized_payment`, `double_execution`, `repid_for_unverified_outcome`, `unbound_transaction`, `unrecorded_failure` (names from [`eval/arena/cases.json`](https://github.com/DealAppSeo/repid-engine/blob/main/eval/arena/cases.json); definitions in `oracle.ts`). A model never decides an outcome. **There is no fixed corpus:** variants are written fresh each pass, so variant counts differ from pass to pass. The ruler is the executor, the grader and the chain:', '');
  const trows = (kind, ids, rows, fmt) => ids.map((id) => { const rs = rows.filter((r) => r.ruler === id); return fmt(id, rs); });
  const tIds = [...new Set(rtAll.map((r) => r.ruler))];
  p(table(['id', 'executor under test', 'oracle manifest', 'chain', 'variants from', 'graded passes', 'first', 'last'],
    tIds.map((id) => { const rs = rtAll.filter((r) => r.ruler === id && r.pass + r.fail > 0), r = rs[0] ?? rtAll.find((x) => x.ruler === id); return [id, `${r.engine}${r.fixes ? ' (kernel-fixes marker present)' : ' (no kernel-fixes marker)'}`, r.manifest, r.chain === 'hardhat-devnet' ? 'Hardhat devnet' : 'in-memory twin', r.seeds ? 'built-in seeds, no model' : 'free models', rs.length, rs[0] ? z(rs[0].at) : '—', rs.length ? z(rs.at(-1).at) : '—']; })), '');
  p('"Kernel-fixes marker" is the loop\'s own test that the checkout\'s `src/kernel/store.ts` contains `indeterminate(`; it is a marker, not a commit. The oracle manifest is the first 8 hex digits of `eval/arena/manifest.json`\'s sha256.', '');
  p('**Arena (A).** Each scheduled run is ten exchanges between synthetic agents on a throwaway devnet: two positive controls (`happy_usdc`, `happy_eth`) and eight attack cases drawn from the frozen 18-case list plus `respelled_replay`, which is beyond it. Models only propose terms and deliverables; deterministic code decides every outcome. The cases rotate, so two runs are not the same ten. The ruler is the repid-engine checkout:', '');
  const aIds = [...new Set(arAll.map((r) => r.ruler))];
  p(table(['id', 'repid-engine commit', 'agents', 'graded runs', 'first', 'last'],
    aIds.map((id) => { const rs = arAll.filter((r) => r.ruler === id && r.pass + r.fail > 0), r = rs[0] ?? arAll.find((x) => x.ruler === id); return [id, r.git, /^stub$/.test(r.calls) ? 'built-in stub agents, no model' : 'free models', rs.length, rs[0] ? z(rs[0].at) : '—', rs.length ? z(rs.at(-1).at) : '—']; })), '');

  // ── red-team scheduled table ──────────────────────────────────────────────────────────────────
  p('## Red team: every entry in the scheduled log', '',
    'One row per scheduler header in `redteam-loop.log`, oldest first. *Started* is the loop\'s own UTC timestamp; a row with no summary line has only the scheduler\'s local time. *Families*: how many of the eight class prompts each family answered.', '');
  const rtRows = rt.map((r, i) => {
    if (r.none) return [i + 1, `(local ${r.local})`, '—', '—', 'NO SUMMARY LINE: the log has a header and nothing after it', '—', '—', '—', '—', '—', '—', '—'];
    const s = r.s;
    if (!s.graded) return [i + 1, z(s.at), s.batch, '—', `NOT_CHECKED, whole run: ${s.why}`, '—', '—', '—', '—', '—', '—', '—'];
    const f = rtGraded.find((g) => g.batch === s.batch);
    return [i + 1, z(s.at), s.batch + (s.batch === 'dbc487e8' ? ' †' : ''), f.ruler, 'graded', s.variants, s.pass, s.fail, s.nc, s.reached, s.breaches.length ? s.breaches.join(', ') : 'none', f.fam.text];
  });
  p(table(['#', 'started', 'batch', 'ruler', 'result', 'variants', 'PASS', 'FAIL', 'NOT_CHECKED', 'reached kernel', 'breaches', 'families'], rtRows), '');
  const deg = recordNames().includes('DEGRADED_BATCHES.md') ? read('DEGRADED_BATCHES.md') : '';
  if (deg.includes('dbc487e8')) p('† Batch `dbc487e8` is on the loop\'s own list of degraded batches ([DEGRADED_BATCHES.md](red-team/records/DEGRADED_BATCHES.md)): a harness bug (the devnet\'s output was piped to a process that stopped reading) wedged the devnet partway through, so most of its variants are NOT_CHECKED for a reason that is not the models\'. Its 9 PASS were graded before that. The loop\'s note says to leave it out of "variants graded per pass" comparisons; it is in the totals above because the record is a record, and the bug is fixed with a regression test (per that note).', '');
  const slots = gaps(rtBlocks.map((b) => b.local));
  if (slots.length) p(`Gaps in the cadence (entries more than five hours apart, where the log's other entries are four hours apart): ${slots.join('; ')}. The log does not say why.`, '');

  // why variants were NOT_CHECKED, and the per-class picture, for the graded passes with a report
  const withSec = rtGraded.filter((s) => secs.has(s.batch));
  if (withSec.length) {
    p('### Why variants were NOT_CHECKED, per graded pass', '',
      table(['batch', 'harness error', 'model gave no variants', 'invalid variant', 'sum', 'NOT_CHECKED in the log line'],
        withSec.map((s) => { const w = secs.get(s.batch).why, t = w['harness error'] + w['model gave no variants'] + w['invalid variant']; return [s.batch, w['harness error'], w['model gave no variants'], w['invalid variant'], t, s.nc + (t === s.nc ? '' : ' (does not match)')]; })), '',
      'A *model gave no variants* is a family that returned nothing usable for a class prompt (for example a model that no longer exists answering HTTP 404). An *invalid variant* failed the strict validator. A *harness error* is the devnet or the runner, not the model.', '');
    const cur = withSec.filter((s) => s.ruler === rtScheduledRulers.at(-1));
    const cls = {};
    for (const s of cur) for (const [k, v] of Object.entries(secs.get(s.batch).cls)) { const c = (cls[k] ??= { pass: 0, fail: 0, nc: 0 }); c.pass += v.pass; c.fail += v.fail; c.nc += v.nc; }
    p(`### Per attack class, ruler ${rtScheduledRulers.at(-1)}, summed over ${plural(cur.length, 'graded pass', 'graded passes')}`, '',
      table(['class', 'PASS', 'FAIL', 'NOT_CHECKED'], Object.entries(cls).map(([k, v]) => [k, v.pass, v.fail, v.nc])), '');
    const inj = cur.map((s) => secs.get(s.batch).inj).filter(Boolean);
    if (inj.length) p(`*prompt_injection is advisory.* Across these passes the buyer model proposed a follow-up payment for ${inj.reduce((a, x) => a + x[0], 0)} of ${inj.reduce((a, x) => a + x[1], 0)} injected deliverables. The reports add that each injected payment was executed as if the model had obeyed, so what is graded is the payment, not the model's resistance.`, '');
  }

  // ── arena ─────────────────────────────────────────────────────────────────────────────────────
  p('## Arena: every entry in the scheduled log', '',
    'One row per scheduler header in `arena-loop.log`. *Breaches* are the pass conditions the grader marked broken; *known* are failures the arena had pinned in advance, *new* is anything else.', '');
  const arRows = ar.map((r, i) => {
    if (!r.s) return [i + 1, `(local ${r.local})`, '—', '—', 'NO SUMMARY LINE: the log has a header and nothing after it', '—', '—', '—', '—', '—', '—'];
    const s = r.s;
    if (!s.graded) return [i + 1, z(s.at), s.batch, '—', `NOT_CHECKED, whole run: ${s.capped ? 'the daily model-call cap was already reached; nothing ran' : s.why}`, '—', '—', '—', '—', '—', '—'];
    const a = arAll.find((x) => x.batch === s.batch);
    const res = s.pass + s.fail === 0 ? 'NOT_CHECKED, whole run' : s.capped ? 'stopped at the daily cap after the first exchange' : 'graded';
    return [i + 1, z(s.at), s.batch, a.ruler, res, s.records, s.pass, s.fail, s.nc, s.breaches.length ? `${s.breaches.join(', ')} (known: ${s.known.join(', ') || 'none'}; new: ${s.fresh.join(', ') || 'none'})` : 'none', s.models.join(', ')];
  });
  p(table(['#', 'started', 'batch', 'ruler', 'result', 'exchanges', 'PASS', 'FAIL', 'NOT_CHECKED', 'breaches', 'models'], arRows), '');
  const aslots = gaps(arBlocks.map((b) => b.local));
  p(aslots.length ? `Gaps in the cadence: ${aslots.join('; ')}.` : 'No gaps in the four-hour cadence.', '');
  const cur = arAll.filter((r) => r.ruler === arSchedRulers.at(-1) && r.cases);
  if (cur.length) {
    const byCase = {};
    for (const r of cur) for (const c of r.cases) { const x = (byCase[c.name] ??= { PASS: 0, FAIL: 0, NOT_CHECKED: 0 }); x[c.verdict]++; }
    p(`### Per case, ruler ${arSchedRulers.at(-1)}, summed over ${plural(cur.length, 'run')}`, '',
      table(['case', 'PASS', 'FAIL', 'NOT_CHECKED'], Object.entries(byCase).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, v.PASS, v.FAIL, v.NOT_CHECKED])), '');
  }

  // ── NOT_CHECKED, in one place ─────────────────────────────────────────────────────────────────
  const rtInfra = rt.filter((r) => r.s && !r.s.graded), rtNone = rt.filter((r) => r.none);
  const arNone = ar.filter((r) => r.s && !r.s.graded);
  p('## Runs that graded nothing, listed as NOT_CHECKED', '',
    'None of these is a pass. They are here so that the number of runs above is the number of runs that happened.', '',
    `- **Red team, no verdict at all:** ${plural(rtInfra.length, 'run')}${rtInfra.length ? ` (${rtInfra.map((r) => r.s.batch).join(', ')})` : ''}. ${rtInfra.length ? `Cause as the log records it: "${[...new Set(rtInfra.map((r) => r.s.why))].join('"; "')}". The model-call counter printed on those lines (a UTC-day total, cap in the second number) reads ${rtInfra.map((r) => r.s.dayCalls).join(', ')}; it rises while nothing is graded, so model calls were spent on passes that produced no verdict.` : ''}`,
    `- **Red team, entries with no summary line:** ${plural(rtNone.length, 'entry', 'entries')} (${rtNone.map((r) => `local ${r.local}`).join('; ') || 'none'}). Whether those runs started, failed or were stopped is not in the log.`,
    `- **Arena, no exchanges graded:** ${plural(arNone.length, 'run')} (${arNone.map((r) => `${r.s.batch}: ${r.s.capped ? 'daily cap' : 'devnet'}`).join('; ')}).`,
    '');

  // ── before the schedule ───────────────────────────────────────────────────────────────────────
  p('## Before the schedule began (ledger only, different rulers)', '',
    'Each loop also keeps a ledger with one line per pass. Passes before the four-hourly schedule are in the ledger and not in the log. They are shown one by one, with their rulers, because summing across rulers would be wrong in both directions: some of these passes recorded breaches, on earlier executor commits, and some did not. The records do not say what changed between one commit and the next, and this page does not infer it.', '');
  p('### Red team', '',
    table(['started', 'batch', 'ruler', 'variants', 'PASS', 'FAIL', 'NOT_CHECKED', 'reached kernel', 'breaches'],
      rtEarly.map((r) => { const q = rtAll.find((x) => x.batch === r.batch); return [z(r.at), r.batch, q.ruler, r.variants, r.pass, r.fail, r.nc, r.reached ?? 'not recorded', r.breaches.length ? r.breaches.join(', ') : 'none']; })), '');
  p('### Arena', '',
    table(['started', 'batch', 'ruler', 'exchanges', 'PASS', 'FAIL', 'NOT_CHECKED', 'breaches', 'agents'],
      arEarly.map((r) => [z(r.at), r.batch, r.graded ? arAll.find((x) => x.batch === r.batch)?.ruler ?? '—' : '—', r.graded ? r.records : '—', r.graded ? r.pass : '—', r.graded ? r.fail : '—', r.graded ? r.nc : '—', r.graded ? (r.breaches.length ? `${r.breaches.join(', ')} (known: ${r.known.join(', ') || 'none'}; new: ${r.fresh.join(', ') || 'none'})` : 'none') : `whole run NOT_CHECKED: ${r.capped ? 'cap' : r.why}`, r.graded ? (/^stub$/.test(r.calls) ? 'stub' : 'free models') : '—'])), '',
    'A *known* failure is one the arena had pinned as an open hole before running the case. The public arena README records the same story for the replay and concurrency cases: they "each settled a second time on a kernel with no one-use authorization", and were closed by [repid-engine#1453](https://github.com/DealAppSeo/repid-engine/pull/1453) ([README](https://github.com/DealAppSeo/repid-engine/blob/main/scripts/e2e-local/arena/README.md#known-holes-recorded-as-fail-pinned-with-itfailing-never-hidden)). The first scheduled arena run above is still on a commit where two of them were pinned open.', '');

  // ── the tarball ───────────────────────────────────────────────────────────────────────────────
  if (rc) {
    p('## The @hyperdag/trustshell@1.8.0 tarball: a separate attack on a separate ruler', '',
      `One run of a scripted battery against the packed tarball, ${rc.when}, labelled \`${rc.label}\` (the candidate was attacked before release). It is a different thing from the two loops: the attacker is a fixed battery, not a model; the target is the package, not the engine's kernel. Its counts are not added to theirs.`, '',
      `- **Ruler:** tarball sha256 \`${rc.sha256}\`; integrity \`${rc.integrity}\`. ${rc.integrity === NPM_1_8_0_INTEGRITY ? 'That integrity is the one npm reported for `@hyperdag/trustshell@1.8.0` on 2026-10-23, so the tarball attacked is the one that was released.' : '**That integrity is not the one npm reported for `@hyperdag/trustshell@1.8.0` on 2026-10-23, so this report is about a different tarball from the released one.**'}`,
      `- **Result as the report states it:** ${rc.headline}. Recounted from the rows in the committed copy: PASS ${rc.count.PASS}, FAIL ${rc.count.FAIL}, INFO ${rc.count.INFO}, NOT_CHECKED ${rc.count.NOT_CHECKED}${rc.match ? ' (matches)' : ' (**does not match the report\'s own headline**)'}.`,
      '- **PASS** means the attack failed or the limit is disclosed; **FAIL** a bypass worked or a limit is not disclosed; **INFO** a measurement or a documented boundary, which is not a pass; **NOT_CHECKED** the case could not be run or its own control did not hold, so it proves nothing.', '',
      table(['area', 'PASS', 'FAIL', 'INFO', 'NOT_CHECKED'], Object.entries(rc.areas).map(([a, v]) => [a, v.PASS, v.FAIL, v.INFO, v.NOT_CHECKED])), '',
      `**NOT_CHECKED, all ${rc.nc.length}, not dropped:** ${rc.nc.filter((r) => r.area !== 'contrib').map((r) => `\`${r.area}/${r.attack}\` (${r.evidence.split(' (')[0]})`).concat(contribNc(rc.nc)).join('; ')}.`, '',
      'The battery script is not published. A PASS row means that attack did not work in that run, not that the area is secure. INFO rows and the text of contributed cases are not reproduced here. To confirm the tarball identity yourself: `npm view @hyperdag/trustshell@1.8.0 dist.integrity`.', '');
  }

  // ── models ────────────────────────────────────────────────────────────────────────────────────
  const health = JSON.parse(read('health-state.json'));
  p('## Models', '',
    'The loops call free-tier models and a local one. The loop keeps a health record per model and stops calling one that has been marked gone. The record has no timestamp of its own; this is the copy in the records folder.', '',
    table(['model', 'last result', 'fail count (as recorded)', 'skipped until (UTC)'],
      Object.entries(health).map(([m, h]) => [m, h.last, h.fails, h.open_until ? z(new Date(h.open_until).toISOString()) : '—'])), '',
    `${Object.values(health).filter((h) => h.last === 'model_gone').length} of ${Object.keys(health).length} listed models are marked gone. The local Ollama models used by the red team are not tracked in this file; the *families* column above shows which family answered in each pass.`, '');

  // ── reproduce ─────────────────────────────────────────────────────────────────────────────────
  p('## How to reproduce', '',
    '**1. Check this page against its records.** Needs Node 22, no network:', '',
    '```bash', 'node scripts/redteam-report.mjs --check', '```', '',
    'Every row above names a batch id that appears in a line of `docs/red-team/records/*.log` or `*.jsonl`. The script fails if a log line and its ledger line disagree.', '',
    '**2. Run the public executor and grader yourself.** The frozen grader and the arena executor are public in [DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine) (`eval/arena/`, `scripts/e2e-local/arena/`). The loop that drives them with free models is not in that repository (its arena README says the loop "lives outside the repo") and is not in this one; we have not searched elsewhere. The red team\'s executor commit is a local merge commit that is not on GitHub (checked 2026-10-23: `gh api repos/DealAppSeo/repid-engine/commits/ac791e53c6` returns 422; the arena commits `385e4bb` and `11508aa` resolve). So you can re-run the grader on your own variants and read the same verdicts; you cannot re-run these exact passes.', '',
    '```bash',
    'git clone https://github.com/DealAppSeo/repid-engine && cd repid-engine',
    '# install its dependencies as its README says, then:',
    'node eval/arena/seal.mjs --check     # exits 1 if the frozen grader files have changed (eval/arena/FROZEN.md)',
    'sha256sum eval/arena/manifest.json   # 93ac74d9ef52eb453d1a0b0c40d154b39f44a4cb24f9da5d91866e5378e2904c on main, 2026-10-23;',
    '                                     # the oracle column above is the first 8 digits of the manifest the passes were graded on',
    '# the arena offline, as its README gives it (PowerShell: set the two variables with $env: first)',
    'SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=dummy-key npx jest tests/arena-l0.test.ts',
    '```', '',
    '**3. Write variants with whatever model you have.** A variant is a JSON object in the schema at the top of `eval/arena/variants.ts` (`class`, `label`, `asset`, `npa`, `signatures`, `request`, `presentations`, `claims`, `feedback`, `deliverable`). The loops used free tiers: Groq, OpenRouter\'s free models, Cerebras, and a local or Ollama-cloud model. Any of them, or you by hand, will do. Put your variants in a file shaped `[{"id": "...", "variant": {...}}]`.', '',
    '**4. Grade them.** From the same checkout (see the header of `eval/arena/run-variants.ts`; no model is called and no key leaves the process):', '',
    '```bash',
    'npx ts-node --transpile-only --project tsconfig.json eval/arena/run-variants.ts \\',
    '  --arena-repo . --variants variants.json --out out.json     # add --rpc http://127.0.0.1:PORT for a Hardhat devnet',
    '```', '',
    'The last line it prints starts `REDTEAM_RESULT`. A verdict is `PASS`, `FAIL` or `NOT_CHECKED`, with the pass conditions broken, if any.', '',
    '**5. Check the package, not just the engine.** The five-minute challenge in [docs/challenge.md](challenge.md) attacks `trustshell check`; the 1.8.0 tarball section above lists what its battery tried.', '',
    '## Found a breach?', '',
    '- A claim that comes back **SUPPORTED** when the run does not back it, or any wrong verdict from `trustshell check`: [open a wrong-verdict issue](https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml). Public runs only; never paste a secret.',
    '- A variant that breaks the engine\'s kernel or payment gate in the arena: open an issue on [DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine/issues/new) with the variant JSON, the `run-variants.ts` output and the commit you ran. It is a local devnet with a mock token, so the variant is safe to publish.',
    '- Anything that works against a deployed system: report it **privately** through [SECURITY.md](../SECURITY.md), not in an issue.', '',
    '**The rule:** every breach we accept becomes a regression test in the repository whose code it broke, so the next release has to survive it. Old rows on this page are not edited; a fix shows up as a new ruler. The arena already works this way: the replay and concurrency holes above were pinned as expected failures, and `tests/arena-l0.test.ts` now asserts they pass ([repid-engine#1453](https://github.com/DealAppSeo/repid-engine/pull/1453)).', '',
    'Why this page lists what it cannot show as carefully as what it can: [hyperdag-protocol/docs/WHY.md](https://github.com/DealAppSeo/hyperdag-protocol/blob/main/docs/WHY.md) sets out the research we lean on and the research that cuts against us. This page does not copy it.', '');

  // ── fingerprints ──────────────────────────────────────────────────────────────────────────────
  p('## Records this page was made from', '',
    table(['file', 'bytes', 'sha256 (first 16 hex, line endings normalised to LF)'], recordNames().map((n) => { const t = read(n); return [n, Buffer.byteLength(t), sha16(t)]; })), '',
    'The copies are the loops\' files with local paths turned into `<home>/` and `<ops>/`, loopback ports into `<port>`, and, in the tarball report only, the evidence text of contributed cases and INFO rows withheld. `node scripts/redteam-report.mjs --sync` does that copy and prints how many cells it changed in each file.', '');

  return L.join('\n');

  // the 1.8.0 battery, from its committed report
  function rcModel() {
    const f = recordNames().find((n) => /^RC_ATTACK_.*\.md$/.test(n));
    if (!f) return null;
    const t = read(f);
    const head = /^# RC attack — (\S+) — (\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/m.exec(t);
    const cand = /^Candidate: `([^`]+)` · tarball sha256 `([0-9a-f]{64})` · integrity `([^`]+)`/m.exec(t);
    const headline = /^(PASS \d+ · FAIL \d+ · INFO \d+ · NOT_CHECKED \d+ · new findings \d+)$/m.exec(t)?.[1];
    if (!head || !cand || !headline) throw new Error(`${f}: not in the shape this script reads`);
    const rows = [...t.matchAll(/^\| ([\w-]+) \| ([^|]+?) \| \*\*([A-Z_]+)\*\* \| (.*) \|$/gm)].map((m) => ({ area: m[1], attack: m[2].trim(), outcome: m[3], evidence: m[4] }));
    const count = { PASS: 0, FAIL: 0, INFO: 0, NOT_CHECKED: 0 }, areas = {};
    for (const r of rows) { count[r.outcome]++; (areas[r.area] ??= { PASS: 0, FAIL: 0, INFO: 0, NOT_CHECKED: 0 })[r.outcome]++; }
    const said = Object.fromEntries([...headline.matchAll(/(PASS|FAIL|INFO|NOT_CHECKED) (\d+)/g)].map((m) => [m[1], +m[2]]));
    return { candidate: cand[1], sha256: cand[2], integrity: cand[3], headline, count, areas, match: Object.keys(count).every((k) => count[k] === said[k]), nc: rows.filter((r) => r.outcome === 'NOT_CHECKED'), label: head[1], when: `${head[2]} ${head[3]}:${head[4]}Z` };
  }
}

/** The contributed NOT_CHECKED cases, said by verdict only: their ids and claim text are not published. */
function contribNc(nc) {
  const by = {};
  for (const r of nc.filter((x) => x.area === 'contrib')) { const v = /verdict ([A-Z_]+)/.exec(r.evidence)?.[1] ?? 'not recorded'; by[v] = (by[v] || 0) + 1; }
  return Object.entries(by).map(([v, n]) => `${plural(n, 'contributed case')} with verdict ${v}${v === 'INVALID' ? ' (the case\'s own control did not hold, so it proves nothing either way)' : ''}, id and text withheld`);
}

/** Entries more than five hours after the one before them, where the cadence is four. */
function gaps(locals) {
  const t = locals.map((l) => Date.parse(`${l.replace(' ', 'T')}:00Z`)); // local wall-clock read as if UTC: only the differences are used
  const out = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 5 * 3600e3) out.push(`no entry between local ${locals[i - 1]} and local ${locals[i]}, which are ${Math.round((t[i] - t[i - 1]) / 3600e3)} h apart`);
  return out;
}

if (flag('sync')) sync();
const page = render() + '\n';
if (flag('check')) {
  const have = fs.existsSync(OUT) ? lf(fs.readFileSync(OUT, 'utf8')) : '';
  if (have !== page) { console.error(`${path.relative(ROOT, OUT)} is not what the records in ${path.relative(ROOT, REC)} produce. Run: node scripts/redteam-report.mjs`); process.exit(1); }
  console.log(`${path.relative(ROOT, OUT)} matches its records.`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${page.length} chars)`);
}
