/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not AI lies., with the answer-to-other-models line directly under it', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(h1).not.toBeNull();
    // Sean said GO 2026-10-05: lead with the pain, not the mechanism. He chose "AI lies." the same day.
    expect((h1?.[1] ?? '').trim()).toBe('AI lies.');
    expect((h1?.[3] ?? '').trim()).toBe('Now it has to answer to other models, so the truth comes out.');
    // "answer to", not "stake": the model that wrote a chat reply has no RepID and stakes nothing.
    expect(h1?.[3] ?? '').not.toMatch(/\bstakes?\b/i);
    expect(hero).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/every transaction earns RepID/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO/);
  });
});
