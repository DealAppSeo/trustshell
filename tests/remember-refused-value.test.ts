/**
 * Shared refusedValue helper refuses Slack app tokens (xoxa-).
 * The CLI remember path returns false and never prints the token.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { refusedValue } from '../src/cli/remember';

describe('refusedValue xoxa- Slack app tokens', () => {
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  let dir = '';
  let db = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-remember-xoxa-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses xoxa- app tokens and never writes or prints them', async () => {
    const token = 'xoxa-123456789012-123456789012-abc123';
    expect(refusedValue(token)).toBe(true);
    expect(refusedValue(`prefix ${token} suffix`)).toBe(true);
    expect(refusedValue('innocent text')).toBe(false);

    const out: string[] = [];
    const err: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
    const code = await run(parseArgs(['remember', 'alpha', token]), {} as never, io);
    expect(code).toBe(2);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('remember refused');
    expect(err.join('\n')).not.toContain(token);
    expect(err.join('\n')).not.toContain('xoxa-');
    expect(existsSync(db)).toBe(false);
  });
});
