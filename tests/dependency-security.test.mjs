import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('a bounded array rejects oversize before walking elements (GHSA-mrhx-c7xc-m3w5)', () => {
  let visited = 0;
  const schema = z.array(z.string().refine(() => { visited++; return true; })).max(2);
  const result = schema.safeParse(Array(1000).fill('item'));
  assert.equal(result.success, false);
  assert.equal(visited, 0, 'oversize input must not run a per-element check');
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});

test('size rejection does not suppress ordinary valid or invalid element validation', () => {
  const schema = z.array(z.string()).max(2);
  assert.deepEqual(schema.parse(['one', 'two']), ['one', 'two']);
  assert.equal(schema.safeParse([42]).success, false);
});

test('TrustShell string-shaped tool inputs remain compatible after the dependency update', () => {
  const schema = z.object({ run_url: z.string().min(1).max(2048), claims: z.string().min(1).max(256 * 1024) });
  assert.equal(schema.safeParse({ run_url: 'https://github.com/o/r/actions/runs/1', claims: 'run 1' }).success, true);
  assert.equal(schema.safeParse({ run_url: '', claims: 'run 1' }).success, false);
  assert.equal(schema.safeParse({ run_url: 'x'.repeat(2049), claims: 'run 1' }).success, false);
});

test('the real built MCP server still initializes, lists 21 tools and refuses an invalid Inspect URL', { timeout: 30000 }, async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const home = mkdtempSync(join(tmpdir(), 'trustshell-dependency-'));
  const env = { TRUSTSHELL_HOME: home, TRUSTSHELL_MEMORY: join(home, 'memory.sqlite') };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'dist/mcp/index.js')], cwd: root, env, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'dependency-regression', version: '1' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 21);
    assert.ok(tools.tools.some(t => t.name === 'inspect_run'));
    assert.ok(tools.tools.some(t => t.name === 'check_claim'));
    const result = await client.callTool({ name: 'inspect_run', arguments: { run_url: 'https://example.invalid/no-run', claims: 'run 1' } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /refused/);
  } finally {
    await client.close();
    await transport.close();
    rmSync(home, { recursive: true, force: true });
  }
});
