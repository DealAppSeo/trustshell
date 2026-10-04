/**
 * Spawn the CLI with a fake GROQ_API_KEY.
 * Stdout and stderr must not contain it. A thrown error must not print it either.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SECRET = 'gsk_fake_groq_9f3c_DO_NOT_LEAK';

const RUNNER = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = process.env.TRUSTSHELL_ROOT;
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
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const exp = origLoad.apply(this, arguments);
  if (process.env.TRUSTSHELL_PROVE_THROW === '1' && exp && exp.TrustShell && String(request).replace(/\\\\/g, '/').includes('lib/trustshell')) {
    function Boom() {
      throw new Error(process.env.GROQ_API_KEY);
    }
    exp.TrustShell = Boom;
  }
  return exp;
};
const cli = path.join(root, 'src', 'cli', 'index.ts');
process.argv = [process.execPath, cli, '--version'];
require(cli);
`;

function spawnCli(proveThrow: boolean): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ts-groq-'));
  const runner = join(dir, 'run-cli.cjs');
  writeFileSync(runner, RUNNER);
  const result = spawnSync(process.execPath, [runner], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      TRUSTSHELL_ROOT: ROOT,
      GROQ_API_KEY: SECRET,
      TRUSTSHELL_PROVE_THROW: proveThrow ? '1' : '0',
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('GROQ_API_KEY stays out of CLI output', () => {
  jest.setTimeout(30000);

  it('a normal spawn prints neither stdout nor stderr with the key', () => {
    const run = spawnCli(false);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain(SECRET);
    expect(run.stderr).not.toContain(SECRET);
    expect(run.stdout).toMatch(/1\.5/);
  });

  it('a thrown error does not print the key', () => {
    const run = spawnCli(true);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain(SECRET);
    expect(run.stderr).not.toContain(SECRET);
    expect(run.stderr).toMatch(/trustshell: fatal:/);
  });
});
