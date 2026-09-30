/**
 * The claim pack runs the eight local fixture claims.
 * OFFLINE=1 prints NOT_CHECKED for each and exits 0.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const script = readFileSync(join(ROOT, 'scripts/e2e-claim-pack.mjs'), 'utf8').replace(/\r/g, '');

const CLAIMS = [
  'The capital of France is Paris.',
  'The chemical symbol for gold is Au.',
  'A triangle has three sides and three angles.',
  'DNA has a double-helix structure discovered by Watson and Crick.',
  'Mount Everest is the highest mountain above sea level on Earth.',
  'The human body has 206 bones in adulthood.',
  'Water boils at 100°C at standard atmospheric pressure.',
  'Pluto is a planet.',
];

describe('e2e claim pack', () => {
  it('keeps eight local claims and does not use Paris as the only demo', () => {
    for (const claim of CLAIMS) expect(script).toContain(claim);
    expect(script.match(/^\s+'[^']+',$/gm)).toHaveLength(8);
    expect(CLAIMS.filter((claim) => claim.includes('Paris'))).toHaveLength(1);
    expect(script).not.toMatch(/HeyGen|\bstake\b/i);
  });

  it('prints NOT_CHECKED for every claim when OFFLINE=1 and exits 0', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/e2e-claim-pack.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, OFFLINE: '1' },
    });
    expect(result.status).toBe(0);
    expect((result.stdout ?? '').replace(/\r/g, '').trim().split('\n')).toEqual(CLAIMS.map(() => 'NOT_CHECKED'));
  });
});
