/**
 * The popup: the privacy line first, then how to check a selection, the way to Your TrustShell,
 * and the agent box. It shows no stamp of its own.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLAIM = 'Caught. This reply did not pass.';

describe('extension popup', () => {
  it('names where the text goes before anything else, and shows no stamp', () => {
    const html = readFileSync(join(__dirname, '../extension/popup.html'), 'utf8');
    expect(html).not.toContain(CLAIM);
    expect(html).not.toContain('Caught');
    expect(html).not.toContain('popup-line');
    expect(html).toContain('The reply text is sent to our checkers, Groq and Cerebras');
    expect(html.indexOf('popup-privacy')).toBeLessThan(html.indexOf('agent-form'));
  });

  it('links to Your TrustShell, the Options page', () => {
    const html = readFileSync(join(__dirname, '../extension/popup.html'), 'utf8');
    expect(html).toContain('<a href="options.html" target="_blank">Your TrustShell</a>');
    expect(html.indexOf('popup-privacy')).toBeLessThan(html.indexOf('popup-options'));
  });
});
