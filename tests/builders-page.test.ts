/**
 * /builders shows three commands and no Paris, Rome, stake, wallet, or login.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/builders/page.tsx'), 'utf8').replace(/\r/g, '');

const COMMANDS = [
  'npm i -g @hyperdag/trustshell@1.5.0',
  'trustshell verify "paste your own claim"',
  'trustshell repid trinity-shofet',
];

function commandLines(text: string): string[] {
  return text.split('\n').map((line) => {
    let s = line.trim().replace(/,$/, '');
    if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
    return s;
  }).filter((s) => s.startsWith('npm ') || s.startsWith('trustshell '));
}

describe('/builders', () => {
  it('shows three commands only', () => {
    expect(commandLines(page)).toEqual(COMMANDS);
  });

  it('tells the user to copy the family host verdict line', () => {
    expect(page).toContain('After verify, copy the family host verdict line. That is the receipt.');
  });

  it('has no Paris, Rome, stake, wallet, or login', () => {
    expect(page).not.toMatch(/\b(Paris|Rome)\b/);
    expect(page).not.toMatch(/stake/i);
    expect(page).not.toMatch(/wallet/i);
    expect(page).not.toMatch(/\blogin\b|sign in|oauth/i);
    expect(page).not.toMatch(/HeyGen/i);
    expect(page).not.toMatch(/REAL_STAKING/);
  });
});
