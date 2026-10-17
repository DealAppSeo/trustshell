/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not the job, with the second-opinion line directly under it', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(h1).not.toBeNull();
    // 2026-10-16 (Sean: "what is this and why should I care, jobs to be done"): the h1 is job 1, the
    // second opinion the site has always promised. It does not say "know if it is right": two models
    // agreeing is not the truth (2026-10-06), and a check can come back Not checked. "AI lies." moved
    // to the why section (components/home-questions.tsx).
    expect((h1?.[1] ?? '').trim()).toBe('Get a second opinion before you use an AI answer.');
    expect((h1?.[3] ?? '').trim()).toBe('Paste the answer. Two other AIs check it, and you see what each one said.');
    expect(h1?.[1] ?? '').not.toMatch(/\b(truth|right|correct|accurate)\b/i);
    // No "stake": the model that wrote a chat reply has no RepID and stakes nothing.
    expect(h1?.[3] ?? '').not.toMatch(/\bstakes?\b/i);
    expect(hero).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/every transaction earns RepID/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO/);
  });
});
