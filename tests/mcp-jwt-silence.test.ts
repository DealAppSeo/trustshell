/**
 * MCP remember refuses an eyJ JWT over stdio and keeps it out of result, logs,
 * fetch bodies, and the local sqlite file.
 */
import { createServer as createHttp, type IncomingMessage } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = join(__dirname, '..');
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.faketoken';

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

describe('mcp jwt silence', () => {
  jest.setTimeout(60000);

  it('refuses remember containing an eyJ JWT and keeps the JWT out of all surfaces', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-mcp-jwt-'));
    const runner = join(dir, 'mcp-jwt.cjs');
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
    const client = new Client({ name: 'trustshell-jwt-silence', version: '0.0.0' });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'remember',
        arguments: { text: `note ${JWT}` },
      });
      const packed = JSON.stringify(result);
      expect(result.isError === true || packed.includes('remember refused')).toBe(true);
      expect(packed).not.toContain(JWT);
      expect(packed).not.toContain('eyJ');
      expect(bodies.join('\n')).not.toContain(JWT);
      expect(bodies.join('\n')).not.toContain('eyJ');
      expect(stderr.join('')).not.toContain(JWT);
      expect(stderr.join('')).not.toContain('eyJ');
      const recalled = await client.callTool({ name: 'recall', arguments: {} });
      expect(JSON.stringify(recalled)).not.toContain(JWT);
      expect(JSON.stringify(recalled)).not.toContain('eyJ');
      const stored = existsSync(db) ? readFileSync(db) : Buffer.alloc(0);
      expect(stored.includes(JWT)).toBe(false);
      expect(String(stored)).not.toContain('eyJ');
    } finally {
      await client.close().catch(() => undefined);
      await new Promise<void>((resolve) => http.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
