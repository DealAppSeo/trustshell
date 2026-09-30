import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const block = readFileSync(join(ROOT, 'components/after-agent.tsx'), 'utf8');
const home = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const LINE =
  'Black box becomes a glass box you own. Other people can see the score. They cannot see what you asked.';

describe('after the three commands', () => {
  it('states the next step and links verify, repid, and proof', () => {
    expect(block).toContain(
      'You have an agent. Next: verify a claim it made. Then look at the receipt. Wallet and stake stay testnet / shadow.',
    );
    expect(block).toContain('/docs/api-reference#cli-verify');
    expect(block).toContain('/docs/api-reference#cli-repid');
    expect(block).toContain('/docs/api-reference#cli-proof');
    expect(block).not.toMatch(/\/start\/tailor|stake now/i);
    expect(home).not.toContain('<AfterAgent');
    expect(home).not.toMatch(/Wallet and stake/);
  });

  it('keeps the glass-box line on the after-register block and off the landing', () => {
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    const afterCreate = readFileSync(join(ROOT, 'app/after-create/page.tsx'), 'utf8');
    const create = readFileSync(join(ROOT, 'app/create/page.tsx'), 'utf8');
    const agents = readFileSync(join(ROOT, 'app/agents/page.tsx'), 'utf8');
    expect(block).toContain(LINE);
    expect(LINE).not.toMatch(/stake now|wallet|HeyGen|REAL_STAKING/i);
    expect(afterCreate).toContain('OWNED_GLASS');
    expect(create).toContain('{OWNED_GLASS}');
    expect(agents).toContain('{OWNED_GLASS}');
    expect(home).not.toContain(LINE);
    expect(home).not.toContain('OWNED_GLASS');
    expect(hero).not.toContain(LINE);
    expect(hero).not.toContain('OWNED_GLASS');
    const createdAt = create.indexOf('{created &&');
    expect(createdAt).toBeGreaterThan(-1);
    expect(create.indexOf('{OWNED_GLASS}')).toBeGreaterThan(createdAt);
    const emptyAt = agents.indexOf('agents.length === 0');
    expect(agents.indexOf('{OWNED_GLASS}')).toBeGreaterThan(emptyAt);
  });
});
