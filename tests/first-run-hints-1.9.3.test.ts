/**
 * Three first-run defects from the 1.9.1 stranger walk (E:\dev\reports\2026-11-09\beta\FIRST_USER_VERIFICATION.md),
 * still open on 1.9.2 when re-tested 2026-11-13, fixed in 1.9.3:
 *   #2  a hint said `trustshell …`, which an npx-only user does not have on PATH;
 *   #3  `demo` printed two different hex values both called "key", and the first one fails as --root;
 *   (new) `check <url> --claims The check workflow…` with the quotes lost checked only "The".
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { selfCommand } from '../src/lib/version';
import type { TrustShell } from '../src/lib/trustshell';

const NO_CLIENT = {} as TrustShell;
const RUN = 'https://github.com/DealAppSeo/trustshell/actions/runs/39619591025';

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('selfCommand: the command a hint tells the user to type (#2)', () => {
  it('names the npx form, pinned to the running version, when started through npx', () => {
    expect(selfCommand('1.9.3', { npm_command: 'exec' }, 'linux')).toBe('npx -y @hyperdag/trustshell@1.9.3');
  });
  it('says npx.cmd on Windows, which PowerShell runs even when scripts are disabled', () => {
    expect(selfCommand('1.9.3', { npm_command: 'exec' }, 'win32')).toBe('npx.cmd -y @hyperdag/trustshell@1.9.3');
  });
  it('says trustshell for an installed copy, and never pins an unknown version', () => {
    expect(selfCommand('1.9.3', {}, 'win32')).toBe('trustshell');
    expect(selfCommand('unknown', { npm_command: 'exec' }, 'linux')).toBe('trustshell');
  });
});

describe('check <url> --claims with the quotes lost', () => {
  it('refuses stray words after the URL and says to quote the claim', () => {
    const p = parseArgs(['check', RUN, '--claims', 'The', 'check', 'workflow', 'succeeded']);
    expect(p.error).toMatch(/unexpected argument: check/);
    expect(p.error).toMatch(/--claims got "The" and 3 more word\(s\)/);
    expect(p.error).toMatch(/quotes/);
  });
  it('still accepts the quoted form', () => {
    const p = parseArgs(['check', RUN, '--claims', 'The check workflow succeeded, run 39619591025.']);
    expect(p.error).toBeUndefined();
    expect(p).toMatchObject({ command: 'check', operand: RUN, claims: 'The check workflow succeeded, run 39619591025.' });
  });
});

describe('demo labels the fingerprint apart from the --root key (#3)', () => {
  let home = '';
  let prevHome: string | undefined;
  let prevCmd: string | undefined;
  beforeEach(() => {
    prevHome = process.env.TRUSTSHELL_HOME;
    prevCmd = process.env.npm_command;
    home = mkdtempSync(join(tmpdir(), 'tl-hints-home-'));
    process.env.TRUSTSHELL_HOME = home;
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.TRUSTSHELL_HOME;
    else process.env.TRUSTSHELL_HOME = prevHome;
    if (prevCmd === undefined) delete process.env.npm_command;
    else process.env.npm_command = prevCmd;
    rmSync(home, { recursive: true, force: true });
  });

  it('calls the first hex a sha256 fingerprint, and the --root value differs from it', async () => {
    delete process.env.npm_command;
    const c = captureIO();
    expect(await run(parseArgs(['demo']), NO_CLIENT, c.io)).toBe(EXIT.OK);
    const text = c.out.join('\n');
    const fp = /pinned key with sha256 fingerprint (0x[0-9a-f]{64}) \(--root takes the key, not this fingerprint\)/.exec(text);
    const root = /verify-receipt r\.json --root (0x[0-9a-f]{64})/.exec(text);
    expect(fp).not.toBeNull();
    expect(root).not.toBeNull();
    expect(fp![1]).not.toBe(root![1]);
    expect(text).toMatch(/^ {2}trustshell verify-receipt r\.json --root /m);
  });

  it('prints the npx form in its hints when started through npx', async () => {
    process.env.npm_command = 'exec';
    const c = captureIO();
    expect(await run(parseArgs(['demo']), NO_CLIENT, c.io)).toBe(EXIT.OK);
    expect(c.out.join('\n')).toMatch(/^ {2}npx(\.cmd)? -y @hyperdag\/trustshell@\S+ verify-receipt r\.json --root 0x/m);
  });
});
