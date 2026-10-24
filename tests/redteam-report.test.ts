/**
 * docs/red-team.md is a results page. The ways such a page lies are: it counts a run that graded
 * nothing as a pass, it adds up numbers taken on different rulers, it drops the runs that failed,
 * it says "0 breaches" over a record that has one, or it copies something out of the loops' folder
 * that was never meant to be public. This pins each of those by running the REAL script
 * (scripts/redteam-report.mjs) over small hand-made records. Nothing in it is mocked.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(30000);

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'redteam-report.mjs');

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

const rtLine = (batch: string, at: string, v: number, pass: number, fail: number, nc: number, engine: string, breaches = '') =>
  `REDTEAM ${at} batch=${batch} chain=hardhat-devnet variants=${v} PASS=${pass} FAIL=${fail} NOT_CHECKED=${nc} reached_kernel=4 breaches=[${breaches}] calls=20/300 pass=20/50 engine=${engine}+fixes report=E:/dev/reports/2026-10-21/REDTEAM_LOOP.md EXIT ${fail ? 1 : 0}`;
const ledgerRow = (batch: string, at: string, v: number, pass: number, fail: number, nc: number, sha: string, breaches: string[] = []) =>
  JSON.stringify({ batch_id: `${batch}-0000-0000-0000-000000000000`, at, chain: 'hardhat-devnet', engine: { repo: 'C:/Users/Someone/repos/engine', git_sha: `${sha}0000`, has_kernel_fixes: true }, manifest_sha256: '93ac74d9ef52eb45'.padEnd(64, '0'), variants: v, pass, fail, not_checked: nc, reached_kernel: 4, breaches, families: 'openai-oss: 8 CHECKED [groq/openai/gpt-oss-120b], 0 NOT_CHECKED', exit: fail ? 1 : 0 });
const arLine = (batch: string, at: string, git: string, pass: number, fail: number) =>
  `ARENA ${at} batch=${batch} git=${git} records=10 PASS=${pass} FAIL=${fail} NOT_CHECKED=0 breaches=${fail ? `double_execution:${fail}` : 'none'} known=[] new=[] egress_blocked=0 calls=30/300 models=groq/openai/gpt-oss-120b EXIT ${fail ? 1 : 0}`;

/** Two red-team rulers (two engine commits), one entry with no summary, one that never got a devnet. */
function fixture(dir: string, opts: { ledgerPass?: number } = {}) {
  mkdirSync(dir, { recursive: true });
  const f = (name: string, text: string) => writeFileSync(join(dir, name), text);
  f('redteam-loop.log', [
    '==== Wed 10/21/2026  2:30:00.49 ', rtLine('aaaaaaaa', '2026-10-21T09:30:00.983Z', 10, 8, 0, 2, 'aaaa1111'),
    '==== Wed 10/21/2026  6:30:00.49 ',
    '==== Wed 10/21/2026 10:30:00.49 ', 'REDTEAM 2026-10-21T17:30:00.983Z batch=bbbbbbbb infra: devnet did not come up on chain 31337 (got null) calls=70/300 EXIT 2',
    '==== Wed 10/21/2026 14:30:00.49 ', rtLine('cccccccc', '2026-10-21T21:30:00.983Z', 10, 9, 1, 0, 'cccc2222', 'double_execution'),
  ].join('\n') + '\n');
  f('redteam-batches.jsonl', [
    ledgerRow('aaaaaaaa', '2026-10-21T09:30:00.983Z', 10, opts.ledgerPass ?? 8, 0, 2, 'aaaa1111'),
    ledgerRow('cccccccc', '2026-10-21T21:30:00.983Z', 10, 9, 1, 0, 'cccc2222', ['double_execution']),
  ].join('\n') + '\n');
  f('arena-loop.log', ['==== Wed 10/21/2026  0:15:01.70 ', '#1 happy_usdc [USDC] PASS', arLine('dddddddd', '2026-10-21T07:15:01.941Z', '385e4bb', 8, 2)].join('\n') + '\n');
  f('arena-batches.jsonl', JSON.stringify({ at: '2026-10-21T07:15:01.941Z', batch_id: 'dddddddd-0000', exit: 1, line: arLine('dddddddd', '2026-10-21T07:15:01.941Z', '385e4bb', 8, 2) }) + '\n');
  f('health-state.json', JSON.stringify({ 'groq/openai/gpt-oss-120b': { last: 'ok', fails: 0, opens: 0, open_until: 0 } }));
}

describe('docs/red-team.md', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'redteam-report-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('is exactly what the committed records produce (a hand edit to the page fails here)', () => {
    const r = run(['--check']);
    expect({ status: r.status, err: r.stderr }).toEqual({ status: 0, err: '' });
  });

  it('fails --check when the page differs from its records', () => {
    fixture(join(tmp, 'rec'));
    const out = join(tmp, 'page.md');
    expect(run(['--records', join(tmp, 'rec'), '--out', out]).status).toBe(0);
    writeFileSync(out, readFileSync(out, 'utf8').replace('0 breaches', 'no breaches'));
    const r = run(['--check', '--records', join(tmp, 'rec'), '--out', out]);
    expect(r.status).toBe(1);
  });

  it('keeps every scheduled entry: a header with no summary and a run with no devnet are rows, not gaps, and neither is counted as graded', () => {
    fixture(join(tmp, 'rec'));
    const out = join(tmp, 'page.md');
    expect(run(['--records', join(tmp, 'rec'), '--out', out]).status).toBe(0);
    const page = readFileSync(out, 'utf8');
    expect(page).toContain('NO SUMMARY LINE');
    expect(page).toContain('NOT_CHECKED, whole run: devnet did not come up on chain 31337');
    expect(page).toContain('The scheduled red-team log has 4 entries; 2 graded variants and the other 2 graded nothing');
  });

  it('never adds up counts taken on different rulers, and never says "0 breaches" over a record with a FAIL', () => {
    fixture(join(tmp, 'rec'));
    const out = join(tmp, 'page.md');
    expect(run(['--records', join(tmp, 'rec'), '--out', out]).status).toBe(0);
    const page = readFileSync(out, 'utf8');
    expect(page).toContain('Of the 10 variants the loop counted, 8 PASS, 0 FAIL, 2 NOT_CHECKED');
    expect(page).toContain('Of the 10 variants the loop counted, 9 PASS, 1 FAIL, 0 NOT_CHECKED');
    expect(page).not.toMatch(/Of the 20 variants/);
    const second = page.split('\n').find((l) => l.includes('Of the 10 variants the loop counted, 9 PASS'))!;
    expect(second).toContain('1 FAIL (double_execution)');
    expect(second).not.toContain('0 breaches');
    // the arena run that recorded two breaches is reported as two, with its own ruler
    expect(page).toMatch(/Arena, scheduled runs, ruler A1:\*\* 2 FAIL \(double_execution ×2/);
  });

  it('cannot be made to break a table by text in a log line: a backslash before a pipe stays literal', () => {
    // Log text reaches table cells. In Markdown a backslash escapes the next character, so escaping only the pipe turns
    // `\|` into `\\|`, an escaped backslash followed by a live column break. (CodeQL js/incomplete-sanitization.)
    fixture(join(tmp, 'rec'));
    const hostile = 'x\\|y \\\\| z | <b>w</b>';
    appendFileSync(join(tmp, 'rec', 'arena-loop.log'), `==== Wed 10/21/2026  4:15:01.70 \nARENA 2026-10-21T11:15:02.038Z batch=eeeeeeee ${hostile} EXIT 2\n`);
    appendFileSync(join(tmp, 'rec', 'redteam-loop.log'), `==== Wed 10/21/2026 18:30:00.49 \nREDTEAM 2026-10-22T01:30:00.983Z batch=ffffffff infra: ${hostile} calls=80/300 EXIT 2\n`);
    const out = join(tmp, 'page.md');
    expect(run(['--records', join(tmp, 'rec'), '--out', out]).status).toBe(0);
    const lines = readFileSync(out, 'utf8').split('\n');
    // Markdown's own rule: a backslash escapes the next character; an unescaped pipe ends a cell.
    const split = (row: string) => {
      const cells: string[] = []; let cur = '';
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '\\' && i + 1 < row.length) { cur += row[i] + row[i + 1]; i++; }
        else if (row[i] === '|') { cells.push(cur); cur = ''; }
        else cur += row[i];
      }
      cells.push(cur);
      return cells.slice(1, -1).map((c) => c.trim()); // drop what is outside the first and last pipe
    };
    let width = 0, checked = 0;
    for (const l of lines) {
      if (!l.startsWith('|')) { width = 0; continue; }
      const n = split(l).length;
      if (!width) width = n;
      expect({ row: l.slice(0, 90), cells: n }).toEqual({ row: l.slice(0, 90), cells: width });
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
    // and the cell reads back as exactly what was in the log
    const unescape = (c: string) => c.replace(/\\([\\|])/g, '$1');
    const rows = lines.filter((l) => l.includes('eeeeeeee') && l.startsWith('|')).concat(lines.filter((l) => l.includes('ffffffff') && l.startsWith('|')));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(split(r).map(unescape).some((c) => c.includes(hostile.replace('<b>w</b>', '&lt;b>w&lt;/b>')))).toBe(true);
  });

  it('stops, rather than printing a number, when a log line and its ledger line disagree', () => {
    fixture(join(tmp, 'rec'), { ledgerPass: 7 });
    const r = run(['--records', join(tmp, 'rec'), '--out', join(tmp, 'page.md')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/the log line and the ledger disagree/);
    expect(existsSync(join(tmp, 'page.md'))).toBe(false);
  });
});

describe('--sync copies only what may be published', () => {
  it('turns local paths and ports into placeholders and withholds contributed-case text, INFO text and issue-draft payloads', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'redteam-sync-'));
    try {
      const loop = join(tmp, 'loop'), reports = join(tmp, 'reports'), rec = join(tmp, 'rec');
      for (const d of ['logs', 'health', 'redteam', 'arena']) mkdirSync(join(loop, d), { recursive: true });
      mkdirSync(join(reports, '2026-10-21'), { recursive: true });
      fixture(join(tmp, 'fx'));
      const cp = (from: string, to: string) => writeFileSync(to, readFileSync(join(tmp, 'fx', from)));
      cp('redteam-loop.log', join(loop, 'logs', 'redteam-loop.log'));
      cp('arena-loop.log', join(loop, 'logs', 'arena-loop.log'));
      cp('health-state.json', join(loop, 'health', 'state.json'));
      cp('redteam-batches.jsonl', join(loop, 'redteam', 'batches.jsonl'));
      cp('arena-batches.jsonl', join(loop, 'arena', 'batches.jsonl'));
      writeFileSync(join(loop, 'redteam', 'DEGRADED_BATCHES.md'), 'Fixed in `E:\\dev\\ops\\loop\\devnet.mjs`.\n');
      writeFileSync(join(reports, '2026-10-21', 'REDTEAM_LOOP.md'), [
        '# REDTEAM_LOOP', '', '## Pass cccccccc · 2026-10-21T21:30:00.983Z · hardhat-devnet',
        'Engine under test: `C:/Users/Someone/repos/engine` @ `cccc22220000`.', '', '### Issue drafts', '',
        '#### [redteam] replay: double_execution', '- Reproduce: from C:/Users/Someone/repos/engine run it', '```json', '{"class":"replay","SECRET_PAYLOAD":1}', '```', '',
        '### NOT_CHECKED (says nothing about the executor)', '- 1 × harness error: http://127.0.0.1:53142/', '',
      ].join('\n'));
      writeFileSync(join(reports, 'rc.md'), [
        '# RC attack — 1.8.0-dry — 2026-10-23T00-10-12-628Z', '',
        'Candidate: `@hyperdag/trustshell@1.8.0` · tarball sha256 `' + 'a'.repeat(64) + '` · integrity `sha512-xyz`', '',
        'PASS 1 · FAIL 0 · INFO 1 · NOT_CHECKED 1 · new findings 0', '', '| area | attack | outcome | evidence |', '|---|---|---|---|',
        '| inspect | genuine | **PASS** | verdict INTACT, exit 0 — control |',
        '| latency | cli --version | **INFO** | n=15 p50 561.2 ms INFO_TEXT |',
        '| contrib | secret-hole-id-SHOULD_NOT_APPEAR | **NOT_CHECKED** | [unenforced-permission] CLAIM_TEXT → INVALID: its own control did not hold ({"step":0}) |', '',
      ].join('\n'));
      const r = run(['--sync', '--records', rec, '--out', join(tmp, 'page.md')], { REDTEAM_LOOP_DIR: loop, REDTEAM_REPORTS_DIR: reports, REDTEAM_RC_REPORT: join(reports, 'rc.md') });
      expect({ status: r.status, err: r.stderr }).toEqual({ status: 0, err: '' });
      const everything = readdirSync(rec).map((n) => readFileSync(join(rec, n), 'utf8')).join('\n') + readFileSync(join(tmp, 'page.md'), 'utf8');
      for (const leak of ['Someone', 'C:/Users', 'E:\\dev', 'E:/dev', '53142', 'SECRET_PAYLOAD', 'SHOULD_NOT_APPEAR', 'CLAIM_TEXT', 'INFO_TEXT']) expect(everything).not.toContain(leak);
      // what the page needs survived the reduction
      expect(readFileSync(join(rec, 'RC_ATTACK_rc.md'), 'utf8')).toContain('| inspect | genuine | **PASS** | verdict INTACT, exit 0 — control |');
      expect(readFileSync(join(tmp, 'page.md'), 'utf8')).toContain('1 contributed case with verdict INVALID');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});
