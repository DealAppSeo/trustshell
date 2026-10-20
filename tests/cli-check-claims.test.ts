/**
 * `trustshell check <runUrl> --claims <file|text>` through the CLI: routing, the file-or-text rule,
 * exit codes, --json, --out, and OFFLINE=1. GitHub responses are the recorded fixtures; nothing
 * leaves the machine.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, readClaimsInput, EXIT, type CliIO } from '../src/cli/index';
import { digestRecord, type ActionEvidenceRecord } from '../src/lib/action-evidence';
import type { TrustShell } from '../src/lib/trustshell';

const FX = join(__dirname, 'fixtures', 'action-evidence');
const GREEN = JSON.parse(readFileSync(join(FX, 'green-run.json'), 'utf8'));
const URL_GREEN: string = GREEN.run_url;
const NO_CLIENT = {} as unknown as TrustShell;

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function replay(fx: any) {
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const r = fx.responses[u.pathname + u.search];
    if (!r || u.host !== 'api.github.com') throw new Error(`unrecorded: ${url}`);
    return { ok: r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return calls;
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ts-claims-'));
});
afterEach(() => {
  delete (globalThis as any).fetch;
  delete process.env.OFFLINE;
  rmSync(tmp, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('routes check <url> --claims to the claims path', () => {
    expect(parseArgs(['check', URL_GREEN, '--claims', 'tests pass'])).toMatchObject({ command: 'check', operand: URL_GREEN, claims: 'tests pass', demo: false });
    expect(parseArgs(['check', URL_GREEN, '--claims', 'x', '--out', 'dir', '--demo', '--json'])).toMatchObject({ claims: 'x', out: 'dir', demo: true, json: true });
  });

  it('accepts claim text that starts with a dash (a list item)', () => {
    expect(parseArgs(['check', URL_GREEN, '--claims', '- tests pass']).claims).toBe('- tests pass');
  });

  it('refuses --claims on the sentence form rather than dropping it', () => {
    expect(parseArgs(['check', 'the sky is green', '--claims', 'x']).error).toMatch(/run URL/);
  });

  it('refuses --out or --demo without --claims', () => {
    expect(parseArgs(['check', URL_GREEN, '--out', 'd']).error).toMatch(/only with --claims/);
    expect(parseArgs(['check', URL_GREEN, '--demo']).error).toMatch(/only with --claims/);
  });

  it('leaves the plain URL form exactly as it was', () => {
    const p = parseArgs(['check', URL_GREEN]);
    expect(p).toEqual({ command: 'check', operand: URL_GREEN, json: false, verify: false, markdown: false });
  });

  it('documents the flag in --help', async () => {
    const { io, out } = captureIO();
    await run(parseArgs(['--help']), NO_CLIENT, io);
    expect(out.join(' ')).toContain('check <runUrl> --claims <file|text>');
  });
});

describe('readClaimsInput', () => {
  it('reads an existing file', () => {
    const f = join(tmp, 'pr.md');
    writeFileSync(f, 'All tests pass.');
    expect(readClaimsInput(f)).toEqual({ text: 'All tests pass.', from: 'file' });
  });

  it('treats anything else as the text itself', () => {
    expect(readClaimsInput('All tests pass on 5cd68edc.')).toEqual({ text: 'All tests pass on 5cd68edc.', from: 'text' });
  });

  it('refuses a file name that does not exist, instead of mapping the name as a claim', () => {
    expect(() => readClaimsInput(join(tmp, 'pr-descripton.md'))).toThrow(/does not exist/);
    expect(() => readClaimsInput('notes.txt')).toThrow(/does not exist/);
  });

  it('refuses an empty value and an oversized file', () => {
    expect(() => readClaimsInput('  ')).toThrow(/empty/);
    const big = join(tmp, 'big.md');
    writeFileSync(big, 'x'.repeat(300 * 1024));
    expect(() => readClaimsInput(big)).toThrow(/limit/);
  });
});

describe('run()', () => {
  it('prints the Markdown card and exits 0 when every claim is supported', async () => {
    replay(GREEN);
    const { io, out } = captureIO();
    const code = await run(parseArgs(['check', URL_GREEN, '--claims', join(FX, 'claims', 'narrow-true.txt')]), NO_CLIENT, io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('4 supported · 0 contradicted · 0 not checked');
    expect(out.join('\n')).toContain('Cryptographic integrity: not checked.');
  });

  it('--json prints the record and a digest that matches it', async () => {
    replay(GREEN);
    const { io, out } = captureIO();
    const code = await run(parseArgs(['check', URL_GREEN, '--claims', 'Fixed in a1b2c3d4. CI is green.', '--json']), NO_CLIENT, io);
    expect(code).toBe(1);
    const doc = JSON.parse(out.join('\n')) as { record: ActionEvidenceRecord; digest: { value: string } };
    expect(doc.record.schema).toBe('dev.trustshell.action-evidence/0.1-draft');
    expect(doc.digest.value).toBe(digestRecord(doc.record).value);
  });

  it('exits 3 when anything is NOT_CHECKED', async () => {
    replay(GREEN);
    const { io } = captureIO();
    expect(await run(parseArgs(['check', URL_GREEN, '--claims', join(FX, 'claims', 'overclaiming-pr.md')]), NO_CLIENT, io)).toBe(3);
  });

  it('--out writes record.json, card.md and card.html, all from the same record', async () => {
    replay(GREEN);
    const { io, err } = captureIO();
    const dir = join(tmp, 'out');
    await run(parseArgs(['check', URL_GREEN, '--claims', 'All tests pass.', '--out', dir, '--demo']), NO_CLIENT, io);
    const doc = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
    const md = readFileSync(join(dir, 'card.md'), 'utf8');
    const html = readFileSync(join(dir, 'card.html'), 'utf8');
    expect(doc.digest.value).toBe(digestRecord(doc.record).value);
    expect(md).toContain(doc.digest.value);
    expect(html).toContain(doc.digest.value);
    expect(md).toContain('DEMO');
    expect(err.join('\n')).toContain('wrote record.json, card.md and card.html');
  });

  it('a missing claims file is a usage error, and GitHub is not asked', async () => {
    const calls = replay(GREEN);
    const { io, err } = captureIO();
    expect(await run(parseArgs(['check', URL_GREEN, '--claims', join(tmp, 'nope.md')]), NO_CLIENT, io)).toBe(EXIT.USAGE);
    expect(err.join('\n')).toMatch(/does not exist/);
    expect(calls).toEqual([]);
  });

  it('OFFLINE=1 asks nobody and does not exit 0', async () => {
    const calls = replay(GREEN);
    process.env.OFFLINE = '1';
    const { io, out } = captureIO();
    const code = await run(parseArgs(['check', URL_GREEN, '--claims', 'All tests pass.']), NO_CLIENT, io);
    expect(code).not.toBe(0);
    expect(out.join('\n')).toMatch(/NOT_CHECKED/);
    expect(calls).toEqual([]);
  });
});
