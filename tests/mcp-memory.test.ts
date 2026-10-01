/**
 * MCP remember and recall stay on a temp sqlite file.
 * The note body is not passed to an LLM helper.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';
import { listNotes, writeKeyed } from '../src/memory/local-store';

const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
const src = ['src/mcp/memory.ts', 'src/mcp/index.ts']
  .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
  .join('\n');

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

function getTool(server: { _registeredTools?: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }> }, name: string) {
  const tool = server._registeredTools?.[name];
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe('mcp local memory', () => {
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  let dir = '';
  let db = '';
  let beforeHome: number | null = null;

  beforeEach(() => {
    beforeHome = homeStamp();
    dir = mkdtempSync(join(tmpdir(), 'ts-mcp-memory-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
    global.fetch = (async () => {
      throw new Error('network');
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
    rmSync(dir, { recursive: true, force: true });
    expect(homeStamp()).toBe(beforeHome);
  });

  it('remember writes a note and recall lists it without calling verify', async () => {
    expect(db.startsWith(tmpdir())).toBe(true);
    expect(db).not.toBe(homeDb);
    const memorySrc = readFileSync(join(__dirname, '../src/mcp/memory.ts'), 'utf8');
    expect(memorySrc).not.toMatch(/\bPOST\b|fetch\(|https?:\/\/|openai|anthropic|verifyOutput/);
    expect(memorySrc).not.toMatch(/stake live|stake now/i);
    expect(src).toContain('rememberLocal');

    const verifyOutput = jest.fn();
    const client = { verifyOutput } as unknown as TrustShell;
    const server = createServer(client) as unknown as {
      _registeredTools?: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
    };

    const remembered = await getTool(server, 'remember').handler({ text: 'ship the receipt' });
    expect(JSON.parse(remembered.content[0].text)).toEqual({ kind: 'note', remembered: true });
    expect(listNotes(db).map((row) => row.kind)).toEqual(['note']);
    expect(listNotes(db).map((row) => row.body)).toEqual(['ship the receipt']);

    const recalled = await getTool(server, 'recall').handler({});
    expect(JSON.parse(recalled.content[0].text)).toEqual({
      notes: 'ship the receipt\ndo_not_send COUNT 0',
    });
    expect(verifyOutput).not.toHaveBeenCalled();
  });

  it('redact deletes the keyed row and a missing key is NOT_CHECKED', async () => {
    writeKeyed(db, 'desk', 'local only');
    const server = createServer({} as TrustShell) as unknown as {
      _registeredTools?: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
    };
    const gone = await getTool(server, 'redact').handler({ key: 'desk' });
    expect(JSON.parse(gone.content[0].text)).toEqual({ result: 'redacted' });
    const missing = await getTool(server, 'redact').handler({ key: 'desk' });
    expect(JSON.parse(missing.content[0].text)).toEqual({ result: 'NOT_CHECKED' });
    expect(missing.content[0].text).not.toBe('');
  });
});
