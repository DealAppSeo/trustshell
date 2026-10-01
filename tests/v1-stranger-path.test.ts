/**
 * Stranger path: help lists the packed bins, local notes use a temp home,
 * offline status stays NOT_CHECKED, and verify --json names receipt_written.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ROOT = join(__dirname, '..');
const nodeRequire = createRequire(__filename);
const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
const SEVEN = ['remember', 'recall', 'redact', 'verify', 'repid', 'proof', 'status'];

const RUNNER = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = process.env.TRUSTSHELL_STRANGER_ROOT;
const ts = require(path.join(root, 'node_modules', 'typescript'));
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if ((request.startsWith('.') || path.isAbsolute(request)) && !request.includes('node_modules')) {
    const fromDir = parent && parent.filename ? path.dirname(parent.filename) : root;
    const base = path.isAbsolute(request) ? request : path.resolve(fromDir, request);
    const candidates = [base, base + '.ts', base + '.tsx', base + '.js', base + '.json', path.join(base, 'index.ts'), path.join(base, 'index.js')];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch (err) {}
    }
  }
  return origResolve.call(this, request, parent, isMain, options);
};
function stripShebang(text) {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  if (body.startsWith('#!')) {
    const nl = body.indexOf(String.fromCharCode(10));
    body = nl < 0 ? '' : body.slice(nl + 1);
  }
  return body;
}
require.extensions['.ts'] = function (mod, filename) {
  const source = stripShebang(fs.readFileSync(filename, 'utf8'));
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  mod._compile(out, filename);
};
const cli = require(path.join(root, 'src', 'cli', 'index.ts'));
const cap = { out: [], err: [] };
cli.run(cli.parseArgs(process.argv.slice(2)), {}, {
  out: (s) => cap.out.push(String(s)),
  err: (s) => cap.err.push(String(s)),
}).then((code) => {
  process.stdout.write(JSON.stringify({ code, out: cap.out, err: cap.err }));
  process.exit(0);
}).catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(3);
});
`;

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

function rowCount(file: string): number {
  if (!existsSync(file)) return 0;
  const { DatabaseSync } = nodeRequire('node:sqlite') as {
    DatabaseSync: new (location: string) => {
      prepare(sql: string): { get(): { n: number | bigint } };
      close(): void;
    };
  };
  const db = new DatabaseSync(file);
  try {
    return Number(db.prepare('SELECT COUNT(*) AS n FROM memory').get().n);
  } finally {
    db.close();
  }
}

function shippedBins(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
  return pkg.files
    .filter((file) => /^bin\/[a-z0-9-]+\.js$/.test(file))
    .map((file) => file.slice('bin/'.length, -'.js'.length))
    .sort();
}

describe('v1 stranger path', () => {
  jest.setTimeout(60000);
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;
  let runner = '';
  let beforeHome: number | null = null;

  beforeAll(() => {
    runner = join(mkdtempSync(join(tmpdir(), 'ts-stranger-run-')), 'run.cjs');
    writeFileSync(runner, RUNNER);
  });

  beforeEach(() => {
    beforeHome = homeStamp();
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    expect(homeStamp()).toBe(beforeHome);
  });

  afterAll(() => {
    rmSync(join(runner, '..'), { recursive: true, force: true });
  });

  function cli(home: string, args: string[]): { code: number; out: string[]; err: string[] } {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, TRUSTSHELL_STRANGER_ROOT: ROOT };
    delete env.TRUSTSHELL_MEMORY;
    delete env.TRUSTSHELL_LAYA;
    delete env.OFFLINE;
    const result = spawnSync(process.execPath, [runner, ...args], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout) as { code: number; out: string[]; err: string[] };
  }

  it('help lists the seven bins that files[] ships', async () => {
    expect(shippedBins()).toEqual([...SEVEN].sort());
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    expect(await run(parseArgs(['--help']), {} as never, io)).toBe(0);
    const help = out.join('\n');
    for (const name of SEVEN) expect(help).toContain(name);
  });

  it('remembers, recalls, and redacts under a temp HOME', () => {
    const home = mkdtempSync(join(tmpdir(), 'ts-stranger-home-'));
    const db = join(home, '.trustshell', 'memory.sqlite');
    try {
      expect(db.toLowerCase().startsWith(ROOT.toLowerCase())).toBe(false);
      expect(db).not.toBe(homeDb);
      const saved = cli(home, ['remember', 'city', 'Paris']);
      expect(saved.code).toBe(0);
      expect(saved.out).toEqual(['remembered']);
      expect(rowCount(db)).toBe(1);
      expect(cli(home, ['recall', 'city']).out).toEqual(['Paris']);
      expect(cli(home, ['redact', 'city']).out).toEqual(['redacted']);
      expect(cli(home, ['recall', 'city']).out).toEqual(['NOT_CHECKED']);
      expect(rowCount(db)).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('remember postgresql://x exits 2 and leaves the sqlite row count unchanged', () => {
    const home = mkdtempSync(join(tmpdir(), 'ts-stranger-secret-'));
    const db = join(home, '.trustshell', 'memory.sqlite');
    try {
      expect(cli(home, ['remember', 'city', 'Paris']).code).toBe(0);
      expect(rowCount(db)).toBe(1);
      const refused = cli(home, ['remember', 'postgresql://x']);
      expect(refused.code).toBe(2);
      expect(refused.err).toEqual(['remember refused']);
      expect(refused.out).toEqual([]);
      expect(JSON.stringify(refused)).not.toContain('postgresql://');
      expect(rowCount(db)).toBe(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('OFFLINE=1 status is NOT_CHECKED and not PASS', async () => {
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
    expect(text).toContain('NOT_CHECKED');
    expect(text).not.toMatch(/\bPASS\b/);
  });

  it('verify --json with a mocked counted honesty-a includes receipt_written', async () => {
    const engine = 'https://engine.test';
    const claim = 'paste-your-own-claim-9f3c';
    delete process.env.OFFLINE;
    process.env.TRUSTSHELL_API_URL = engine;
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return new Response(JSON.stringify({
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1 },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return new Response(JSON.stringify({
          status: 'counted',
          rows: [{
            family: 'glm',
            host: 'cerebras',
            first_pass: { TRUE: 4, FALSE: 1, NOT_CHECKED: 2 },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        return new Response(JSON.stringify({ written: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', claim, '--json']), new TrustShell({ apiUrl: engine }), io);
    expect(code).toBe(0);
    expect(calls.some((line) => line.includes('/api/v1/hal/honesty-a'))).toBe(true);
    const body = JSON.parse(out.join('\n')) as Record<string, unknown>;
    expect([true, false, 'NOT_CHECKED']).toContain(body.receipt_written);
    expect(out.join('\n')).not.toContain(claim);
  });
});
