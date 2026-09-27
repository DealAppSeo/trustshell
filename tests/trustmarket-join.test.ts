import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('TrustMarket join draft', () => {
  const doc = readFileSync(join(ROOT, 'docs/TRUSTMARKET_JOIN.md'), 'utf8');

  it('keeps the join flag off and is not a live listing', () => {
    expect(doc).toContain('A portable trust harness. Autonomy is earned.');
    expect(doc).toMatch(/The join flag is off/);
    expect(doc).toMatch(/It is not a live listing/);
    expect(doc).not.toMatch(/join flag is on/i);
    expect(doc).not.toMatch(/listing is live/i);
    expect(doc).not.toMatch(/stake now|staking is live/i);
    expect(doc).not.toMatch(/HeyGen/i);
    expect(doc).not.toMatch(/wallet/i);
  });
});
