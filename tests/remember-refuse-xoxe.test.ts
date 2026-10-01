/**
 * Slack enterprise tokens (`xoxe-...`) must be refused by the shared helper
 * and by both CLI/MCP remember callers. The token must never be echoed.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusedValue, rememberKey } from '../src/cli/remember';
import { rememberLocal } from '../src/mcp/memory';

const TOKEN = 'xoxe-1-fake-enterprise-token-abcdef123456';
const INNOCENT = 'I am working on the xoxe redesign';

describe('refuse Slack enterprise xoxe- tokens', () => {
  let dir = '';
  let db = '';
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-remember-xoxe-'));
    db = join(dir, 'memory.sqlite');
    env = { ...process.env, TRUSTSHELL_MEMORY: db };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refusedValue detects xoxe- tokens and ignores innocent phrases', () => {
    expect(refusedValue(TOKEN)).toBe(true);
    expect(refusedValue(`prefix ${TOKEN} suffix`)).toBe(true);
    expect(refusedValue(INNOCENT)).toBe(false);
    expect(refusedValue('xoxe')).toBe(false);
    expect(refusedValue('abcxoxe-123')).toBe(false);
  });

  it('rememberKey returns false and writes nothing for xoxe- tokens', () => {
    expect(rememberKey('slack-token', TOKEN, env)).toBe(false);
    expect(existsSync(db)).toBe(false);
  });

  it('rememberLocal throws remember refused without echoing the token', () => {
    let message = '';
    try {
      rememberLocal(TOKEN, env);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe('remember refused');
    expect(message).not.toContain(TOKEN);
    expect(existsSync(db)).toBe(false);
  });
});
