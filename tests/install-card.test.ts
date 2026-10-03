/**
 * The install page does not contain stake now.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STEPS = [
  'git pull',
  'chrome://extensions',
  'Developer mode',
  'Load unpacked',
  'pick the extension folder',
];

const HOSTS = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'grok.com', 'chat.deepseek.com'];

describe('install card', () => {
  it('the page does not contain stake now', () => {
    const html = readFileSync(join(__dirname, '../public/install.html'), 'utf8');
    const page = html.toLowerCase();
    expect(page).not.toContain('stake');
    expect(page).not.toContain('wallet');
    for (const step of STEPS) expect(html).toContain(step);
    for (const host of HOSTS) expect(page).toContain(host);
  });

  // The reply leaves the browser. A tester is told before the steps, on both install surfaces.
  const SENT = 'the text of that reply is sent to the classifier';

  it('both install surfaces say the reply is sent, before the first step', () => {
    const html = readFileSync(join(__dirname, '../public/install.html'), 'utf8');
    const readme = readFileSync(join(__dirname, '../extension/README.md'), 'utf8');
    expect(html).toContain(SENT);
    expect(readme).toContain(SENT);
    expect(html.indexOf(SENT)).toBeLessThan(html.indexOf('<ol>'));
    expect(readme.indexOf(SENT)).toBeLessThan(readme.indexOf('chrome://extensions'));
  });

  it('the install card does not say HAL checks the stamp', () => {
    const html = readFileSync(join(__dirname, '../public/install.html'), 'utf8');
    expect(html).not.toMatch(/HAL checks the reply/);
  });
});
