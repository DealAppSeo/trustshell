/**
 * The popup line is pass, veto, or not-checked. No claim text.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLAIM = 'Caught. This reply did not pass.';

const popup = require('../extension/popup.js') as {
  popupLine: (word?: unknown) => string;
  render: (doc: { querySelector: (selector: string) => { textContent: string } | null }, word?: unknown) => string;
};

describe('extension popup', () => {
  it('shows pass, veto, or not-checked only', () => {
    const node = { textContent: '' };
    const doc = {
      querySelector(selector: string) {
        return selector === '#popup-line' ? node : null;
      },
    };
    expect(popup.popupLine('pass')).toBe('pass');
    expect(popup.popupLine('veto')).toBe('veto');
    expect(popup.popupLine('not-checked')).toBe('not-checked');
    expect(popup.render(doc, 'veto')).toBe('veto');
    expect(node.textContent).toBe('veto');
    expect(popup.render(doc, CLAIM)).toBe('not-checked');
    expect(node.textContent).toBe('not-checked');
    expect(node.textContent).not.toContain('Caught');
    expect(popup.render(doc, undefined)).toBe('not-checked');
    expect(popup.popupLine(undefined)).toBe('not-checked');
    expect(popup.render(doc, 0)).toBe('not-checked');
    expect(node.textContent).toBe('not-checked');
    expect(node.textContent).not.toBe('0');
    expect(popup.popupLine(0)).toBe('not-checked');
    expect(popup.popupLine('0')).toBe('not-checked');
    expect(popup.popupLine(0)).not.toBe(0);
    expect(popup.popupLine('0')).not.toBe('0');
    const html = readFileSync(join(__dirname, '../extension/popup.html'), 'utf8');
    expect(html).not.toContain(CLAIM);
    expect(html).not.toContain('Caught');
    expect(html).toContain('The reply text is sent to our checker, Groq');
    expect(html.indexOf('popup-privacy')).toBeLessThan(html.indexOf('popup-line'));
  });
});
