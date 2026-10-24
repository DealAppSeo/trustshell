/**
 * Antifragile night, lane A, cycle 2 (2026-10-24). `bundle verify` and `bundle import` check a file's SHAPE before they
 * check any signature, and the REFUSED message echoed what the file said: an unknown field name, a bad `schema` value.
 * So an UNSIGNED file from anyone -- the thing `verify` exists to vet -- could send terminal escapes (clear the screen,
 * print its own line, reorder text with a bidi override) to whoever ran it. No trusted signer was needed, unlike the
 * evidence-name case fixed in the cycle before. Corpus fixture af-review-bundle-verify-unsigned-key-escape.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');
const HOSTILE = `k${c(0x1b)}[2J${c(0x1b)}[31mFAKE${c(0x202e)}`;

describe('antifragile: a REFUSED bundle message never replays what an unsigned file said', () => {
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

  const file = (name: string, body: unknown) => {
    const f = join(root, 'work', name);
    writeFileSync(f, JSON.stringify(body));
    return f;
  };

  it.each([['verify'], ['import']])('bundle %s: an unknown top-level field name is shown as text, not replayed', async (verb) => {
    const f = file('b.json', { schema: 'trustshell.bundle/2', [HOSTILE]: 1 });
    expect(await cli('bundle', verb, f)).toBe(1);
    expect(text()).toMatch(/not well formed/); // control: it is the shape refusal, and it still says what was wrong
    expect(text()).not.toMatch(CONTROL);
  });

  it('an unknown payload field name is scrubbed too', async () => {
    const f = file('b.json', {
      schema: 'trustshell.bundle/2',
      created_at: 'x',
      signature: 'x',
      author: { alg: 'ed25519', public_key: 'a', fingerprint: 'b' },
      tool: { name: 'x', version: '1' },
      payload: { profile: null, policy: null, memories: [], evidence: [], [HOSTILE]: 1 },
    });
    expect(await cli('bundle', 'verify', f)).toBe(1);
    expect(text()).toMatch(/not well formed/);
    expect(text()).not.toMatch(CONTROL);
  });

  it('a bad schema value is scrubbed (JSON.stringify escapes ESC but not a bidi override)', async () => {
    const f = file('b.json', { schema: HOSTILE });
    expect(await cli('bundle', 'verify', f)).toBe(1);
    expect(text()).toMatch(/REFUSED the bundle is/);
    expect(text()).not.toMatch(CONTROL);
  });
});
