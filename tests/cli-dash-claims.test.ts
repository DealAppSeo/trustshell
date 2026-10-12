/**
 * A claim that starts with a dash is a claim, not an option.
 *
 * Before: `trustshell check "-5 is less than 3."` answered `error: unknown option: -5 is less than 3.` and
 * printed the help, exit 2, and there was NO way to check such a sentence: `--` was itself an unknown option.
 * That is a usability hole on the stranger's first path (a negative number is an ordinary thing to check),
 * and it failed in the safe-looking direction: exit 2 reads as a usage slip, not as "this CLI cannot check
 * negative numbers".
 *
 * Now: (1) a bare `--` ends options, as everywhere else; (2) an argument is only treated as an option when
 * it is option-shaped (`-x`, `--long-name`, `--name=value`), so text that merely starts with a dash is text.
 * A real typo (`--jsno`) must STILL fail loudly rather than be sent as a claim. NO network.
 */
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';

const CLAIM = '-5 is less than 3.';

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('parseArgs: text that starts with a dash is text', () => {
  it('check "-5 is less than 3." (one quoted argument) is a claim', () => {
    const a = parseArgs(['check', CLAIM]);
    expect(a.error).toBeUndefined();
    expect(a.command).toBe('check');
    expect(a.operand).toBe(CLAIM);
  });

  it('check -- "-5 is less than 3." is a claim', () => {
    const a = parseArgs(['check', '--', CLAIM]);
    expect(a.error).toBeUndefined();
    expect(a.command).toBe('check');
    expect(a.operand).toBe(CLAIM);
  });

  it('an unquoted claim whose first word is a number is joined whole', () => {
    const a = parseArgs(['check', '-5', 'is', 'less', 'than', '3.']);
    expect(a.error).toBeUndefined();
    expect(a.operand).toBe(CLAIM);
  });

  it('after -- every argument is text, even one that looks like a known flag', () => {
    const a = parseArgs(['check', '--', '--json', 'is', 'a', 'flag']);
    expect(a.error).toBeUndefined();
    expect(a.json).toBe(false);
    expect(a.operand).toBe('--json is a flag');
    const h = parseArgs(['check', '--', '-h']);
    expect(h.command).toBe('check');
    expect(h.operand).toBe('-h');
  });

  it('flags BEFORE -- still count, and -- may come first', () => {
    const a = parseArgs(['check', '--json', '--', CLAIM]);
    expect(a.json).toBe(true);
    expect(a.operand).toBe(CLAIM);
    const b = parseArgs(['--', 'check', CLAIM]);
    expect(b.error).toBeUndefined();
    expect(b.command).toBe('check');
    expect(b.operand).toBe(CLAIM);
  });

  it('verify and remember take dash-led text the same way', () => {
    expect(parseArgs(['verify', '-1 is negative']).error).toBeUndefined();
    expect(parseArgs(['verify', '-1 is negative']).operand).toBe('-1 is negative');
    expect(parseArgs(['verify', '--', '--not a flag']).operand).toBe('--not a flag');
    expect(parseArgs(['remember', 'note', '-5 is less than 3']).error).toBeUndefined();
  });

  it('a sentence that starts with two dashes and has a space is text', () => {
    const a = parseArgs(['check', '--force is a word people use']);
    expect(a.error).toBeUndefined();
    expect(a.operand).toBe('--force is a word people use');
  });

  it('a lone dash and a bare negative number are not options', () => {
    expect(parseArgs(['check', '-']).error).toBeUndefined();
    expect(parseArgs(['check', '-5']).operand).toBe('-5');
  });
});

describe('parseArgs: a mistyped option still fails loudly', () => {
  it.each([['--jsno'], ['--nope'], ['-x'], ['--json=1'], ['--Force'], ['-abc']])('%s', (opt) => {
    const a = parseArgs(['check', opt, 'x']);
    expect(a.error).toMatch(/unknown option/);
    expect(a.command).toBe('help');
  });

  it('a typo is NOT sent as a claim: it stops before any network', () => {
    expect(parseArgs(['check', '--jsno', 'the sky is blue']).error).toMatch(/unknown option: --jsno/);
  });

  it('known flags and value flags behave as before', () => {
    expect(parseArgs(['verify', 'x', '--json']).json).toBe(true);
    expect(parseArgs(['report', '--evidence']).error).toMatch(/requires a value/);
    expect(parseArgs(['--version']).command).toBe('version');
    expect(parseArgs(['-h']).command).toBe('help');
  });
});

describe('run(): the dash-led sentence reaches the classifier exactly as typed', () => {
  const prevFetch = global.fetch;
  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('check -- "-5 is less than 3." POSTs that exact text and exits on the label', async () => {
    const seen: string[] = [];
    global.fetch = (async (_url: unknown, init?: { body?: string }) => {
      seen.push(String(init?.body ?? ''));
      return { status: 200, text: async () => JSON.stringify({ label: 'veto', latency_ms: 3 }) };
    }) as unknown as typeof fetch;
    const { io, out } = capture();
    const code = await run(parseArgs(['check', '--', CLAIM]), {} as never, io);
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0] as string).text).toBe(CLAIM);
    expect(out[0]).toBe('veto');
    expect(code).toBe(EXIT.VETO);
  });

  it('the same sentence, quoted, without --', async () => {
    const seen: string[] = [];
    global.fetch = (async (_url: unknown, init?: { body?: string }) => {
      seen.push(String(init?.body ?? ''));
      return { status: 200, text: async () => JSON.stringify({ label: 'pass', latency_ms: 3 }) };
    }) as unknown as typeof fetch;
    const { io } = capture();
    const code = await run(parseArgs(['check', CLAIM]), {} as never, io);
    expect(JSON.parse(seen[0] as string).text).toBe(CLAIM);
    expect(code).toBe(EXIT.OK);
  });

  it('a usage error sends nothing', async () => {
    let calls = 0;
    global.fetch = (async () => {
      calls += 1;
      return { status: 200, text: async () => '{}' };
    }) as unknown as typeof fetch;
    const { io } = capture();
    const code = await run(parseArgs(['check', '--jsno', 'x']), {} as never, io);
    expect(code).toBe(EXIT.USAGE);
    expect(calls).toBe(0);
  });
});

describe('the help says how to pass a dash-led claim', () => {
  it('documents --', async () => {
    const { io, out } = capture();
    await run(parseArgs(['--help']), {} as never, io);
    expect(out.join('\n')).toMatch(/\n {2}-- {2,}End of options/);
  });
});
