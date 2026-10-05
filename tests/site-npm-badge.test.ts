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
  // Screen 3 carries the install steps since the 2026-10-05 home page.
  const agentScreen = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
  const earned = readFileSync(join(ROOT, 'components/earned-trust.tsx'), 'utf8');

  it('NPM_LATEST is the published 1.4.0', () => {
    expect(npmLatest).toMatch(/export const NPM_LATEST = '1\.6\.0'/);
  });

  it('hero is the one-screen win and does not interpolate package.json', () => {
    expect(hero).not.toMatch(/packageJson\.version/);
    expect(agentScreen).not.toMatch(/packageJson\.version/);
    expect(hero).toContain('AI lies.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(agentScreen).toContain("export const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.0';");
    // Pinned to the same version as the install line: `check "<sentence>"` ships in 1.5.0 and later.
    expect(agentScreen).toContain('export const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;');
    expect(`${hero}\n${agentScreen}`).not.toContain('trustshell status');
    // Every version the landing names is the published one.
    const named = `${hero}\n${agentScreen}`.match(/@hyperdag\/trustshell@(\d+\.\d+\.\d+)/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set(['@hyperdag/trustshell@1.6.0']));
    expect(hero).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    // The hero no longer carries an install block or an MCP paste; screen 3 does (tests/home-screens.test.ts).
    expect(hero).not.toMatch(/MCP_PASTE|npm i -g/);
    expect(hero).not.toContain('Demo file is not in the repo');
    expect(hero).not.toContain('E:\\TrustDisk');
    expect(hero).not.toMatch(/showDemo|<video/);
    expect(hero).not.toMatch(/\/start/);
    expect(hero).not.toMatch(/Market|Leaderboard|stake now/i);
    expect(hero).not.toMatch(/connect wallet|your wallet|add wallet|Wallet and stake/i);
  });

  it('x402 card does not claim automatic HAL pay/refuse as shipped', () => {
    expect(earned).not.toMatch(/Pay agents that pass HAL/);
    expect(earned).toMatch(/Automatic origin \+ spend-cap gating ships in 1\.4\.0/);
  });
});
