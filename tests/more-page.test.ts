import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/more/page.tsx'), 'utf8').replace(/\r/g, '');

const LINES = [
  'Use any chat you already have.',
  'Keep notes on your machine.',
  'Name the assistant later.',
  'Teach it a job when you are ready.',
];

describe('/more', () => {
  it('shows the four lines in order', () => {
    let at = -1;
    for (const line of LINES) {
      const next = page.indexOf(line);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    const block = page.slice(page.indexOf('const LINES = ['), page.indexOf('];'));
    expect(block.match(/'[^']+'/g)).toEqual(LINES.map((line) => `'${line}'`));
  });

  it('names Startup/Enterprise once, outside the four lines', () => {
    expect(page).toContain('Startup/Enterprise comes later.');
    expect(page.split('Startup/Enterprise').length - 1).toBe(1);
    const block = page.slice(page.indexOf('const LINES = ['), page.indexOf('];'));
    expect(block).not.toMatch(/Startup|Enterprise/);
  });

  it('keeps ZKP, stake, ERC-8004, and a sqlite path off the page', () => {
    expect(page).not.toMatch(/zk/i);
    expect(page).not.toMatch(/stake/i);
    expect(page).not.toMatch(/ERC-8004/i);
    expect(page).not.toMatch(/plonky/i);
    expect(page).not.toMatch(/sqlite/i);
    expect(page).not.toMatch(/HeyGen/i);
  });
});
