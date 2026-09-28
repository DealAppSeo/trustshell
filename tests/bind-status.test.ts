/**
 * Bind status keeps stake in shadow. It never says stake is live.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindStatus } from '../lib/bind-status';

const page = readFileSync(join(__dirname, '../app/bind/page.tsx'), 'utf8');

describe('bind status', () => {
  it('stays shadow when bind is on or off', () => {
    for (const on of [true, false]) {
      const status = bindStatus(on);
      expect(status.stake).toBe('shadow — not live');
      expect(status.stake).not.toBe('live');
      expect(status.can_bind).toBe(on ? 'true' : 'false');
      expect(JSON.stringify(status)).not.toMatch(/stake now|stake live/i);
    }
  });

  it('the bind page uses that shadow status', () => {
    expect(page).toContain('bindStatus(');
    expect(page).not.toMatch(/stake now|stake live|Stake is live/i);
  });
});
