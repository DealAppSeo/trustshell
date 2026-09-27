import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const doc = readFileSync(join(__dirname, '../docs/FILM_INBOX.md'), 'utf8');

describe('film inbox', () => {
  it('lists screenshot slots from 01-lie through 07-headline', () => {
    const slots = ['01-lie', '02-caught', '03-receipt', '04 NOT_CHECKED', '05 NOT_CHECKED', '06 NOT_CHECKED', '07-headline'];
    let at = -1;
    for (const slot of slots) {
      const next = doc.indexOf(slot);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(doc.match(/^\d+\. /gm)).toHaveLength(7);
    expect(doc).not.toMatch(/HeyGen/i);
    expect(doc).not.toMatch(/stake now|staking is live|mainnet stake/i);
  });
});
