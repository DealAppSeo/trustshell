import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/devs/page.tsx'), 'utf8').replace(/\r/g, '');

const LINES = [
  'Terminal is a text window that runs a command.',
  'GitHub is undo-history for a project you can share.',
];

describe('/devs', () => {
  it('says what a terminal and GitHub are, then lists the two repos', () => {
    let at = -1;
    for (const line of LINES) {
      const next = page.indexOf(line);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    const trustshell = page.indexOf('DealAppSeo/trustshell');
    const engine = page.indexOf('DealAppSeo/repid-engine');
    expect(trustshell).toBeGreaterThan(at);
    expect(engine).toBeGreaterThan(trustshell);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).not.toMatch(/stake now/i);
    expect(page).not.toMatch(/oauth|HeyGen/i);
  });
});
