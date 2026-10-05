/**
 * TRUSTSHELL_MEMORY_ENCRYPT=on seals what remember writes. Until 2026-10-05 src/memory/encrypt.ts
 * existed and nothing called it, so setting the flag stored every note in plain text.
 *
 * These read the sqlite file directly, because "recall shows the note" proves nothing about what
 * sits on disk. The home folder is never opened; every file is a temp file.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { recallKey, recallNotes } from '../src/cli/recall';
import { rememberKey, rememberNote } from '../src/cli/remember';
import { recallLocal, rememberLocal } from '../src/mcp/memory';
import { SEALED_NO_KEY, SEALED_PREFIX, SEALED_WRONG_KEY } from '../src/memory/encrypt';
import { TrustShell } from '../src/lib/trustshell';

type Db = { prepare(sql: string): { all(): Record<string, unknown>[]; run(...p: unknown[]): unknown }; close(): void };
const { DatabaseSync } = createRequire(__filename)('node:sqlite') as { DatabaseSync: new (p: string) => Db };

function rawBodies(path: string): string[] {
  const db = new DatabaseSync(path);
  try {
    return db.prepare('SELECT body FROM memory ORDER BY id').all().map((r) => String(r.body));
  } finally {
    db.close();
  }
}

const NOTE = 'the venue moved to Hall B';
/** A bare environment. Next's types make NODE_ENV required on ProcessEnv; these tests do not need it. */
const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as unknown as NodeJS.ProcessEnv;
const ON = (db: string, key = 'correct horse battery staple'): NodeJS.ProcessEnv =>
  env({ TRUSTSHELL_MEMORY: db, TRUSTSHELL_MEMORY_ENCRYPT: 'on', TRUSTSHELL_MEMORY_KEY: key });

describe('memory encryption, on', () => {
  let dir = '';
  let db = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-memory-enc-'));
    db = join(dir, 'memory.sqlite');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('a note is sealed on disk and reads back with the key', () => {
    rememberNote(NOTE, ON(db));
    const [body] = rawBodies(db);
    expect(body!.startsWith(SEALED_PREFIX)).toBe(true);
    expect(body).not.toContain('venue');
    expect(readFileSync(db).includes(Buffer.from('Hall B'))).toBe(false);
    expect(recallNotes(ON(db))).toBe(`${NOTE}\ndo_not_send COUNT 0`);
  });

  it('the same note sealed twice differs (random IV)', () => {
    rememberNote(NOTE, ON(db));
    rememberNote(NOTE, ON(db));
    const [a, b] = rawBodies(db);
    expect(a).not.toBe(b);
  });

  it('flag on with no key refuses the write: nothing reaches the file', () => {
    const noKey = env({ TRUSTSHELL_MEMORY: db, TRUSTSHELL_MEMORY_ENCRYPT: 'on' });
    expect(() => rememberNote(NOTE, noKey)).toThrow(/TRUSTSHELL_MEMORY_KEY missing/);
    expect(() => rememberKey('venue', 'Hall B', noKey)).toThrow(/TRUSTSHELL_MEMORY_KEY missing/);
    expect(rawBodies(db)).toEqual([]);
  });

  it('without the key, recall shows a placeholder, never the ciphertext', () => {
    rememberNote(NOTE, ON(db));
    const out = recallNotes(env({ TRUSTSHELL_MEMORY: db }));
    expect(out).toBe(`${SEALED_NO_KEY}\ndo_not_send COUNT 0`);
    expect(out).not.toContain(SEALED_PREFIX);
  });

  it('with the wrong key, recall says the key does not open it', () => {
    rememberNote(NOTE, ON(db));
    expect(recallNotes(ON(db, 'wrong password'))).toBe(`${SEALED_WRONG_KEY}\ndo_not_send COUNT 0`);
  });

  it('a tampered body does not open', () => {
    rememberNote(NOTE, ON(db));
    const raw = new DatabaseSync(db);
    const [body] = raw.prepare('SELECT body FROM memory').all().map((r) => String(r.body));
    const flipped = body!.slice(0, -2) + (body!.endsWith('A=') ? 'B=' : 'A=');
    raw.prepare('UPDATE memory SET body = ?').run(flipped);
    raw.close();
    expect(recallNotes(ON(db))).toBe(`${SEALED_WRONG_KEY}\ndo_not_send COUNT 0`);
  });

  it('turning the flag off keeps old notes readable with the key, and new notes are plain', () => {
    rememberNote(NOTE, ON(db));
    const off = env({ TRUSTSHELL_MEMORY: db, TRUSTSHELL_MEMORY_KEY: 'correct horse battery staple' });
    rememberNote('plain one', off);
    const [sealed, plain] = rawBodies(db);
    expect(sealed!.startsWith(SEALED_PREFIX)).toBe(true);
    expect(plain).toBe('plain one');
    expect(recallNotes(off)).toBe(`${NOTE}\nplain one\ndo_not_send COUNT 0`);
  });

  it('notes written before the flag stay readable after it is turned on', () => {
    rememberNote('written before', env({ TRUSTSHELL_MEMORY: db }));
    rememberNote(NOTE, ON(db));
    expect(recallNotes(ON(db))).toBe(`written before\n${NOTE}\ndo_not_send COUNT 0`);
  });

  it('each memory file has its own salt', () => {
    const other = join(dir, 'other.sqlite');
    rememberNote(NOTE, ON(db));
    rememberNote(NOTE, ON(other));
    const salt = (p: string) => {
      const raw = new DatabaseSync(p);
      try {
        return String(raw.prepare("SELECT v FROM memory_meta WHERE k = 'salt'").all()[0]?.v);
      } finally {
        raw.close();
      }
    };
    expect(salt(db)).not.toBe(salt(other));
    expect(Buffer.from(salt(db), 'base64')).toHaveLength(16);
  });

  it('a keyed value is sealed, and an unreadable one throws instead of returning a fake value', () => {
    expect(rememberKey('venue', 'Hall B', ON(db))).toBe(true);
    expect(rawBodies(db)[0]!.startsWith(SEALED_PREFIX)).toBe(true);
    expect(recallKey('venue', ON(db))).toBe('Hall B');
    expect(() => recallKey('venue', env({ TRUSTSHELL_MEMORY: db }))).toThrow(/encrypted: set TRUSTSHELL_MEMORY_KEY/);
    expect(() => recallKey('venue', ON(db, 'nope'))).toThrow(/does not open/);
    expect(recallKey('absent', ON(db))).toBe('NOT_CHECKED');
  });

  it('the MCP remember and recall tools use the same sealing', () => {
    rememberLocal(NOTE, ON(db));
    expect(rawBodies(db)[0]!.startsWith(SEALED_PREFIX)).toBe(true);
    expect(recallLocal(ON(db)).notes).toBe(`${NOTE}\ndo_not_send COUNT 0`);
    expect(recallLocal(env({ TRUSTSHELL_MEMORY: db })).notes).toBe(`${SEALED_NO_KEY}\ndo_not_send COUNT 0`);
  });

  describe('through the CLI', () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const k of ['TRUSTSHELL_MEMORY', 'TRUSTSHELL_MEMORY_ENCRYPT', 'TRUSTSHELL_MEMORY_KEY']) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
    function io(): CliIO & { lines: string[]; errs: string[] } {
      const lines: string[] = [];
      const errs: string[] = [];
      return { lines, errs, out: (s) => lines.push(s), err: (s) => errs.push(s) };
    }
    const client = () => new TrustShell({ apiUrl: 'http://unused.invalid' });

    it('remember with the flag on and no key fails with the reason, and writes nothing', async () => {
      Object.assign(process.env, env({ TRUSTSHELL_MEMORY: db, TRUSTSHELL_MEMORY_ENCRYPT: 'on' }));
      delete process.env.TRUSTSHELL_MEMORY_KEY;
      const out = io();
      const code = await run(parseArgs(['remember', NOTE]), client(), out);
      expect(code).not.toBe(0);
      expect(out.errs.join('\n')).toMatch(/TRUSTSHELL_MEMORY_KEY missing/);
      expect(out.lines).not.toContain('remembered');
      expect(rawBodies(db)).toEqual([]);
    });

    it('remember then recall round-trips with the key', async () => {
      Object.assign(process.env, ON(db));
      expect(await run(parseArgs(['remember', NOTE]), client(), io())).toBe(0);
      const out = io();
      expect(await run(parseArgs(['recall']), client(), out)).toBe(0);
      expect(out.lines[0]).toBe(`${NOTE}\ndo_not_send COUNT 0`);
    });
  });
});
