/**
 * The CMO publisher may import mockBackend only. A live social adapter fails the test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['@opencoredev/social-sdk', '@opencoredev/social-sdk/testing']);
const script = readFileSync(join(__dirname, '../scripts/cmo-mock-publish.mjs'), 'utf8');

describe('cmo mockBackend only', () => {
  it('fails if a live social adapter is imported', () => {
    const specs = [...script.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs).toContain('@opencoredev/social-sdk/testing');
    expect(script).toContain('mockBackend');
    expect(specs.filter((spec) => !ALLOWED.has(spec))).toEqual([]);
    expect(script).not.toMatch(/linkedin-api|tiktok-api|googleapis|twitter-api|snoowrap/i);
  });
});
