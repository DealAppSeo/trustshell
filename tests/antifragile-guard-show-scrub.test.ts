/**
 * Antifragile night, lane A, cycle 2 (2026-10-24). `guard show` printed text from policy.json raw: the `subject` of a
 * policy that parses (one a trusted bundle signer wrote and the owner imported), and the parser's problems for a policy
 * that does not (`unknown field "<the file's own key>"`). Both reach the owner's terminal as the file wrote them.
 * Corpus fixtures af-review-guard-show-subject-escape and af-review-guard-show-invalid-policy-key-escape.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { POLICY_FILE } from '../src/lib/guardrails';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');
const HOSTILE = `ops${c(0x1b)}[2J${c(0x1b)}[32mALL CLEAR${c(0x202e)}`;

describe('antifragile: guard show prints a policy file\'s text as text', () => {
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
    mkdirSync(home(), { recursive: true });
    process.chdir(join(root, 'work'));
    process.env.TRUSTSHELL_HOME = home();
    process.env.TRUSTSHELL_MEMORY = join(home(), 'memory.sqlite');
  });
  afterEach(() => {
    process.chdir(prevCwd);
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  const policy = (extra: Record<string, unknown> = {}, subject = 's') =>
    JSON.stringify({ policy: { subject, actions: ['tool:inspect'], per_tx_raw: '0', daily_raw: '0', total_raw: '0', expires_at: 4102444800, nonce: '1', ...extra }, signature: null });

  it('a hostile subject is shown, with no control or bidi byte', async () => {
    writeFileSync(join(home(), POLICY_FILE), policy({}, HOSTILE));
    expect(await cli('guard', 'show')).toBe(0);
    expect(text()).toMatch(/subject\s+ops/); // control: the subject line is there
    expect(text()).not.toMatch(CONTROL);
  });

  it('a policy that does not parse: the problem lines do not replay the file\'s own key text', async () => {
    writeFileSync(join(home(), POLICY_FILE), policy({ [HOSTILE]: 1 }));
    expect(await cli('guard', 'show')).toBe(1);
    expect(text()).toMatch(/does not parse/); // control
    expect(text()).toMatch(/unknown field/);
    expect(text()).not.toMatch(CONTROL);
  });

  it('bundle export refuses a policy that does not parse without replaying it either', async () => {
    writeFileSync(join(home(), POLICY_FILE), policy({ [HOSTILE]: 1 }));
    expect(await cli('bundle', 'export', join(root, 'work', 'out.json'))).toBe(1);
    expect(text()).toMatch(/does not parse/);
    expect(text()).not.toMatch(CONTROL);
  });

  it('guard show --json is untouched', async () => {
    writeFileSync(join(home(), POLICY_FILE), policy({}, 'plain-subject'));
    expect(await cli('guard', 'show', '--json')).toBe(0);
    expect(JSON.parse(out.join('\n')).policy.subject).toBe('plain-subject');
  });
});
