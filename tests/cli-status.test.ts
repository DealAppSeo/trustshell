import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { buildStatusReport } from '../src/cli/status';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('trustshell status', () => {
  it('is a command and the help text for it is one paragraph', () => {
    expect(parseArgs(['status']).command).toBe('status');
    expect(parseArgs(['status']).error).toBeUndefined();
    const help = readFileSync(join(__dirname, '../src/cli/index.ts'), 'utf8');
    const line = help.split('\n').find((row) => row.trimStart().startsWith('status'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/\n/);
    expect(line).toMatch(/NOT_CHECKED/);
  });

  it('prints NOT_CHECKED when both endpoints fail', async () => {
    const text = await buildStatusReport({
      env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
      fetchImpl: async () => jsonResponse(503, {}),
    });
    expect(text).toBe(
      [
        'can_verify NOT_CHECKED',
        'can_bind NOT_CHECKED',
        'can_stake NOT_CHECKED',
        'can_rate_models NOT_CHECKED',
        'honesty-a NOT_CHECKED',
        'first-pass NOT_CHECKED',
        'post-HAL NOT_CHECKED',
      ].join('\n'),
    );
    expect(text).not.toMatch(/PASS/);
  });

  it('prints the after-create table and one Honesty A line from mocked HTTP', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/api/v1/after-create')) {
        return jsonResponse(200, {
          can_verify: true,
          can_bind: false,
          can_stake: true,
          can_rate_models: false,
        });
      }
      return jsonResponse(200, {
        status: 'counted',
        rows: [
          { family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 },
          { family: 'qwen', host: 'deepseek', TRUE: 9, FALSE: 9, NOT_CHECKED: 9 },
        ],
      });
    };
    const text = await buildStatusReport({
      env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(text).toContain('can_verify true');
    expect(text).toContain('can_bind false');
    expect(text).toContain('can_stake shadow — not live');
    expect(text).toContain('honesty-a glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(text).toContain('first-pass glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(text).toContain('post-HAL NOT_CHECKED');
    expect(text).not.toContain('qwen');
    expect(text).not.toMatch(/user_id|prompt/i);
    expect(text).not.toMatch(/can_stake live/);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('prints NOT_CHECKED for the live honesty-a gap and does not invent a post-HAL count', async () => {
    const text = await buildStatusReport({
      env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/api/v1/after-create')) {
          return jsonResponse(200, { can_verify: true, can_bind: false, can_stake: false, can_rate_models: false });
        }
        return jsonResponse(200, {
          window_days: 7,
          status: 'NOT_CHECKED',
          source: 'hal_quorum_validator_votes',
          writer_enabled: false,
          gap: 'relation "public.hal_quorum_validator_votes" does not exist',
          rows: null,
        });
      },
    });
    expect(text).toContain('honesty-a NOT_CHECKED');
    expect(text).toContain('first-pass NOT_CHECKED');
    expect(text).toContain('post-HAL NOT_CHECKED');
    expect(text).not.toMatch(/post-HAL (?!NOT_CHECKED)/);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('run() prints that report and does not use the SDK client', async () => {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const prev = global.fetch;
    global.fetch = (async () => jsonResponse(503, {})) as typeof fetch;
    const prevUrl = process.env.TRUSTSHELL_API_URL;
    process.env.TRUSTSHELL_API_URL = 'https://engine.test';
    try {
      const code = await run(parseArgs(['status']), {} as never, io);
      expect(code).toBe(0);
      expect(out.join('\n')).toContain('honesty-a NOT_CHECKED');
    } finally {
      global.fetch = prev;
      if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
      else process.env.TRUSTSHELL_API_URL = prevUrl;
    }
  });
});
