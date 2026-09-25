import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const block = readFileSync(join(ROOT, 'components/after-agent.tsx'), 'utf8');
const home = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

describe('after the three commands', () => {
  it('states the next step and links verify, repid, and proof', () => {
    expect(block).toContain(
      'You have an agent. Next: verify a claim it made. Then look at the receipt. Wallet and stake stay testnet / shadow.',
    );
    expect(block).toContain('/docs/api-reference#cli-verify');
    expect(block).toContain('/docs/api-reference#cli-repid');
    expect(block).toContain('/docs/api-reference#cli-proof');
    expect(block).not.toMatch(/\/start\/tailor|stake now/i);
    expect(home.indexOf('<AfterAgent />')).toBeGreaterThan(home.indexOf('<Hero'));
  });
});
