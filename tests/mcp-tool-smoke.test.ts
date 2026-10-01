/**
 * node -e loads src/mcp/index.ts and checks the tool names.
 * This file does not edit .mcp.json. A tool named stake fails.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const SMOKE = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if ((request.startsWith('.') || path.isAbsolute(request)) && !request.includes('node_modules')) {
    const fromDir = parent && parent.filename && parent.filename !== '[eval]'
      ? path.dirname(parent.filename)
      : process.cwd();
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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  mod._compile(out, filename);
};

const mcp = require(path.join(process.cwd(), 'src', 'mcp', 'index.ts'));
const server = mcp.createServer();
const names = Object.keys(server._registeredTools || {});
if (process.env.SMOKE_INJECT_STAKE === '1') names.push('stake');
const need = ['verify', 'repid', 'status', 'remember', 'recall', 'redact'];
for (const name of need) {
  if (!names.includes(name)) {
    console.error('missing ' + name);
    process.exit(1);
  }
}
if (names.includes('stake')) {
  console.error('stake');
  process.exit(1);
}
`;

function runSmoke(extraEnv: Record<string, string> = {}): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(process.execPath, ['-e', SMOKE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 60000,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

describe('mcp tool smoke', () => {
  it('loads src/mcp/index.ts and finds verify, repid, status, remember, recall, and redact', () => {
    const result = runSmoke();
    expect(result.stderr).not.toMatch(/missing |stake/);
    expect(result.status).toBe(0);
  });

  it('fails when a tool is named stake', () => {
    const result = runSmoke({ SMOKE_INJECT_STAKE: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('stake');
  });
});
