/**
 * The default home panel does not show npm. The chat button names the four clients.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '..', 'components', 'hero.tsx'), 'utf8');

describe('default home panel', () => {
  it('has no npm until a later panel, and the chat button names the clients', () => {
    const start = hero.indexOf('return (');
    const terminal = hero.indexOf("panel === 'terminal'");
    expect(start).toBeGreaterThan(-1);
    expect(terminal).toBeGreaterThan(start);
    const visible = hero.slice(start, terminal);
    expect(visible).not.toMatch(/npm/);
    expect(visible).toContain('Claude, ChatGPT, Grok, Cursor');
    expect(visible).toContain('Check a claim in the chat you already use');
  });
});
