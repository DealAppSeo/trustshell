import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const doc = readFileSync(join(__dirname, '../docs/FIRST_PASS.md'), 'utf8');

describe('first-pass doc', () => {
  it('cites the honesty-a route and leaves a missing post-HAL column as NOT_CHECKED', () => {
    expect(doc).toContain('GET /api/v1/hal/honesty-a');
    expect(doc).toContain('hal_quorum_validator_votes');
    expect(doc).toContain('family');
    expect(doc).toContain('provider');
    expect(doc).toContain('verdict');
    expect(doc).toContain('status: NOT_CHECKED');
    expect(doc).toContain('rows: null');
    expect(doc).toContain('not a count of 0');
    expect(doc).toContain('post-HAL stays NOT_CHECKED');
    expect(doc).toContain('trustshell status');
    expect(doc).toContain('Staking is not live');
    expect(doc).not.toMatch(/first_pass|post_hal/);
    expect(doc).not.toMatch(/stake now/i);
    expect(doc).not.toMatch(/\bstaking is live\b/i);
  });
});
