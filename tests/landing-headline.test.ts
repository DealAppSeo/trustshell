/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/page.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not the install-first promise', () => {
    // 2026-10-24 (Sean: "What do we want a visitor to do? ... download, install and try TrustShell"): the h1 says
    // what the tool does for a developer, and the page under it is one command and an install. It does not say
    // "truth" or "correct": a supported claim is narrow, and a check can come back Not checked.
    const h1 = page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect((h1?.[1] ?? '').trim()).toBe('Check what your AI agent did, not what it says it did.');
    expect(h1?.[1] ?? '').not.toMatch(/\b(truth|right|correct|accurate)\b/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO|stake now/i);
    expect(page).not.toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(page).not.toMatch(/every transaction earns RepID/i);
    expect(page.match(/<h1\b/g)).toHaveLength(1);
  });
});
