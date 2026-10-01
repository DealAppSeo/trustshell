/**
 * trustshell remember writes a note. trustshell recall lists those notes.
 * The database is a temp file. The home sqlite file is never opened.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { listNotes } from '../src/memory/local-store';

const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
const rememberSrc = readFileSync(join(__dirname, '../src/cli/remember.ts'), 'utf8');
const recallSrc = readFileSync(join(__dirname, '../src/cli/recall.ts'), 'utf8');

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

describe('cli remember and recall', () => {
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  let dir = '';
  let db = '';
  let beforeHome: number | null = null;
  const calls: string[] = [];

  beforeEach(() => {
    beforeHome = homeStamp();
    dir = mkdtempSync(join(tmpdir(), 'ts-cli-memory-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
    calls.length = 0;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${String(input)}`);
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

  it('writes note rows and lists them from the temp dir', async () => {
    expect(db.startsWith(dir)).toBe(true);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(db).not.toBe(homeDb);
    expect(`${rememberSrc}\n${recallSrc}`).not.toMatch(/\bPOST\b|fetch\(|https?:\/\//);
    expect(`${rememberSrc}\n${recallSrc}`).not.toMatch(/stake live|stake now/i);

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    expect(await run(parseArgs(['remember', 'ship the receipt']), {} as never, io)).toBe(0);
    expect(await run(parseArgs(['remember', 'then look at it']), {} as never, io)).toBe(0);
    expect(out).toEqual(['remembered', 'remembered']);

    const notes = listNotes(db);
    expect(notes.map((row) => row.kind)).toEqual(['note', 'note']);
    expect(notes.map((row) => row.body)).toEqual(['ship the receipt', 'then look at it']);

    out.length = 0;
    expect(await run(parseArgs(['recall']), {} as never, io)).toBe(0);
    expect(out).toEqual(['ship the receipt\nthen look at it\ndo_not_send COUNT 0']);
    expect(calls).toEqual([]);
    expect(existsSync(homeDb) ? statSync(homeDb).mtimeMs : null).toBe(beforeHome);
  });

  it('refuses sk- API key shapes and does not store them', async () => {
    const sk = 'sk-proj-abc123def456ghi789jkl012mno345pq';
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIO = {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    };
    expect(await run(parseArgs(['remember', `token ${sk}`]), {} as never, io)).toBe(2);
    expect(err).toContain('remember refused');
    expect(out).toEqual([]);
    expect(listNotes(db)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
