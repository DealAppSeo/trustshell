/**
 * `trustshell report` reads an evidence FILE the operator supplies (Lane D red team, 2026-10-21):
 *  1. its owner, repo, sha and verdict reached the terminal raw: ESC[2J, colour and U+202E were replayed,
 *     including through the UNSUPPORTED reason line that quotes the verdict;
 *  2. a HAND-WRITTEN {"verdict":"COMPLETE"} file with an intact log said "the external run completed
 *     successfully", exit 0. Nothing shows the file came from `check`, so the wording now says what the
 *     FILE says, and a limit line names that its origin is not verified.
 * Every control is built from its code point, so this file holds none literally.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { nextEntry } from '../src/lib/inspect';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const ESC = c(0x1b);
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');
const SHA = 'a'.repeat(64);

describe('report: evidence-file text is scrubbed, and its origin is not overclaimed', () => {
  const prevCwd = process.cwd();
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-report-honesty-'));
    process.chdir(dir); // no .trustshell/profile.md here: the default (private) profile
    let log = '';
    for (const tool of ['read_file', 'bash']) log += JSON.stringify(nextEntry(log, { ts: '2026-10-21T10:00:00Z', tool, input_sha256: SHA, output_sha256: SHA })) + '\n';
    writeFileSync(join(dir, 'session.jsonl'), log);
  });
  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  async function report(evidence: unknown, ...flags: string[]): Promise<{ code: number; out: string }> {
    writeFileSync(join(dir, 'ev.json'), JSON.stringify(evidence));
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => out.push(s) };
    const code = await run(parseArgs(['report', '--session', join(dir, 'session.jsonl'), '--evidence', join(dir, 'ev.json'), ...flags]), {} as never, io);
    return { code, out: out.join('\n') };
  }

  it('owner, repo, sha and verdict from the file never reach stdout as controls', async () => {
    const hostile = {
      verdict: `COMPLETE`,
      owner: `${ESC}[2J${ESC}[31macme`,
      repo: `${c(0x202e)}never-ran${c(0x9b)}31m`,
      sha: `${ESC}[1m0123456789abcdef`,
    };
    for (const flags of [[], ['--json']]) {
      const r = await report(hostile, ...flags);
      expect(r.out).not.toMatch(CONTROL);
    }
    expect((await report(hostile)).out).toContain('acme/never-ran');
  });

  it('an unknown verdict quoted in the UNSUPPORTED reason is scrubbed too', async () => {
    const r = await report({ verdict: `${ESC}[2J${ESC}[32mALL CLEAR${c(0x202e)}` });
    expect(r.code).toBe(3);
    expect(r.out).toContain('UNSUPPORTED');
    expect(r.out).not.toMatch(CONTROL);
    expect(r.out).toContain('ALL CLEAR');
  });

  it('a hand-written COMPLETE file: the card says what the FILE says, and names that its origin is unverified', async () => {
    const r = await report({ verdict: 'COMPLETE', owner: 'acme', repo: 'never-ran', sha: '0123456789abcdef0123456789abcdef01234567' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('the evidence file says the external run completed successfully');
    expect(r.out).not.toMatch(/and the external run completed successfully/);
    expect(r.out).toContain('does not verify that the evidence file was produced by `check` or is unmodified');
  });

  it('genuine plain-ASCII evidence prints exactly the fields it holds', async () => {
    const r = await report({ verdict: 'COMPLETE', owner: 'DealAppSeo', repo: 'trustshell', sha: '392797a69b6a3e57406cef210a8471585667e3af' });
    expect(r.out).toContain('    COMPLETE  ·  DealAppSeo/trustshell  ·  392797a');
    expect(r.out).toContain(`    INTACT  ·  2 entries  ·  ${join(dir, 'session.jsonl')}`);
  });
});
