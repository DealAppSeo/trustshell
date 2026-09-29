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
    expect(text).toContain('can_bind NOT_CHECKED');
    expect(text).toContain('can_stake shadow — not live');
    expect(text).toContain('honesty-a glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(text).toContain('first-pass NOT_CHECKED');
    expect(text).not.toMatch(/post-HAL/);
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
    expect(text).not.toMatch(/post-HAL/);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('prints counted first_pass fields and post_hal_verdict, and does not invent either', async () => {
    const text = await buildStatusReport({
      env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/api/v1/after-create')) {
          return jsonResponse(200, { can_verify: true, can_bind: false, can_stake: true, can_rate_models: false });
        }
        return jsonResponse(200, {
          status: 'counted',
          rows: [
            {
              family: 'glm',
              host: 'cerebras',
              TRUE: 4,
              FALSE: 1,
              NOT_CHECKED: 2,
              first_pass: { TRUE: 0, FALSE: 1, NOT_CHECKED: 2 },
              post_hal_verdict: 'FALSE',
            },
          ],
        });
      },
    });
    expect(text).toContain('first-pass glm cerebras TRUE 0 FALSE 1 NOT_CHECKED 2');
    expect(text).toContain('post-HAL FALSE');
    expect(text).toContain('can_stake shadow — not live');
    expect(text).not.toMatch(/can_stake live/);

    const missing = await buildStatusReport({
      env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
      fetchImpl: async () =>
        jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras', first_pass: { FALSE: 1 }, post_hal_verdict: 0 }],
        }),
    });
    expect(missing).toContain('first-pass NOT_CHECKED');
    expect(missing).toContain('post-HAL NOT_CHECKED');
    expect(missing).not.toMatch(/TRUE 0|post-HAL 0/);
  });

  it('prints can_bind true only when readiness exact_true is boolean true', async () => {
    const report = async (readiness: unknown) =>
      buildStatusReport({
        env: { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.test' },
        fetchImpl: async (url) => {
          const href = String(url);
          if (href.endsWith('/readiness')) return jsonResponse(200, readiness);
          if (href.endsWith('/api/v1/after-create')) {
            return jsonResponse(200, { can_verify: true, can_bind: true, can_stake: true, can_rate_models: false });
          }
          return jsonResponse(503, {});
        },
      });

    const on = await report({
      flags: { HUMAN_AGENT_BIND_ENABLED: 'on' },
      exact_true: { HUMAN_AGENT_BIND_ENABLED: true, REAL_STAKING_ENABLED: true },
    });
    expect(on).toContain('can_bind true');
    expect(on).toContain('can_stake shadow — not live');
    expect(on).not.toMatch(/can_stake live/);

    const off = await report({
      flags: { HUMAN_AGENT_BIND_ENABLED: 'on' },
      exact_true: { HUMAN_AGENT_BIND_ENABLED: false },
    });
    expect(off).toContain('can_bind false');

    const word = await report({
      flags: { HUMAN_AGENT_BIND_ENABLED: 'on' },
      exact_true: { HUMAN_AGENT_BIND_ENABLED: 'true' },
    });
    expect(word).toContain('can_bind false');
    expect(word).not.toMatch(/can_bind true/);

    const ignored = await report({
      flags: { HUMAN_AGENT_BIND_ENABLED: 'on' },
      exact_true: { REAL_STAKING_ENABLED: false },
    });
    expect(ignored).toContain('can_bind NOT_CHECKED');
    expect(ignored).not.toMatch(/can_bind true/);
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

  it('a missing first_pass prints NOT_CHECKED, never 0', async () => {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const prev = global.fetch;
    const prevUrl = process.env.TRUSTSHELL_API_URL;
    const prevStake = process.env.SAYS_STAKE_LIVE;
    const prevOffline = process.env.OFFLINE;
    process.env.TRUSTSHELL_API_URL = 'https://engine.test';
    delete process.env.SAYS_STAKE_LIVE;
    delete process.env.OFFLINE;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras' }],
        });
      }
      if (url.endsWith('/api/v1/after-create')) {
        return jsonResponse(200, {
          can_verify: true,
          can_bind: false,
          can_stake: false,
          can_rate_models: false,
        });
      }
      return jsonResponse(200, { exact_true: { HUMAN_AGENT_BIND_ENABLED: false } });
    }) as typeof fetch;
    try {
      const code = await run(parseArgs(['status']), {} as never, io);
      expect(code).toBe(0);
      const text = out.join('\n');
      expect(text).toContain('first-pass NOT_CHECKED');
      expect(text).not.toMatch(/first-pass[^\n]*\b0\b/);
    } finally {
      global.fetch = prev;
      if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
      else process.env.TRUSTSHELL_API_URL = prevUrl;
      if (prevStake === undefined) delete process.env.SAYS_STAKE_LIVE;
      else process.env.SAYS_STAKE_LIVE = prevStake;
      if (prevOffline === undefined) delete process.env.OFFLINE;
      else process.env.OFFLINE = prevOffline;
    }
  });
});
