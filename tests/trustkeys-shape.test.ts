import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('trust keys shape', () => {
  const doc = readFileSync(join(ROOT, 'docs/TRUSTKEYS_SHAPE.md'), 'utf8');

  it('is a pointer, with no crypto implementation', () => {
    expect(doc).toContain('A portable trust harness. Autonomy is earned.');
    expect(doc).toMatch(/Pointer only/);
    expect(doc).toMatch(/adds no crypto/);
    expect(doc).toMatch(/An agent does not see a full key/);
    expect(doc).toContain('RegisterResult');
    expect(doc).toContain('src/lib/trustshell.ts');
    expect(doc).toContain('src/lib/ingest.ts');
    expect(doc).toContain('./WALKTHROUGH.md');
    expect(doc).toMatch(/Staking is not live/);
    expect(doc).not.toMatch(/stake now|staking is live/i);
    expect(doc).not.toMatch(/createHash|subtle\.crypto|privateKey\s*=/);
    expect(doc).not.toMatch(/register\(\)\s+mints/i);
    expect(doc).not.toMatch(/HeyGen/i);
  });
});
