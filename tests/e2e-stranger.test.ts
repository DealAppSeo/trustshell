/**
 * Stranger path: the four commands shipped in @hyperdag/trustshell@1.4.0,
 * plus every command in this repo's CLI. Engine routes are mocked.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ROOT = join(__dirname, '..');
const ENGINE = 'https://engine.test';
const PARIS = 'The capital of France is Paris.';
const ROME = 'The Eiffel Tower is located in Rome, Italy.';
const RUN_URL = 'https://github.com/DealAppSeo/trustshell/actions/runs/33942669558';
const FOUR = ['verify', 'repid', 'proof', 'status'] as const;

type ProofFixture = {
  agentId: string;
  proof_bytes: string;
  scheme: string;
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string };
  created_at: string;
};

const fixture = JSON.parse(
  readFileSync(join(ROOT, 'fixtures/proof-agent.json'), 'utf8'),
) as ProofFixture;

const ran = new Set<string>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function commandsOnMain(): Set<string> {
  const cli = readFileSync(join(ROOT, 'src/cli/index.ts'), 'utf8');
  const union = cli.match(/export type Command\s*=\s*([^;]+);/);
  if (!union?.[1]) throw new Error('Command union missing');
  return new Set([...union[1].matchAll(/'([^']*)'/g)].map((m) => m[1] as string));
}

function installFetch(): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      const raw = typeof init?.body === 'string' ? init.body : '';
      const text = raw ? ((JSON.parse(raw) as { text?: string }).text ?? '') : '';
      const rome = text.includes('Rome');
      return jsonResponse(200, {
        decision: rome ? 'vetoed' : 'clean',
        hal_score: rome ? 0.9 : 0.1,
        mode: 'fact-check',
        signals: { families_used: 2, providers_used: 2 },
        provider_responses: [{ provider: 'glm', verdict: rome ? 'FALSE' : 'TRUE', note: 'counted' }],
      });
    }
    if (url.endsWith('/proof')) {
      return jsonResponse(200, {
        proof_bytes: fixture.proof_bytes,
        scheme: fixture.scheme,
        statement: fixture.statement,
        created_at: fixture.created_at,
      });
    }
    if (url.includes('/api/v1/repid/')) {
      return jsonResponse(200, {
        agent_id: fixture.agentId,
        repid_score: 200,
        tier: 'PROBATIONARY',
        source: 'shadow',
        latest_proof_hash: 'abc',
      });
    }
    if (url.includes('api.github.com') && url.includes('/jobs')) {
      return jsonResponse(200, { total_count: 1, jobs: [{ name: 'job-0', conclusion: 'success' }] });
    }
    if (url.includes('api.github.com')) {
      return jsonResponse(200, {
        conclusion: 'success',
        status: 'completed',
        head_sha: 'abc123def456789',
        head_branch: 'main',
        name: 'check',
        display_title: 'stranger',
      });
    }
    return jsonResponse(503, {});
  }) as typeof fetch;
}

describe('stranger e2e on current main', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevStake = process.env.SAYS_STAKE_LIVE;
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  const client = new TrustShell({ apiUrl: ENGINE });

  beforeEach(() => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    delete process.env.SAYS_STAKE_LIVE;
    installFetch();
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevStake === undefined) delete process.env.SAYS_STAKE_LIVE;
    else process.env.SAYS_STAKE_LIVE = prevStake;
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
  });

  async function go(argv: string[]): Promise<{ code: number; out: string; err: string }> {
    const cap = capture();
    const args = parseArgs(argv);
    ran.add(args.command);
    const code = await run(args, client, cap.io);
    return { code, out: cap.out.join('\n'), err: cap.err.join('\n') };
  }

  it('the four 1.4 commands are verify, repid, proof, and status', () => {
    const skill = JSON.parse(readFileSync(join(ROOT, 'skills/trustshell/skill.json'), 'utf8')) as {
      commands: string[];
    };
    const named = skill.commands.map((line) => line.split(/\s+/)[1]);
    expect(named).toEqual([...FOUR]);
    for (const cmd of FOUR) expect(commandsOnMain().has(cmd)).toBe(true);
  });

  it('verify Paris passes and Rome vetoes', async () => {
    const paris = await go(['verify', PARIS]);
    expect(paris.code).toBe(0);
    expect(paris.out).toMatch(/✓ PASS/);
    const rome = await go(['verify', ROME]);
    expect(rome.code).toBe(1);
    expect(rome.out).toMatch(/✗ VETO/);
  });

  it('repid prints a score', async () => {
    const r = await go(['repid', fixture.agentId]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(fixture.agentId);
    expect(r.out).toMatch(/RepID 200/);
  });

  it('proof --verify accepts the local fixture', async () => {
    const r = await go(['proof', fixture.agentId, '--verify']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/verified\s+✓/);
  }, 30000);

  it('status prints NOT_CHECKED when after-create is missing, never 0', async () => {
    const r = await go(['status']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('can_verify NOT_CHECKED');
    expect(r.out).toContain('can_bind NOT_CHECKED');
    expect(r.out).toContain('can_stake NOT_CHECKED');
    expect(r.out).toContain('can_rate_models NOT_CHECKED');
    expect(r.out).toContain('honesty-a NOT_CHECKED');
    expect(r.out).toContain('first-pass NOT_CHECKED');
    expect(r.out).not.toMatch(/\b0\b/);
    expect(r.out).not.toMatch(/can_stake live/);
    expect(r.out).not.toMatch(/staking is live/i);
  });

  it('runs the other commands that exist on main', async () => {
    const version = await go(['--version']);
    expect(version.code).toBe(0);
    expect(version.out).toMatch(/1\.5/);

    const help = await go(['--help']);
    expect(help.code).toBe(0);
    for (const cmd of FOUR) expect(help.out).toContain(cmd);

    const evaluate = await go(['evaluate', PARIS]);
    expect(evaluate.code).toBe(0);
    expect(evaluate.out).toMatch(/✓ PASS/);

    const badge = await go(['badge', fixture.agentId]);
    expect(badge.code).toBe(0);
    expect(badge.out).toContain('<svg');

    const check = await go(['check', RUN_URL]);
    expect(check.code).toBe(0);
    expect(check.out).toContain('COMPLETE');

    const dir = mkdtempSync(join(tmpdir(), 'ts-stranger-'));
    const missing = join(dir, 'missing.jsonl');
    const inspect = await go(['inspect', missing]);
    expect(inspect.code).toBe(3);
    expect(inspect.out).toContain('NO_LOG');

    const init = await go(['init', dir]);
    expect(init.code).toBe(0);
    expect(existsSync(join(dir, '.trustshell', 'profile.md'))).toBe(true);
    expect(init.out).toMatch(/no network/);

    const report = await go(['report', '--session', missing]);
    expect(report.code).toBe(3);
    expect(report.out).toContain('UNSUPPORTED');

    const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
    const homeBefore = existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
    const memory = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = memory;
    const remembered = await go(['remember', 'stranger note']);
    expect(remembered.code).toBe(0);
    expect(remembered.out).toContain('remembered');
    const recall = await go(['recall']);
    expect(recall.code).toBe(0);
    expect(recall.out).toContain('stranger note');
    const keyed = await go(['remember', 'desk', 'local only']);
    expect(keyed.code).toBe(0);
    const keyedRecall = await go(['recall', 'desk']);
    expect(keyedRecall.code).toBe(0);
    expect(keyedRecall.out).toBe('local only');
    const redacted = await go(['redact', 'desk']);
    expect(redacted.code).toBe(0);
    expect(redacted.out).toBe('redacted');
    const gone = await go(['recall', 'desk']);
    expect(gone.out).toBe('NOT_CHECKED');
    expect(gone.out).not.toBe('');
    const homeAfter = existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
    expect(homeAfter).toBe(homeBefore);

    process.env.SAYS_STAKE_LIVE = '1';
    installFetch();
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/after-create')) {
        return jsonResponse(200, { status: 'counted', can_bind: true, can_stake: true });
      }
      return jsonResponse(503, {});
    }) as typeof fetch;
    const bound = await go(['bind-status']);
    expect(bound.code).toBe(0);
    expect(bound.out).toBe('can_bind true\ncan_stake shadow — not live');
    expect(bound.out).not.toMatch(/can_stake live/);

    global.fetch = (async () => jsonResponse(503, {})) as typeof fetch;
    const down = await go(['bind-status']);
    expect(down.out).toBe('can_bind NOT_CHECKED\ncan_stake NOT_CHECKED');
    expect(down.out).not.toMatch(/\b0\b/);
  }, 30000);

  it('traps lists the ten fixture claims and stays NOT_CHECKED without receipts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-traps-stranger-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      const r = await go(['traps']);
      expect(r.code).toBe(0);
      expect(r.out).toContain('surgeon NOT_CHECKED');
      expect(r.out).toContain('ravens NOT_CHECKED');
      expect(r.out).not.toMatch(/\b0\b/);
      expect(r.out).not.toMatch(/scoreboard|wins|HAL|live stake|stake|PASS/i);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('landing keeps the 1.5.0 install line and does not put status on npm', () => {
    const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    const landing = `${page}\n${hero}`;
    expect(hero).toContain('Every answer gets checks you can see.');
    expect(hero).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(hero).not.toContain('Check a claim in the chat you already use');
    expect(hero).toContain('npx @hyperdag/trustshell check "The Eiffel Tower is in Berlin."');
    expect(hero).toContain('npm i -g @hyperdag/trustshell@1.5.0');
    expect(hero).not.toMatch(/npm i -g @hyperdag\/trustshell@1\.5\.0[^\n]*status/);
    expect(landing).not.toContain('E:\\TrustDisk');
    expect(landing).not.toContain('Loading live scores');
    const shown = [...landing.matchAll(/\btrustshell\s+([a-z][a-z0-9-]*)/g)].map((m) => m[1] as string);
    expect(shown).toContain('check');
    const commands = commandsOnMain();
    for (const cmd of shown) expect(commands.has(cmd)).toBe(true);
  });

  afterAll(() => {
    expect([...ran].sort()).toEqual([...commandsOnMain()].sort());
  });
});
