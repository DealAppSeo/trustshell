/**
 * The toolbar icon opens a popup. The manifest used to have no "action", so a click did nothing.
 * The popup says what is true today, in under 80 visible words, and it does not show the old
 * popup line: nothing has written that line since the classify path landed.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function visibleWords(html: string): string[] {
  const noCode = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noCode
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, ' ');
  return text.split(/\s+/).filter(Boolean);
}

describe('toolbar popup', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8')) as {
    action?: { default_popup?: string; default_title?: string };
  };
  const html = readFileSync(join(ROOT, 'extension/popup.html'), 'utf8');
  const words = visibleWords(html);

  it('the icon opens popup.html', () => {
    expect(manifest.action && manifest.action.default_popup).toBe('popup.html');
    expect(html).toContain('id="popup-privacy"');
    expect(html).toContain('id="agent-form"');
  });

  it('says what is true today, in under 80 visible words', () => {
    expect(words.length).toBeLessThan(80);
    expect(words.length).toBeGreaterThan(0);
    const text = words.join(' ');
    expect(text).toContain('The reply text is sent to our checkers, Groq and Cerebras');
    expect(text).toContain('after the reply is on screen');
    expect(text).toContain('not stored');
    expect(text).toContain('Do not paste secrets');
    expect(text).toContain('Right-click any page and choose Check with TrustShell');
    expect(text).toContain("Check an agent's RepID");
  });

  it('does not show a stored machine label, and does not invent a verdict', () => {
    expect(html).not.toContain('popup-line');
    expect(html).not.toMatch(/src="popup\.js"/);
    const text = words.join(' ');
    expect(text).not.toContain('Checks out');
    expect(text).not.toContain('Caught');
    expect(text).not.toMatch(/filtered before it reaches you/i);
    expect(text).not.toMatch(/private by default/i);
    expect(text).not.toMatch(/\bLaya\b/);
    expect(text).not.toMatch(/\bJev\b/);
    expect(text).not.toMatch(/receipt/i);
    expect(text).not.toMatch(/\d+\s*%/);
  });
});
