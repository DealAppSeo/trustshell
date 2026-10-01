/**
 * Spawn the local MCP entry over stdio and verify remember refuses Bearer tokens.
 * The token must not appear in the tool result, stderr, sqlite file, or fetch body.
 * Innocent phrases like "Bearer of good news" are still accepted.
 */
import { createServer as createHttp, type IncomingMessage } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = join(__dirname, '..');
const TOKEN = 'fake_bearer_token_123456789';
const BEARER_NOTE = `Authorization: Bearer ${TOKEN}`;
const INNOCENT_NOTE = 'Bearer of good news';

const RUNNER = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = process.env.TRUSTSHELL_MCP_ROOT;
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
require(path.join(root, 'src', 'mcp', 'index.ts')).main();
`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

describe('mcp remember bearer refusal', () => {
  jest.setTimeout(60000);

  it('refuses Authorization: Bearer tokens and keeps them out of every surface', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-mcp-bearer-'));
    const runner = join(dir, 'mcp-stdio.cjs');
    const db = join(dir, 'memory.sqlite');
    writeFileSync(runner, RUNNER);
    const bodies: string[] = [];
    const stderr: string[] = [];
    const http = createHttp(async (req, res) => {
      bodies.push(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
    const address = http.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [runner],
      cwd: ROOT,
      stderr: 'pipe',
      env: {
        TRUSTSHELL_MCP_ROOT: ROOT,
        TRUSTSHELL_MEMORY: db,
        TRUSTSHELL_API_URL: `http://127.0.0.1:${port}`,
      },
    });
    transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
    const client = new Client({ name: 'trustshell-remember-bearer', version: '0.0.0' });
    try {
      await client.connect(transport);

      const refused = await client.callTool({
        name: 'remember',
        arguments: { text: BEARER_NOTE },
      });
      const refusedPacked = JSON.stringify(refused);
      expect(refused.isError === true || refusedPacked.includes('remember refused')).toBe(true);
      expect(refusedPacked).not.toContain(TOKEN);

      const recalled = await client.callTool({ name: 'recall', arguments: {} });
      expect(JSON.stringify(recalled)).not.toContain(TOKEN);

      expect(stderr.join('')).not.toContain(TOKEN);
      expect(bodies.join('\n')).not.toContain(TOKEN);

      const stored = existsSync(db) ? readFileSync(db) : Buffer.alloc(0);
      expect(stored.includes(TOKEN)).toBe(false);
    } finally {
      await client.close().catch(() => undefined);
      await new Promise<void>((resolve) => http.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts innocent Bearer phrases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-mcp-bearer-innocent-'));
    const runner = join(dir, 'mcp-stdio.cjs');
    const db = join(dir, 'memory.sqlite');
    writeFileSync(runner, RUNNER);
    const stderr: string[] = [];
    const http = createHttp(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
    const address = http.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [runner],
      cwd: ROOT,
      stderr: 'pipe',
      env: {
        TRUSTSHELL_MCP_ROOT: ROOT,
        TRUSTSHELL_MEMORY: db,
        TRUSTSHELL_API_URL: `http://127.0.0.1:${port}`,
      },
    });
    transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
    const client = new Client({ name: 'trustshell-remember-bearer-innocent', version: '0.0.0' });
    try {
      await client.connect(transport);

      const accepted = await client.callTool({
        name: 'remember',
        arguments: { text: INNOCENT_NOTE },
      });
      const acceptedPacked = JSON.stringify(accepted);
      expect(acceptedPacked).not.toContain('remember refused');
      expect(accepted.isError).not.toBe(true);

      const recalled = await client.callTool({ name: 'recall', arguments: {} });
      expect(JSON.stringify(recalled)).toContain(INNOCENT_NOTE);
    } finally {
      await client.close().catch(() => undefined);
      await new Promise<void>((resolve) => http.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
