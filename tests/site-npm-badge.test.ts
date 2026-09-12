/**
 * The install badge must name npm latest, not this unpublished tree.
 *
 * Live trustshell.dev showed "npm package v1.4.0" next to
 * `npm install @hyperdag/trustshell` while the registry latest is 1.3.0
 * (1.4.0 → 404). The x402 card implied automatic HAL refuse; that gate is
 * 1.4.0/git-only. Source: SITE_STRINGS_TO_CHANGE.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('site copy matches npm 1.3.0, not unpublished 1.4.0', () => {
  const npmLatest = readFileSync(join(ROOT, 'lib/npm-latest.ts'), 'utf8');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
  const earned = readFileSync(join(ROOT, 'components/earned-trust.tsx'), 'utf8');

  it('NPM_LATEST is the published 1.3.0', () => {
    expect(npmLatest).toMatch(/export const NPM_LATEST = '1\.3\.0'/);
  });

  it('hero install badge does not interpolate package.json version', () => {
    expect(hero).not.toMatch(/packageJson\.version/);
    expect(hero).toMatch(/npm latest v\$\{NPM_LATEST\}/);
  });

  it('x402 card does not claim automatic HAL pay/refuse as shipped', () => {
    expect(earned).not.toMatch(/Pay agents that pass HAL/);
    expect(earned).toMatch(/Automatic origin \+ spend-cap gating ships in 1\.4\.0/);
  });
});
