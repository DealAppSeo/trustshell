/**
 * `trustshell trust-report`: the report must say what the evidence says, and must fail when either changes.
 * Records come from the real `guard` and `run` code; only process start is faked.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGuard, runRun, type Spawner } from '../src/cli/guard';
import { signOwnerReceipt } from '../src/lib/owner-receipt';
import { NOT_MEDIATED_ALWAYS, buildTrustReport, sealBody, renderTrustReportHtml, renderTrustReportMarkdown, runTrustReport, type TrustReport } from '../src/cli/trust-report';
import { ACTION_EVIDENCE_SCHEMA, digestRecord } from '../src/lib/action-evidence';

const envOf = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const quiet = () => {
  const lines: string[] = [];
  return { lines, io: { out: (s: string) => lines.push(s), err: (s: string) => lines.push(s) } };
};

function record(claims: { status: string; claim: string }[], conclusion = 'success', verdict = 'COMPLETE') {
  const rec = {
    schema: ACTION_EVIDENCE_SCHEMA,
    observation: { url: 'https://github.com/o/r/actions/runs/1', owner: 'o', repo: 'r', run_id: 1, head_sha: 'abc', conclusion, check: { verdict, results: [] }, fetchedAt: '2026-11-08T00:00:00Z' },
    claims: claims.map((c) => ({ ...c, scope: 'scope text' })),
  };
  return { record: rec, digest: digestRecord(rec as never) };
}

describe('trust-report', () => {
  let dir = '';
  let env = envOf({});
  const started = (status: number | null, error?: string): Spawner => () => ({ status, signal: null, error });
  const run = (tool: string, spawn: Spawner) => runRun(['--tool', tool, '--', tool], quiet().io, env, spawn);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-trust-report-'));
    env = envOf({ TRUSTSHELL_HOME: join(dir, 'home') });
    expect(runGuard(['init'], quiet().io, env)).toBe(0);
    expect(runGuard(['allow', 'tool:fake'], quiet().io, env)).toBe(0);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function make(args: string[]): Promise<{ code: number; out: string; report: TrustReport }> {
    const q = quiet();
    const out = join(dir, 'out');
    const code = await runTrustReport(['--out', out, ...args], q.io, env, dir);
    return { code, out, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
  }
  const key = (out: string): string => JSON.parse(readFileSync(join(out, 'report-receipt.json'), 'utf8')).header.signer.public_key;
  async function verify(out: string, root?: string): Promise<number> {
    return runTrustReport(['verify', out, ...(root ? ['--root', root] : [])], quiet().io, env, dir);
  }

  it('a claim paired with a command that exited 0 is SUPPORTED, and says what that does not show', async () => {
    expect(run('fake', started(0))).toBe(0);
    const { code, report } = await make(['--bind', 'fake=All tests pass']);
    expect(report.bound_claims[0]?.status).toBe('SUPPORTED');
    expect(report.bound_claims[0]?.why).toContain('not that it tests what the claim says');
    expect(code).toBe(0);
  });

  it('the last run decides: a pass followed by a failure is CONTRADICTED', async () => {
    run('fake', started(0));
    run('fake', started(1));
    const { code, report } = await make(['--bind', 'fake=All tests pass']);
    expect(report.bound_claims[0]?.status).toBe('CONTRADICTED');
    expect(code).toBe(1);
    expect(report.next_actions.join(' ')).toContain('Do not accept "All tests pass"');
  });

  it('a failure cannot be replaced by an easier run: different command lines decide nothing', async () => {
    run('fake', started(1));
    expect(runRun(['--tool', 'fake', '--', 'fake', '--select-nothing'], quiet().io, env, started(0))).toBe(0);
    const { code, report } = await make(['--bind', 'fake=All tests pass']);
    expect(report.bound_claims[0]?.status).toBe('NOT_CHECKED');
    expect(report.bound_claims[0]?.why).toContain('2 different command lines');
    expect(code).toBe(3);
  });

  it('a command that never ran, or could not start, is NOT_CHECKED and exits 3', async () => {
    run('fake', started(null, 'ENOENT'));
    const { code, report } = await make(['--bind', 'fake=It works', '--bind', 'other=It lints']);
    expect(report.guard.commands[0]?.result).toBe('could not start');
    expect(report.bound_claims.map((b) => b.status)).toEqual(['NOT_CHECKED', 'NOT_CHECKED']);
    expect(code).toBe(3);
  });

  it('a refused command is shown with its reason, never as run, and is not itself a failure', async () => {
    run('fake', started(0));
    expect(run('curl', started(0))).toBe(5);
    const { code, report } = await make(['--bind', 'fake=All tests pass']);
    const denied = report.guard.commands.filter((c) => c.decision === 'DENIED');
    expect(denied).toHaveLength(1);
    expect(denied[0]?.result).toBe('never started');
    expect(denied[0]?.reasons[0]).toContain('does not list tool:curl');
    expect(report.next_actions.join(' ')).toContain('guard allow tool:curl');
    expect(code).toBe(0);
  });

  it('every rendering states what it cannot see', async () => {
    run('fake', started(0));
    const { out, report } = await make(['--bind', 'fake=x']);
    expect(report.guard.not_mediated).toContain(NOT_MEDIATED_ALWAYS);
    expect(readFileSync(join(out, 'trust-report.md'), 'utf8')).toContain('This report cannot see them');
    expect(readFileSync(join(out, 'trust-report.html'), 'utf8')).toContain('This report cannot see them');
  });

  it('agent text cannot inject into the HTML or Markdown', () => {
    const evil = '<img src=x onerror=alert(1)> `code` **bold**';
    const rec = record([{ status: 'NOT_CHECKED', claim: evil }]);
    const report = buildTrustReport({ title: 'T', generatedAt: 'now', generator: 'g', binds: [], records: [{ path: 'r', text: JSON.stringify(rec) }], ledgerText: '', policyText: null });
    const html = renderTrustReportHtml(report);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script');
    expect(renderTrustReportMarkdown(report)).toContain('\\`code\\`');
  });

  it('an Inspect record that changed after it was made is a finding', () => {
    const rec = record([{ status: 'SUPPORTED', claim: 'x' }]);
    (rec.digest as { value: string }).value = 'f'.repeat(64);
    const report = buildTrustReport({ title: 'T', generatedAt: 'now', generator: 'g', binds: [], records: [{ path: 'r', text: JSON.stringify(rec) }], ledgerText: '', policyText: null });
    expect(report.inspect[0]?.digest_matches).toBe(false);
    expect(report.exit).toBe(1);
  });

  it('claims are carried with the run they came from, and a contradicted claim exits 1', async () => {
    run('fake', started(0));
    const file = join(dir, 'record.json');
    writeFileSync(file, JSON.stringify(record([{ status: 'CONTRADICTED', claim: 'it passed' }], 'failure', 'FAILED')));
    const { code, report } = await make(['--record', file]);
    expect(report.inspect[0]?.claims[0]?.status).toBe('CONTRADICTED');
    expect(report.next_actions.join(' ')).toContain('Do not accept "it passed"');
    expect(code).toBe(1);
  });

  it('refuses a file that is not an Inspect record, and writes over nothing', async () => {
    run('fake', started(0));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{"record":{"schema":"other"}}');
    const q = quiet();
    expect(await runTrustReport(['--out', join(dir, 'o1'), '--record', bad], q.io, env, dir)).toBe(3);
    const full = join(dir, 'full');
    cpSync(bad, join(full, 'x.json'), { recursive: true });
    expect(await runTrustReport(['--out', full], quiet().io, env, dir)).toBe(2);
    expect(readdirSync(full)).toEqual(['x.json']);
  });

  it('with nothing recorded there is nothing to report, not an empty pass', async () => {
    const q = quiet();
    const fresh = envOf({ TRUSTSHELL_HOME: join(dir, 'empty') });
    expect(await runTrustReport(['--out', join(dir, 'o2')], q.io, fresh, dir)).toBe(2);
    expect(q.lines.join(' ')).toContain('NOT_CHECKED');
  });

  describe('verify', () => {
    let out = '';
    let root = '';
    beforeEach(async () => {
      run('fake', started(0));
      run('curl', started(0));
      ({ out } = await make(['--bind', 'fake=All tests pass']));
      root = key(out);
    });

    it('is VERIFIED with the sealing key and NOT_CHECKED without one', async () => {
      expect(await verify(out, root)).toBe(0);
      expect(await verify(out)).toBe(2);
    });

    it('fails with another key', async () => {
      expect(await verify(out, `0x${'ab'.repeat(32)}`)).toBe(1);
    });

    it('a folder that is not a report is NOT_CHECKED', async () => {
      expect(await verify(join(dir, 'home'))).toBe(2);
    });

    it.each([
      ['report.json', (s: string) => s.replace('"SUPPORTED"', '"CONTRADICTED"')],
      ['trust-report.md', (s: string) => `${s}more\n`],
      ['trust-report.html', (s: string) => `${s}more\n`],
      ['evidence/guard-receipts.jsonl', (s: string) => s.replace('"DENIED"', '"ALLOWED"')],
      ['evidence/policy.json', (s: string) => s.replace('"subject"', '"subject" ')],
      ['report-receipt.json', (s: string) => s.replace('trust-report-', 'other-report-')],
    ])('fails when %s changes', async (file, edit) => {
      const p = join(out, file);
      const before = readFileSync(p, 'utf8');
      const after = edit(before);
      expect(after).not.toBe(before);
      writeFileSync(p, after);
      expect(await verify(out, root)).toBe(1);
    });

    it('fails when a file is added', async () => {
      writeFileSync(join(out, 'evidence', 'added.txt'), 'x');
      expect(await verify(out, root)).toBe(1);
    });

    /** Rewrites one line of the manifest so the file on disk matches it. */
    function rewriteManifestLine(folder: string, file: string, text: string): void {
      const m = join(folder, 'MANIFEST.sha256');
      const hash = createHash('sha256').update(text).digest('hex');
      const lines = readFileSync(m, 'utf8').split('\n').map((l) => (l.endsWith(`  ${file}`) ? `${hash}  ${file}` : l));
      writeFileSync(m, lines.join('\n'));
    }

    it('fails when a file outside the report text changes and the manifest is rewritten: the seal names the manifest', async () => {
      const file = join(dir, 'record.json');
      writeFileSync(file, JSON.stringify(record([{ status: 'SUPPORTED', claim: 'x' }])));
      writeFileSync(join(dir, 'card.md'), 'the card');
      const q = quiet();
      const second = join(dir, 'second');
      await runTrustReport(['--out', second, '--record', file], q.io, env, dir);
      const card = 'evidence/inspect-1/card.md';
      writeFileSync(join(second, card), 'a different card');
      rewriteManifestLine(second, card, 'a different card');
      expect(await verify(second, key(second))).toBe(1);
    });

    it('fails, even with a new seal from another key, when the report no longer matches its evidence', async () => {
      const text = readFileSync(join(out, 'report.json'), 'utf8').replace('"SUPPORTED"', '"CONTRADICTED"');
      writeFileSync(join(out, 'report.json'), text);
      rewriteManifestLine(out, 'report.json', text);
      const manifest = readFileSync(join(out, 'MANIFEST.sha256'), 'utf8');
      const { privateKey } = generateKeyPairSync('ed25519');
      const body = sealBody(createHash('sha256').update(manifest).digest('hex'), 'now');
      writeFileSync(join(out, 'report-receipt.json'), JSON.stringify(await signOwnerReceipt(body, privateKey)));
      expect(await verify(out)).toBe(1);
    });

    it('fails when a file is rewritten and the manifest is rewritten to match', async () => {
      const text = `${readFileSync(join(out, 'trust-report.md'), 'utf8')}forged\n`;
      writeFileSync(join(out, 'trust-report.md'), text);
      const m = join(out, 'MANIFEST.sha256');
      const hash = createHash('sha256').update(text).digest('hex');
      writeFileSync(m, readFileSync(m, 'utf8').replace(/^[0-9a-f]{64} {2}trust-report\.md$/m, `${hash}  trust-report.md`));
      expect(await verify(out, root)).toBe(1);
    });
  });
});
