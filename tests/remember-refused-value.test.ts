/**
 * Unit tests for the shared refusedValue helper.
 * Secret-shaped values must be refused by both CLI remember and MCP remember.
 */
import { refusedValue, rememberKey } from '../src/cli/remember';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const homeDb = join(homedir(), '.trustshell', 'memory.sqlite');

describe('refusedValue', () => {
  it('refuses GitLab SCIM / service-account OAuth tokens (glsoat-...)', () => {
    expect(refusedValue('glsoat-12345678abcdef')).toBe(true);
    expect(refusedValue('prefix glsoat-12345678 suffix')).toBe(true);
  });

  it('does not refuse short or malformed glsoat-like strings', () => {
    expect(refusedValue('glsoat-12345')).toBe(false);
    expect(refusedValue('glsoat')).toBe(false);
    expect(refusedValue('glsoat_12345678')).toBe(false);
  });
});

describe('rememberKey glsoat refusal', () => {
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  let dir = '';
  let db = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-remember-glsoat-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns false and writes nothing for glsoat- tokens', () => {
    const token = 'glsoat-12345678abcdef';
    expect(rememberKey('gitlab', token)).toBe(false);
    expect(existsSync(db)).toBe(false);
  });
});
