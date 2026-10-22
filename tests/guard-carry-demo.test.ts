/**
 * The Guard + Carry demo (demo/guard-carry/run.mjs), run the way docs/guard-carry-demo.md tells a stranger to
 * run it, through the committed dist/ CLI in child processes.
 *
 * WHY THIS IS A TEST AND NOT ONLY A SCRIPT. The demo prints what the owner policy does and does not authorize,
 * and each line is backed by something it just did (an MCP call that got through, a delete started without
 * trustshell, a policy widened with no key). If one stops being true, the demo exits 1 and this fails, so the
 * sentence is changed together with the behaviour. The same goes for the doc: its expected output is compared
 * with the real one, keys, hashes and the expiry date aside.
 *
 * NOT CHECKED here: SDK calls (code importing the package) are outside the guard too, per `guard show`; the demo
 * does not exercise them.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const DEMO = join(ROOT, 'demo', 'guard-carry', 'run.mjs');
const LINES = [
  'owner-signed',
  'mediated paths only',
  'not mediated',
  'signed, not encrypted',
  'a declaration is not authorization',
  'whoever runs the CLI as the owner can change the policy',
  'no network',
];

/** What differs from run to run: keys, hashes and the policy's expiry. Nothing else may. */
const normalize = (s: string) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/[0-9a-f]{12,64}/g, '<hex>')
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>')
    .trimEnd();

describe('the Guard + Carry demo, two hosts', () => {
  jest.setTimeout(300000);
  let run: { status: number | null; out: string; err: string };

  beforeAll(() => {
    const r = spawnSync(process.execPath, [DEMO], { cwd: ROOT, encoding: 'utf8', timeout: 290000 });
    run = { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
  });

  it('exits 0: every step and every line about authority and limits held', () => {
    expect({ status: run.status, tail: run.out.split('\n').slice(-12).join('\n'), err: run.err }).toMatchObject({ status: 0 });
    expect(run.out).toMatch(/^RESULT {2}steps 1-6 held; 7 of 7 lines above held$/m);
  });

  it.each(LINES)('states and exercises "%s"', (id) => {
    expect(run.out).toMatch(new RegExp(`^HELD {2}${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `, 'm'));
  });

  it('prints exactly the output docs/guard-carry-demo.md promises (else re-run the demo and paste it in)', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'guard-carry-demo.md'), 'utf8').replace(/\r\n/g, '\n');
    const block = doc.match(/<!-- demo-output:start -->\n```text\n([\s\S]*?)\n```\n<!-- demo-output:end -->/);
    expect(block).not.toBeNull();
    expect(normalize(run.out)).toBe(normalize(block![1]!));
  });

  it('a missing CLI is NOT_CHECKED (exit 2), never the exit code of success', () => {
    const r = spawnSync(process.execPath, [DEMO, '--cli', join(ROOT, 'no-such-dir', 'index.js')], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/^NOT_CHECKED no trustshell CLI/);
  });
});
