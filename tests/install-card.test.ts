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
});
