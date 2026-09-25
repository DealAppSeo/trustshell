/**
 * The landing pin matches the registry. Measured 2026-09-24:
 * `npm view @hyperdag/trustshell version` → 1.4.0.
 * Do not interpolate package.json beside an unversioned install — that is how
 * the site once advertised a version the registry 404'd.
 * The x402 card must not claim automatic HAL pay/refuse as shipped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('site install copy matches published 1.4.0', () => {
  const npmLatest = readFileSync(join(ROOT, 'lib/npm-latest.ts'), 'utf8');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
  const earned = readFileSync(join(ROOT, 'components/earned-trust.tsx'), 'utf8');

  it('NPM_LATEST is the published 1.4.0', () => {
    expect(npmLatest).toMatch(/export const NPM_LATEST = '1\.4\.0'/);
  });

  it('hero is the one-screen win and does not interpolate package.json', () => {
    expect(hero).not.toMatch(/packageJson\.version/);
    expect(hero).toMatch(/A portable trust harness so AI has to earn it\./);
    expect(hero).toMatch(/Check a claim\. See the receipt\. Keep your keys\./);
    expect(hero).toContain('npm i -g @hyperdag/trustshell@1.4.0');
    expect(hero).toContain('trustshell verify "The capital of France is Paris."');
    expect(hero).toContain('trustshell verify "The Eiffel Tower is located in Rome, Italy."');
    expect(hero).toContain('/trustshell-demo-20s.mp4');
    expect(hero).toContain('E:\\TrustDisk\\video\\trustshell-demo-20s.mp4');
    expect(hero).toMatch(/showDemo \?/);
    expect(hero.indexOf('<video')).toBeGreaterThan(hero.indexOf('showDemo ?'));
    expect(hero).not.toMatch(/\/start/);
    expect(hero).not.toMatch(/PAI/);
    expect(hero).not.toMatch(/wallet/i);
  });

  it('x402 card does not claim automatic HAL pay/refuse as shipped', () => {
    expect(earned).not.toMatch(/Pay agents that pass HAL/);
    expect(earned).toMatch(/Automatic origin \+ spend-cap gating ships in 1\.4\.0/);
  });
});
