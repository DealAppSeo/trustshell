/**
 * MCP remember and recall stay on a temp sqlite file.
 * The note body is not passed to an LLM helper.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';
import { listNotes, readKeyed, writeKeyed } from '../src/memory/local-store';

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
    // Immune system v0: a note written through MCP is untrusted and quarantined.
    expect(JSON.parse(remembered.content[0].text)).toEqual({
      kind: 'note',
      remembered: true,
      id: 1,
      provenance: 'untrusted',
      quarantined: true,
      reason: 'untrusted: not yet checked',
      source_recorded: false,
    });
    expect(listNotes(db)).toEqual([]);
    const all = listNotes(db, process.env, { includeQuarantined: true });
    expect(all.map((row) => row.kind)).toEqual(['note']);
    expect(all.map((row) => row.body)).toEqual(['ship the receipt']);
    expect(all[0]?.source).toBe('mcp:remember');

    const recalled = await getTool(server, 'recall').handler({});
    expect(JSON.parse(recalled.content[0].text)).toEqual({
      notes: 'do_not_send COUNT 0\nquarantined COUNT 1 (trustshell quarantine list)',
    });
    const withHeld = await getTool(server, 'recall').handler({ include_quarantined: true });
    expect(JSON.parse(withHeld.content[0].text)).toEqual({
      notes: '[QUARANTINED: untrusted: not yet checked] ship the receipt\ndo_not_send COUNT 0',
    });
    expect(verifyOutput).not.toHaveBeenCalled();
  });

  // SEC F8: this tool deleted any operator key row for any connected agent. It is gone; the CLI keeps it.
  it('there is no redact over MCP, and the operator key row is still there', async () => {
    writeKeyed(db, 'desk', 'local only');
    const server = createServer({} as TrustShell) as unknown as {
      _registeredTools?: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
    };
    expect(() => getTool(server, 'redact')).toThrow('missing tool redact');
    expect(readKeyed(db, 'desk')).toBe('local only');
  });
});
