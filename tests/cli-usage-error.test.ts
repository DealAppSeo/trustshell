/**
 * A usage error must stay readable.
 *
 * `run` used to print `error: <what was wrong>` and then the whole help text (294 lines on 1.9.3).
 * The one line a first-time user needed, e.g. "unknown command: chekc", was the first of ~296 and
 * had scrolled off the terminal by the time the prompt came back. Now: the error, then one line
 * saying how to get the help. `help` itself still prints everything.
 */
import { parseArgs, run, EXIT, type CliIO } from '../src/cli/index';
import type { TrustShell } from '../src/lib/trustshell';

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const client = {} as unknown as TrustShell;

describe('a usage error is short enough to read', () => {
  it.each([
    [['chekc', 'https://github.com/o/r/actions/runs/1'], /unknown command: chekc/],
    [['check'], /requires/],
    [['check', 'https://github.com/o/r/actions/runs/1', '--claims'], /--claims requires a value/],
    [['verify', 'x', '--nope'], /unknown option/],
  ] as const)('%j', async (argv, what) => {
    const { io, out, err } = captureIO();
    const code = await run(parseArgs([...argv]), client, io);
    expect(code).toBe(EXIT.USAGE);
    expect(out).toEqual([]);
    const lines = err.join('\n').split('\n').filter((l) => l.trim());
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[0]).toMatch(/^error: /);
    expect(lines[0]).toMatch(what);
    expect(lines[lines.length - 1]).toMatch(/\bhelp\b/); // says where the full list is
  });

  it('the pointer is a command the reader can run: npx form when started through npx', async () => {
    const before = process.env['npm_command'];
    process.env['npm_command'] = 'exec';
    try {
      const { io, err } = captureIO();
      await run(parseArgs(['frobnicate']), client, io);
      expect(err.join('\n')).toMatch(/npx(\.cmd)? -y @hyperdag\/trustshell@\S+ help/);
    } finally {
      if (before === undefined) delete process.env['npm_command'];
      else process.env['npm_command'] = before;
    }
  });

  it('help itself still prints the full text, on stdout, exit 0', async () => {
    const { io, out, err } = captureIO();
    expect(await run(parseArgs(['help']), client, io)).toBe(EXIT.OK);
    expect(out.join('\n')).toMatch(/USAGE/);
    expect(out.join('\n').split('\n').length).toBeGreaterThan(100);
    expect(err).toEqual([]);
  });
});
