/**
 * Why is linked from /more. It is not on the first paint of /.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const more = readFileSync(join(ROOT, 'app/more/page.tsx'), 'utf8').replace(/\r/g, '');
const home = [
  readFileSync(join(ROOT, 'app/page.tsx'), 'utf8'),
  readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8'),
].join('\n');

describe('Why link', () => {
  it('links Why from /more and keeps it off the first paint', () => {
    expect(more).toContain('href="/why"');
    expect(more).toMatch(/>\s*Why\s*</);
    expect(home).not.toContain('/why');
    expect(home).not.toMatch(/\bWhy\b/);
  });
});
