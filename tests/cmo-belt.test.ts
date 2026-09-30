/**
 * CMO belt names the local tools and stops before a live post.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const belt = readFileSync(join(__dirname, '../skills/belts/CMO.md'), 'utf8').replace(/\r/g, '');

describe('CMO belt', () => {
  it('lists OpenMontage, a Publora draft, n8n glue, and HITL before a live post', () => {
    expect(belt).toContain('OpenMontage (local, no paid key)');
    expect(belt).toContain('Publora draft');
    expect(belt).toContain('n8n glue');
    expect(belt).toContain('HITL before any live post');
    expect(belt).not.toMatch(/staking is live|stake now/i);
  });
});
