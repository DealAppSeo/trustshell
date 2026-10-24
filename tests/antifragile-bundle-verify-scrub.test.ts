/**
 * Antifragile night, lane A (2026-10-24). A SIBLING of a defect already fixed three times: `inspect`, `report` and
 * `bundle context` were each changed to stop replaying terminal control bytes (RC_ATTACK 2026-10-21, Lane D), but
 * `bundle verify` (and `bundle export`, which prints the same summary) printed a carried evidence NAME raw. A bundle
 * signed by a key the reader trusted with --signer could therefore clear the screen and print its own all-clear line
 * above the summary. Found by reading cli/bundle.ts summaryLines; corpus fixture af-review-bundle-verify-evidence-name-escape.
 * The fix is at the one print site every verb shares, so verify and export are both covered.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { buildBundle } from '../src/lib/bundle';
import { signingKey } from '../src/lib/install-key';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');
const ESC = c(0x1b);
const RLO = c(0x202e);
const HOSTILE = `build.log${ESC}[2J${ESC}[1;1H${ESC}[32mALL CLEAR${RLO}`;

describe('antifragile: bundle verify never replays a carried evidence name to the terminal', () => {
  const prevEnv = { ...process.env };
  const prevCwd = process.cwd();
  let root = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const home = () => join(root, 'home');
  const text = () => `${out.join('\n')}\n${err.join('\n')}`;
  async function cli(...argv: string[]): Promise<number> {
    out = [];
    err = [];
    return run(parseArgs(argv), {} as never, io);
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-antifragile-'));
    mkdirSync(join(root, 'work'), { recursive: true });
    process.chdir(join(root, 'work'));
    process.env.TRUSTSHELL_HOME = home();
    process.env.TRUSTSHELL_MEMORY = join(home(), 'memory.sqlite');
  });
  afterEach(() => {
    process.chdir(prevCwd);
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  function hostileBundle(): string {
    const k = signingKey(home());
    const b = buildBundle({ profile: null, policy: null, memories: [], evidence: [{ kind: 'file', name: HOSTILE, sha256: 'a'.repeat(64) }] }, k.key, k.signer, '1.9.0-dev.0', '2026-10-24T00:00:00.000Z');
    const f = join(root, 'work', 'evil.bundle.json');
    writeFileSync(f, JSON.stringify(b, null, 2) + '\n');
    return f;
  }

  it('control: the hostile name really is in the signed bundle, and the bundle verifies', async () => {
    const f = hostileBundle();
    expect(await cli('bundle', 'verify', f)).toBe(0);
    expect(text()).toMatch(/VERIFIED signature good/);
  });

  it('bundle verify prints the name as text: no control or bidi byte reaches the terminal', async () => {
    const f = hostileBundle();
    expect(await cli('bundle', 'verify', f)).toBe(0);
    expect(text()).not.toMatch(CONTROL);
    expect(text()).toMatch(/build\.log/); // still shown, so the reader can tell what the pointer names
  });

  it('bundle verify --json is untouched: JSON escapes the bytes itself', async () => {
    const f = hostileBundle();
    expect(await cli('bundle', 'verify', f, '--json')).toBe(0);
    expect(text()).not.toMatch(CONTROL);
  });
});
