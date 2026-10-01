import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const belt = readFileSync(join(ROOT, 'skills/belts/CFO.md'), 'utf8');

describe('CFO belt', () => {
  it('requires receipts and spend caps and blocks live stake claims', () => {
    expect(belt).toMatch(/receipt/i);
    expect(belt).toMatch(/spend cap/i);
    expect(belt).toMatch(/TrustShell-first/i);
    expect(belt).not.toMatch(/staking is live|stake now/i);
    expect(belt).toMatch(/REAL_STAKING/);
    expect(belt).toMatch(/HUMAN_AGENT_BIND/);
    expect(belt).toMatch(/spend cap/i);
  });
});
