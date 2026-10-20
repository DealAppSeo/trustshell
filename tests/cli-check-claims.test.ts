/**
 * `trustshell check <runUrl> --claims <file|text>` through the CLI: routing, the file-or-text rule,
 * exit codes, --json, --out, and OFFLINE=1. GitHub responses are the recorded fixtures; nothing
 * leaves the machine.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, readClaimsFile, EXIT, type CliIO } from '../src/cli/index';
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

  it('refuses --out or --demo without --claims or --claims-file', () => {
    expect(parseArgs(['check', URL_GREEN, '--out', 'd']).error).toMatch(/only with --claims/);
    expect(parseArgs(['check', URL_GREEN, '--demo']).error).toMatch(/only with --claims/);
  });

  it('routes --claims-file, and refuses both flags at once', () => {
    expect(parseArgs(['check', URL_GREEN, '--claims-file', 'pr.md'])).toMatchObject({ command: 'check', claimsFile: 'pr.md' });
    expect(parseArgs(['check', URL_GREEN, '--claims', 'x', '--claims-file', 'pr.md']).error).toMatch(/not both/);
  });

  it('leaves the plain URL form exactly as it was', () => {
    const p = parseArgs(['check', URL_GREEN]);
    expect(p).toEqual({ command: 'check', operand: URL_GREEN, json: false, verify: false, markdown: false });
  });

  it('documents the flag in --help', async () => {
    const { io, out } = captureIO();
    await run(parseArgs(['--help']), NO_CLIENT, io);
    expect(out.join(' ')).toContain('check <runUrl> --claims "<text>"');
    expect(out.join(' ')).toContain('check <runUrl> --claims-file <path>');
  });
});

describe('readClaimsFile', () => {
  it('reads an existing file', () => {
    const f = join(tmp, 'pr.md');
    writeFileSync(f, 'All tests pass.');
    expect(readClaimsFile(f)).toBe('All tests pass.');
  });

  it('refuses a missing file (spaces in the name included) and an oversized one', () => {
    expect(() => readClaimsFile(join(tmp, 'pr body.md'))).toThrow(/no such file/);
    const big = join(tmp, 'big.md');
    writeFileSync(big, 'x'.repeat(300 * 1024));
    expect(() => readClaimsFile(big)).toThrow(/limit/);
  });
});

describe('XC1 S2: --claims is text, even when the text is the path of a real file', () => {
  it('does not read the file a path names', async () => {
    const secret = join(tmp, '.env');
    writeFileSync(secret, 'DATABASE_URL=postgres://u:hunter2@db.internal/prod');
    replay(GREEN);
    const { io, out } = captureIO();
    await run(parseArgs(['check', URL_GREEN, '--claims', secret, '--json']), NO_CLIENT, io);
    const printed = out.join(' ');
    expect(printed).not.toContain('hunter2');
    expect(printed).not.toContain('db.internal');
  });

  it('XC1 N10: --json escapes C1 controls, bidi and invisible characters from a workflow name, and the digest still matches', async () => {
    const fx = JSON.parse(JSON.stringify(GREEN));
    const runPath = Object.keys(fx.responses)[0] as string;
    const C = (...c: number[]) => String.fromCodePoint(...c);
    fx.responses[runPath].body.name = 'check' + C(0x9b) + '2J' + C(0x9d) + '52;x' + C(0x9c) + C(0x202e) + 'evil' + C(0x200b);
    replay(fx);
    const { io, out } = captureIO();
    await run(parseArgs(['check', URL_GREEN, '--claims', 'x', '--json']), NO_CLIENT, io);
    const printed = out.join(' ');
    for (const ch of printed) {
      const cp = ch.codePointAt(0) as number;
      expect((cp >= 0x7f && cp <= 0x9f) || cp === 0x202e || cp === 0x200b).toBe(false);
    }
    const doc = JSON.parse(printed) as { record: ActionEvidenceRecord; digest: { value: string } };
    expect(doc.record.observation.workflow.name).toContain(C(0x202e));
    expect(doc.digest.value).toBe(digestRecord(doc.record).value);
  });

  it('an empty --claims is a usage error, and GitHub is not asked', async () => {
    const calls = replay(GREEN);
    const { io } = captureIO();
    expect(await run(parseArgs(['check', URL_GREEN, '--claims', '  ']), NO_CLIENT, io)).toBe(EXIT.USAGE);
    expect(calls).toEqual([]);
  });
});

describe('run()', () => {
  it('prints the Markdown card and exits 0 when every claim is supported', async () => {
    replay(GREEN);
    const { io, out } = captureIO();
    const code = await run(parseArgs(['check', URL_GREEN, '--claims-file', join(FX, 'claims', 'narrow-true.txt')]), NO_CLIENT, io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('4 supported · 0 contradicted · 0 not checked');
    expect(out.join('\n')).toContain('Cryptographic integrity: not checked.');
  });

  it('--json prints the record and a digest that matches it', async () => {
    replay(GREEN);
    const { io, out } = captureIO();
    const code = await run(parseArgs(['check', URL_GREEN, '--claims', ['Fixed in a1b2c3d4.', 'CI is green.'].join(String.fromCharCode(10, 10)), '--json']), NO_CLIENT, io);
    expect(code).toBe(1);
    const doc = JSON.parse(out.join('\n')) as { record: ActionEvidenceRecord; digest: { value: string } };
    expect(doc.record.schema).toBe('dev.trustshell.action-evidence/0.1-draft');
    expect(doc.digest.value).toBe(digestRecord(doc.record).value);
  });

  it('exits 3 when anything is NOT_CHECKED', async () => {
    replay(GREEN);
    const { io } = captureIO();
    expect(await run(parseArgs(['check', URL_GREEN, '--claims-file', join(FX, 'claims', 'overclaiming-pr.md')]), NO_CLIENT, io)).toBe(3);
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
    expect(await run(parseArgs(['check', URL_GREEN, '--claims-file', join(tmp, 'nope.md')]), NO_CLIENT, io)).toBe(EXIT.USAGE);
    expect(err.join('\n')).toMatch(/no such file/);
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
