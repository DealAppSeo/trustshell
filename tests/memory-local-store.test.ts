/**
 * Local sqlite memory. The real home folder is never opened.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import {
  countDoNotSend,
  formatRecall,
  insertMemory,
  listNotes,
  memoryDbPath,
} from '../src/memory/local-store';

const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

describe('local memory store', () => {
  const prev = process.env.TRUSTSHELL_MEMORY;
  let dir = '';
  let db = '';
  let beforeHome: number | null = null;

  beforeEach(() => {
    beforeHome = homeStamp();
    dir = mkdtempSync(join(tmpdir(), 'ts-memory-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prev;
    rmSync(dir, { recursive: true, force: true });
    expect(homeStamp()).toBe(beforeHome);
  });

  it('defaults to ~/.trustshell/memory.sqlite and honors a temp override', () => {
    expect(memoryDbPath({ NODE_ENV: 'test' }, join(dir, 'not-home'))).toBe(
      join(dir, 'not-home', '.trustshell', 'memory.sqlite'),
    );
    expect(memoryDbPath({ NODE_ENV: 'test', TRUSTSHELL_MEMORY: db }, homedir())).toBe(db);
    expect(existsSync(join(dir, 'not-home', '.trustshell', 'memory.sqlite'))).toBe(false);
  });

  it('remember writes a note and recall prints it, with do_not_send as a count', async () => {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    expect(await run(parseArgs(['remember', 'ship the receipt']), {} as never, io)).toBe(0);
    expect(await run(parseArgs(['remember', 'then look at it']), {} as never, io)).toBe(0);
    insertMemory(db, 'do_not_send', 'do-not-send-body', '2026-09-28T00:00:00.000Z');
    insertMemory(db, 'pref', 'pref-body', '2026-09-28T00:00:01.000Z');

    const notes = listNotes(db);
    expect(notes.map((row) => row.kind)).toEqual(['note', 'note']);
    expect(notes[0]?.body).toBe('ship the receipt');
    expect(notes[1]?.body).toBe('then look at it');
    expect(notes[0]?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(countDoNotSend(db)).toBe(1);

    out.length = 0;
    expect(await run(parseArgs(['recall']), {} as never, io)).toBe(0);
    const text = out.join('\n');
    expect(text).toBe(formatRecall(db));
    expect(text).toBe('ship the receipt\nthen look at it\ndo_not_send COUNT 1');
    expect(text).not.toContain('do-not-send-body');
    expect(text).not.toContain('pref-body');
  });

  it('remember without text is a usage error', async () => {
    const err: string[] = [];
    const io: CliIO = { out: () => undefined, err: (s) => err.push(s) };
    expect(await run(parseArgs(['remember']), {} as never, io)).toBe(2);
    expect(err.join('\n')).toMatch(/requires/);
    expect(existsSync(db)).toBe(false);
  });
});
