/**
 * OFFLINE=1 status prints NOT_CHECKED and never PASS.
 */
import { parseArgs, run, type CliIO } from '../src/cli';

const NOT_CHECKED = [
  'can_verify NOT_CHECKED',
  'can_bind NOT_CHECKED',
  'can_stake NOT_CHECKED',
  'can_rate_models NOT_CHECKED',
  'honesty-a NOT_CHECKED',
  'first-pass NOT_CHECKED',
].join('\n');

describe('OFFLINE status', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  it('never prints PASS', async () => {
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = 'https://engine.test';
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ verdict: 'PASS', status: 'PASS' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['status']), {} as never, io);
    const text = out.join('\n');
    expect(code).toBe(0);
    expect(called).toBe(false);
    expect(text).toBe(NOT_CHECKED);
    expect(text).not.toMatch(/\bPASS\b/);
    expect(text).not.toMatch(/stake now|stake live/i);
  });
});
