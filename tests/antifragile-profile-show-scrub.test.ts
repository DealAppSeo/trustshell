/**
 * Antifragile night, lane A, cycle 2 (2026-10-24). `profile show` prints profile.md verbatim, and the "problem:" lines
 * echo the bad value from the file ("unknown value \"<the value>\""). A profile a trusted bundle signer wrote into
 * profile.md (bundle import) therefore reached the owner's terminal raw, while `bundle context` scrubs the same text.
 * Corpus fixture af-review-profile-show-escape.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');
const HOSTILE = `ops${c(0x1b)}[2J${c(0x1b)}[32mALL CLEAR${c(0x202e)}`;

describe('antifragile: profile show prints the profile as text', () => {
  const prevEnv = { ...process.env };
  const prevCwd = process.cwd();
  let root = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const text = () => `${out.join('\n')}\n${err.join('\n')}`;
  async function cli(...argv: string[]): Promise<number> {
    out = [];
    err = [];
    return run(parseArgs(argv), {} as never, io);
  }
  const profile = (body: string) => {
    mkdirSync(join(root, 'work', '.trustshell'), { recursive: true });
    writeFileSync(join(root, 'work', '.trustshell', 'profile.md'), body);
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-antifragile-'));
    mkdirSync(join(root, 'work'), { recursive: true });
    process.chdir(join(root, 'work'));
    process.env.TRUSTSHELL_HOME = join(root, 'home');
    process.env.TRUSTSHELL_MEMORY = join(root, 'home', 'memory.sqlite');
  });
  afterEach(() => {
    process.chdir(prevCwd);
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it('control: a plain profile is shown unchanged, newlines and all', async () => {
    const body = '---\ntrustshell_profile: 1\n---\n\n# Identity\nA person who likes tea.\n';
    profile(body);
    expect(await cli('profile', 'show')).toBe(0);
    expect(out.join('\n')).toContain('A person who likes tea.');
    expect(out.join('\n').split('\n').length).toBeGreaterThan(3);
  });

  it('a hostile line in the profile body is shown with no control or bidi byte', async () => {
    profile(`---\ntrustshell_profile: 1\n---\n\n# Identity\n${HOSTILE}\n`);
    expect(await cli('profile', 'show')).toBe(0);
    expect(out.join('\n')).toMatch(/Identity\nops/); // still there, as text
    expect(text()).not.toMatch(CONTROL);
  });

  it('the "problem:" lines do not replay the bad value the file held', async () => {
    profile(`---\ntrustshell_profile: 1\n---\n\n# Trust settings\nautonomy: ${HOSTILE}\n`);
    expect(await cli('profile', 'show')).toBe(0);
    expect(text()).toMatch(/problem: autonomy: unknown value/); // control
    expect(text()).not.toMatch(CONTROL);
  });

  it('an edit that is refused because of problems does not replay them either', async () => {
    profile(`---\ntrustshell_profile: ${HOSTILE}\n---\n`);
    expect(await cli('profile', 'add', 'values', 'be kind')).toBe(1);
    expect(text()).toMatch(/has problems/); // control
    expect(text()).not.toMatch(CONTROL);
  });
});
