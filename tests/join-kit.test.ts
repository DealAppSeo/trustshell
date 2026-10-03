import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('join kit', () => {
  const doc = readFileSync(join(ROOT, 'docs/JOIN_KIT.md'), 'utf8');

  it('is one screen: verify, a receipt line, and no stake now', () => {
    expect(doc).toContain('A portable trust harness. Autonomy is earned.');
    expect(doc).toContain('ERC-8004');
    expect(doc).toContain('npm i -g @hyperdag/trustshell@1.4.1');
    expect(doc).toContain('trustshell verify "The capital of France is Paris."');
    expect(doc).toContain('glm cerebras FALSE');
    expect(doc).toContain('openai openai NOT_CHECKED');
    expect(doc).toMatch(/Staking is not live/);
    expect(doc).not.toMatch(/stake now/i);
    expect(doc).not.toMatch(/staking is live/i);
    expect(doc).not.toMatch(/wallet/i);
    expect(doc).not.toMatch(/HeyGen/i);
    expect(doc).not.toMatch(/register\(\)\s+mints/i);
  });
});
