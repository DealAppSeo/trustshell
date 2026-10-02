/**
 * Keyed local memory. The real home sqlite file is never opened.
 * One-argument remember stays a note. Two arguments are key and value.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { memoryDbPath, readKeyed, writeKeyed } from '../src/memory/local-store';

const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');
const cliSrc = ['src/cli/remember.ts', 'src/cli/recall.ts', 'src/cli/redact-key.ts']
  .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
  .join('\n');

function homeStamp(): number | null {
  return existsSync(homeDb) ? statSync(homeDb).mtimeMs : null;
}

describe('keyed local memory', () => {
  const prev = process.env.TRUSTSHELL_MEMORY;
  const prevFetch = global.fetch;
  let dir = '';
  let db = '';
  let beforeHome: number | null = null;
  const calls: string[] = [];

  beforeEach(() => {
    beforeHome = homeStamp();
    dir = mkdtempSync(join(tmpdir(), 'ts-memory-kv-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
    calls.length = 0;
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('network');
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prev === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prev;
    rmSync(dir, { recursive: true, force: true });
    expect(homeStamp()).toBe(beforeHome);
  });

  async function go(argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIO = {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    };
    const code = await run(parseArgs(argv), {} as never, io);
    return { code, out, err };
  }

  it('stores a value, recalls it, and deletes the row', async () => {
    expect(cliSrc).not.toMatch(/\bPOST\b|fetch\(|https?:\/\//);

    const missing = await go(['recall', 'alpha']);
    expect(missing.code).toBe(0);
    expect(missing.out).toEqual(['NOT_CHECKED']);
    expect(missing.out[0]).not.toBe('');

    expect((await go(['remember', 'alpha', 'one'])).out).toEqual(['remembered']);
    expect((await go(['recall', 'alpha'])).out).toEqual(['one']);

    expect((await go(['remember', 'alpha', 'two', 'words'])).out).toEqual(['remembered']);
    expect((await go(['recall', 'alpha'])).out).toEqual(['two words']);

    expect((await go(['remember', 'ship the receipt'])).out).toEqual(['remembered']);
    const notes = await go(['recall']);
    expect(notes.out).toEqual(['ship the receipt\ndo_not_send COUNT 0']);
    expect(notes.out.join('\n')).not.toContain('two words');

    expect((await go(['redact', 'alpha'])).out).toEqual(['redacted']);
    expect((await go(['recall', 'alpha'])).out).toEqual(['NOT_CHECKED']);
    expect((await go(['redact', 'alpha'])).out).toEqual(['NOT_CHECKED']);
    expect((await go(['recall'])).out).toEqual(['ship the receipt\ndo_not_send COUNT 0']);
    expect(calls).toEqual([]);
  });

  it('a blank stored value is NOT_CHECKED, never an empty string', () => {
    writeKeyed(db, 'blank', '   ');
    const value = readKeyed(db, 'blank');
    expect(value).toBe('NOT_CHECKED');
    expect(value).not.toBe('');
    expect(readKeyed(db, 'missing')).toBe('NOT_CHECKED');
  });

  it('redact without a key is a usage error and does not create the file', async () => {
    const result = await go(['redact']);
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toMatch(/requires/);
    expect(existsSync(db)).toBe(false);
  });

  it('remember with a key and no value is a usage error', async () => {
    const result = await go(['remember', 'alpha', '']);
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toMatch(/requires/);
    expect(existsSync(db)).toBe(false);
  });

  it('the default file is under the user home, not this repo', () => {
    const fallback = memoryDbPath({ NODE_ENV: 'test' });
    expect(fallback).toBe(join(homedir(), '.trustshell', 'memory.sqlite'));
    const repo = join(__dirname, '..').toLowerCase();
    expect(fallback.toLowerCase().startsWith(repo)).toBe(false);
  });

  it('refuses a secret-shaped value and does not write or call out', async () => {
    expect(cliSrc).not.toMatch(/\bPOST\b|fetch\(|https?:\/\//);
    expect(cliSrc).not.toMatch(/HeyGen|stake/i);
    const secrets = ['sb_secret_FAKE', 'postgresql://fake:fake@localhost/db', 'prefix eyJhbGciOiJub25lIn0 suffix', 'xoxr-12345-abcdef', 'ghr_1234567890abcdef', 'glpat-1234567890abcdef', 'glrt-1234567890abcdef'];
    for (const value of secrets) {
      const result = await go(['remember', 'alpha', value]);
      expect(result.code).toBe(2);
      expect(result.out).toEqual([]);
      expect(result.err.join('\n')).toContain('remember refused');
      expect(result.err.join('\n')).not.toContain('sb_secret_');
      expect(result.err.join('\n')).not.toContain('postgresql://');
      expect(result.err.join('\n')).not.toContain('eyJ');
      expect(result.err.join('\n')).not.toContain('xoxr-');
      expect(result.err.join('\n')).not.toContain('ghr_');
      expect(result.err.join('\n')).not.toContain('glpat-');
      expect(result.err.join('\n')).not.toContain('glrt-');
    }
    expect(existsSync(db)).toBe(false);
    expect(calls).toEqual([]);

    expect((await go(['remember', 'alpha', 'sb_publishable_keep'])).code).toBe(0);
    expect((await go(['recall', 'alpha'])).out).toEqual(['sb_publishable_keep']);
    expect((await go(['redact', 'alpha'])).out).toEqual(['redacted']);
    expect((await go(['recall', 'alpha'])).out).toEqual(['NOT_CHECKED']);
    expect(calls).toEqual([]);
  });
});
