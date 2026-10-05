/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not the first-screen line, with Now it has to show its work. directly under it', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(h1).not.toBeNull();
    // Sean said GO 2026-10-05: lead with the pain, not the mechanism. Not "AI lies": a lie claims intent.
    expect((h1?.[1] ?? '').trim()).toBe('AI sounds sure. It is often wrong.');
    expect((h1?.[3] ?? '').trim()).toBe('Now it has to show its work.');
    expect(h1?.[1] ?? '').not.toMatch(/\blies\b/i);
    expect(hero).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/every transaction earns RepID/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO/);
  });
});
