/**
 * CMO daily stays a checklist. A missing clip is NOT_CHECKED.
 * Publora stays a draft until a person publishes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const daily = readFileSync(join(__dirname, '../skills/belts/CMO-DAILY.md'), 'utf8').replace(/\r/g, '');

describe('CMO daily', () => {
  it('checks one inbox clip, drafts in Publora, and waits for a person', () => {
    expect(daily).toContain('One clip from E:\\TrustDisk\\video\\inbox if present, else skip with NOT_CHECKED.');
    expect(daily).toContain('Publora is a draft only.');
    expect(daily).toContain('HITL before publish.');
    expect(daily).toContain('TikTok Shop is later.');
    expect(daily).toContain('Do not invent a shop SKU.');
    expect(daily).toContain('No paid API.');
    expect(daily).not.toMatch(/staking is live|stake now/i);
    expect(daily).not.toMatch(/HeyGen/i);
    expect(daily).not.toMatch(/REAL_STAKING/);
    expect(daily).not.toMatch(/sku[-_: ]*[a-z0-9]{2,}/i);
  });
});
