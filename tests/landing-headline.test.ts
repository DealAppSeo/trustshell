/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not the first-screen line, with Act when they pass. directly under it', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(h1).not.toBeNull();
    expect((h1?.[1] ?? '').trim()).toBe('Every answer gets checks you can see.');
    expect((h1?.[3] ?? '').trim()).toBe('Act when they pass.');
    expect(hero).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/every transaction earns RepID/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO/);
  });
});
