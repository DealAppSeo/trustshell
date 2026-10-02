import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusedValue, rememberKey } from '../src/cli/remember';
import { rememberLocal } from '../src/mcp/memory';
import { readKeyed } from '../src/memory/local-store';

const GLDT_TOKEN = 'gldt-fake-deploy-token-123456789';
const INNOCENT = 'my gldt- prefix is too short';

describe('remember gldt- refusal', () => {
  const prevMemory = process.env.TRUSTSHELL_MEMORY;
  let dir = '';
  let db = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-remember-gldt-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevMemory === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prevMemory;
  });

  it('refuses gldt- tokens through the shared helper', () => {
    expect(refusedValue(GLDT_TOKEN)).toBe(true);
    expect(refusedValue(INNOCENT)).toBe(false);
  });

  it('rememberKey returns false and writes nothing for a gldt- token', () => {
    expect(rememberKey('gitlab', GLDT_TOKEN)).toBe(false);
    expect(readKeyed(db, 'gitlab')).toBe('NOT_CHECKED');
  });

  it('rememberLocal throws remember refused without leaking the token', () => {
    let message = '';
    try {
      rememberLocal(GLDT_TOKEN);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe('remember refused');
    expect(message).not.toContain(GLDT_TOKEN);
  });
});
