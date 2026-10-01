/**
 * The landing has no wallet field and no stake-now string.
 * This test reads the page. It does not change it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FILES = ['app/page.tsx', 'components/hero.tsx'];

describe('landing wallet field', () => {
  it('has no wallet field and no stake-now string', () => {
    const text = FILES.map((rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '')).join('\n');
    const lower = text.toLowerCase();
    expect(lower).not.toContain('stake-now');
    expect(lower).not.toContain('stake now');
    expect(text).not.toMatch(/<(input|textarea|select)\b[^>]*\bwallet\b/i);
    expect(lower).not.toContain('wallet field');
  });
});
