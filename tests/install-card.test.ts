/**
 * The install card does not contain stake now.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('install card', () => {
  it('the card does not contain stake now', () => {
    const html = readFileSync(join(__dirname, '../public/install.html'), 'utf8');
    const start = html.indexOf('class="site-card"');
    const end = html.indexOf('</article>');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const card = html.slice(start, end).toLowerCase();
    expect(card).not.toContain('stake');
    expect(card).not.toContain('wallet');
  });
});
