/**
 * The public home source does not advertise stake, Market, or Leaderboard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('public home source', () => {
  it('has no stake now, no Market, and no Leaderboard', () => {
    const home = [
      readFileSync(join(ROOT, 'app/page.tsx'), 'utf8'),
      readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8'),
    ].join('\n');
    expect(home).not.toMatch(/stake now/i);
    expect(home).not.toContain('Market');
    expect(home).not.toContain('Leaderboard');
  });
});
