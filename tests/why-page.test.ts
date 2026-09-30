import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/why/page.tsx'), 'utf8').replace(/\r/g, '');

const LINES = [
  'It lies. Check the last answer. Get a receipt.',
  'They train on you. Notes stay on your machine.',
  'One company owns the chat. You can switch models.',
  'Agents act without you. Autonomy is earned.',
];

describe('/why', () => {
  it('shows the four lines and nothing else in the copy block', () => {
    const block = page.slice(page.indexOf('const LINES = ['), page.indexOf('];'));
    expect(block.match(/'[^']+'/g)).toEqual(LINES.map((line) => `'${line}'`));
  });

  it('has no zk, stake, ERC-8004, plonky, or sqlite', () => {
    for (const word of ['zk', 'stake', 'erc-8004', 'plonky', 'sqlite']) {
      expect(page.toLowerCase()).not.toContain(word);
    }
    expect(page).not.toMatch(/HeyGen/i);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
  });
});
