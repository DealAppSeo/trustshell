/**
 * A stranger can run the landing commands against this CLI.
 * Engine routes are mocked. A missing body is NOT_CHECKED, never 0.
 */
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';
import { linksForLanding } from '../lib/landing-nav';

const ROOT = join(__dirname, '..');
const ENGINE = 'https://engine.test';
const PARIS = 'The capital of France is Paris.';
const ROME = 'The Eiffel Tower is located in Rome, Italy.';

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

function installFetch(calls: string[]): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${url}`);
    if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      const raw = typeof init?.body === 'string' ? init.body : '';
      const text = raw ? (JSON.parse(raw) as { text?: string }).text ?? '' : '';
      const rome = text.includes('Rome');
      return jsonResponse(200, {
        decision: rome ? 'vetoed' : 'clean',
        hal_score: rome ? 0.9 : 0.1,
        mode: 'fact-check',
        signals: { families_used: 2, providers_used: 2 },
        provider_responses: [{ provider: 'glm', verdict: rome ? 'FALSE' : 'TRUE', note: 'counted' }],
      });
    }
    return jsonResponse(503, {});
  }) as typeof fetch;
}

function landingFiles(): string[] {
  const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
  const rels = [...page.matchAll(/from '@\/([^']+)'/g)].map((m) => m[1] as string);
  const files = ['app/page.tsx', 'components/top-nav.tsx'];
  for (const rel of rels) {
    const tsx = `${rel}.tsx`;
    const ts = `${rel}.ts`;
    if (existsSync(join(ROOT, tsx))) files.push(tsx);
    else if (existsSync(join(ROOT, ts))) files.push(ts);
    else throw new Error(`landing import missing on disk: ${rel}`);
  }
  return files;
}

function readLanding(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('stranger e2e matches the landing', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevStake = process.env.SAYS_STAKE_LIVE;
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    delete process.env.SAYS_STAKE_LIVE;
    installFetch(calls);
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

  it('trustshell --version prints a version', async () => {
    const cap = capture();
    const code = await run(parseArgs(['--version']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(cap.out.join('\n')).toMatch(/\d+\.\d+\.\d+/);
  });

  it('trustshell verify Paris → PASS', async () => {
    const cap = capture();
    const code = await run(
      parseArgs(['verify', PARIS]),
      new TrustShell({ apiUrl: ENGINE }),
      cap.io,
    );
    const text = cap.out.join('\n');
    expect(code).toBe(0);
    expect(text).toMatch(/✓ PASS/);
    expect(text).not.toMatch(/✗ VETO/);
  });

  it('trustshell verify Rome → VETO', async () => {
    const cap = capture();
    const code = await run(
      parseArgs(['verify', ROME]),
      new TrustShell({ apiUrl: ENGINE }),
      cap.io,
    );
    const text = cap.out.join('\n');
    expect(code).toBe(1);
    expect(text).toMatch(/✗ VETO/);
  });

  it('trustshell status prints after-create cells, and a missing body is NOT_CHECKED never 0', async () => {
    const cap = capture();
    const code = await run(parseArgs(['status']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const text = cap.out.join('\n');
    expect(code).toBe(0);
    expect(calls.some((line) => line.endsWith('/api/v1/after-create'))).toBe(true);
    expect(text).toContain('can_verify NOT_CHECKED');
    expect(text).toContain('can_bind NOT_CHECKED');
    expect(text).toContain('can_stake NOT_CHECKED');
    expect(text).toContain('can_rate_models NOT_CHECKED');
    expect(text).toContain('honesty-a NOT_CHECKED');
    expect(text).toContain('first-pass NOT_CHECKED');
    expect(text).not.toMatch(/\b0\b/);
    expect(text).not.toMatch(/can_stake live/);
    expect(text).not.toMatch(/staking is live/i);
  });

  it('trustshell init creates .trustshell/ and --help documents wipe as a local delete', async () => {
    const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
    const homeBefore = existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
    const dir = mkdtempSync(join(tmpdir(), 'ts-stranger-'));
    const memory = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = memory;
    const client = new TrustShell({ apiUrl: ENGINE });

    const created = capture();
    const createCode = await run(parseArgs(['init', dir]), client, created.io);
    expect(createCode).toBe(0);
    expect(existsSync(join(dir, '.trustshell', 'profile.md'))).toBe(true);
    expect(created.out.join('\n')).toMatch(/no network/);

    const help = capture();
    const helpCode = await run(parseArgs(['--help']), client, help.io);
    const helpText = help.out.join('\n');
    expect(helpCode).toBe(0);
    expect(helpText).toMatch(/--wipe/);
    expect(helpText).toMatch(/Delete the local profile \+ memory file/i);
    expect(helpText).toMatch(/No network/i);

    writeFileSync(memory, 'local-note');
    calls.length = 0;
    const wiped = capture();
    const wipeCode = await run(parseArgs(['init', dir, '--wipe']), client, wiped.io);
    const wipeText = wiped.out.join('\n');
    expect(wipeCode).toBe(0);
    expect(existsSync(join(dir, '.trustshell', 'profile.md'))).toBe(false);
    expect(existsSync(memory)).toBe(false);
    expect(wipeText).toMatch(/no network/);
    expect(calls).toEqual([]);

    const again = capture();
    const againCode = await run(parseArgs(['init', dir, '--wipe']), client, again.io);
    expect(againCode).toBe(0);
    expect(again.out.join('\n')).toMatch(/absent/);
    expect(calls).toEqual([]);

    const homeAfter = existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
    expect(homeAfter).toBe(homeBefore);
  });

  it('keeps the headline and the vision block', () => {
    const hero = readLanding('components/hero.tsx');
    const glass = readLanding('components/glass-box.tsx');
    const page = readLanding('app/page.tsx');
    expect(hero).toContain('A portable trust harness. Autonomy is earned.');
    expect(glass).toContain('Black box, meet glass box.');
    expect(glass).toContain('AI agents make decisions you can&apos;t see.');
    expect(page).toContain('<GlassBox />');
    expect(page).toContain('<LandingClose />');
    expect(page).toContain('<AfterAgent />');
  });

  it('landing commands are only commands this CLI ships', () => {
    const cli = readFileSync(join(ROOT, 'src/cli/index.ts'), 'utf8');
    const union = cli.match(/export type Command\s*=\s*([^;]+);/);
    if (!union?.[1]) throw new Error('Command union missing');
    const commands = new Set([...union[1].matchAll(/'([^']*)'/g)].map((m) => m[1]));
    const shown = new Set<string>();
    for (const rel of landingFiles()) {
      const text = readLanding(rel);
      for (const m of text.matchAll(/\btrustshell\s+([a-z][a-z0-9-]*)/g)) {
        shown.add(m[1] as string);
      }
    }
    expect([...shown].sort()).toEqual(['status', 'verify']);
    for (const cmd of shown) expect(commands.has(cmd)).toBe(true);
  });

  it('landing HTML drops the three leak strings', () => {
    const blob = landingFiles().map(readLanding).join('\n');
    expect(blob).not.toContain('E:\\TrustDisk');
    expect(blob).not.toContain('Demo file is not in the repo');
    expect(blob).not.toContain('Loading live scores');
  });

  it('landing nav stays off TrustChat, TrustRepID, and HyperDAG Protocol', () => {
    for (const rel of ['components/top-nav.tsx', 'components/footer.tsx', 'components/ecosystem.tsx', 'app/page.tsx']) {
      const text = readLanding(rel);
      expect(text).not.toMatch(/TrustChat/);
      expect(text).not.toMatch(/TrustRepID/);
      expect(text).not.toMatch(/HyperDAG Protocol/);
    }
    const links = [
      { href: '/chat', label: 'TrustChat' },
      { href: '/repid', label: 'TrustRepID' },
      { href: '/protocol', label: 'HyperDAG Protocol' },
      { href: '/stake', label: 'Stake' },
      { href: '/market', label: 'Market' },
    ];
    expect(linksForLanding('/', links).map((l) => l.href)).toEqual(['/market']);
    expect(linksForLanding('/docs', links).map((l) => l.label)).toEqual(links.map((l) => l.label));
  });
});
