/**
 * PyPI API tokens (`pypi-...`) must be refused by the shared `refusedValue`
 * helper. The token must not appear in the sqlite file or in any thrown error.
 * Innocent phrases containing "pypi-" as a prefix still pass through.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusedValue, rememberKey } from '../src/cli/remember';
import { rememberLocal } from '../src/mcp/memory';

const TOKEN = 'pypi-AgEIcHlwaS5vcmcCJDdjYWNiYGNkZS1lMmZmLTQwMzUtOTRiMi1mM2YxYWQwZDA2NDkAAkl0LXN1Y2tzLWZha2U';
const INNOCENT = 'pypi- is a fun prefix for package names';

describe('remember refuses PyPI API tokens', () => {
  let dir = '';
  let db = '';
  const prevMemory = process.env.TRUSTSHELL_MEMORY;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-remember-pypi-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
    rmSync(dir, { recursive: true, force: true });
  });

  it('recognises pypi- token shapes as secret-shaped', () => {
    expect(refusedValue(TOKEN)).toBe(true);
    expect(refusedValue(`token ${TOKEN} more`)).toBe(true);
  });

  it('does not reject innocent pypi- phrases', () => {
    expect(refusedValue(INNOCENT)).toBe(false);
    expect(refusedValue('pypi-publish action')).toBe(false);
  });

  it('rememberKey returns false and writes nothing', () => {
    expect(rememberKey('api_token', TOKEN)).toBe(false);
    expect(existsSync(db)).toBe(false);
  });

  it('MCP rememberLocal throws and writes nothing', () => {
    expect(() => rememberLocal(TOKEN)).toThrow('remember refused');
    expect(existsSync(db)).toBe(false);
  });

  it('does not leak the token into the sqlite file when refused', () => {
    rememberKey('api_token', TOKEN);
    expect(() => rememberLocal(TOKEN)).toThrow('remember refused');
    const stored = existsSync(db) ? readFileSync(db) : Buffer.alloc(0);
    expect(stored.includes(TOKEN)).toBe(false);
    expect(stored.toString('utf8')).not.toContain('pypi-AgEI');
  });
});
