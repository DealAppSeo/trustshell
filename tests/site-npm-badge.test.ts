/**
 * The landing pin matches the registry. Measured 2026-09-24:
 * `npm view @hyperdag/trustshell version` → 1.4.0.
 * Do not interpolate package.json beside an unversioned install — that is how
 * the site once advertised a version the registry 404'd.
 * The x402 card must not claim automatic HAL pay/refuse as shipped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('site install copy matches the published release', () => {
  const npmLatest = readFileSync(join(ROOT, 'lib/npm-latest.ts'), 'utf8');
  const hero = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
  // Screen 3 carries the install steps since the 2026-10-05 home page.
  const agentScreen = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
  const earned = readFileSync(join(ROOT, 'components/earned-trust.tsx'), 'utf8');

  const release = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const stable = release.includes('-') ? it.skip : it; // A prerelease goes to `next`, and `latest` does not move.

  // 1.9.0 and 1.9.1 shipped with the site still on 1.8.0, and nothing failed. These two make a release move it.
  stable('NPM_LATEST is the version package.json releases', () => {
    expect(npmLatest).toContain(`export const NPM_LATEST = '${release}'`);
  });

  stable('every pinned install on the site and the walkthrough name that version', () => {
    const pinned = ['app', 'components', 'lib'].flatMap((dir) =>
      (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
        .filter((file) => /\.tsx?$/.test(file))
        .flatMap((file) => [...readFileSync(join(ROOT, dir, file), 'utf8').matchAll(/@hyperdag\/trustshell@(\d+\.\d+\.\d+)/g)].map((m) => m[1])),
    );
    expect(pinned.length).toBeGreaterThan(5);
    expect(new Set(pinned)).toEqual(new Set([release]));
    expect(readFileSync(join(ROOT, 'lib/first-run.ts'), 'utf8')).toContain(`RELEASE = '${release}'`);
  });

  // The caption a visitor reads. A new release means running the demo again, so the page says so here first.
  stable('the recorded output on the home page and /build names that version', () => {
    const recorded = [...hero.matchAll(/[Rr]ecorded with (\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    expect(recorded.length).toBe(2);
    expect(new Set(recorded)).toEqual(new Set([release]));
    expect(readFileSync(join(ROOT, 'app/build/page.tsx'), 'utf8')).toContain(`PKG_VERSION = '${release}'`);
  });

  it('hero is the one-screen win and does not interpolate package.json', () => {
    expect(hero).not.toMatch(/packageJson\.version/);
    expect(agentScreen).not.toMatch(/packageJson\.version/);
    expect(hero).toContain('Check what your AI agent did, not what it says it did.');
    expect(readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8')).toContain('Free. No signup. No wallet. Don&apos;t paste anything private.');
    expect(agentScreen).toContain("export const INSTALL = 'npm i -g @hyperdag/trustshell@1.9.1';");
    // Pinned to the same version as the install line: `check "<sentence>"` ships in 1.5.0 and later.
    expect(agentScreen).toContain('export const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;');
    expect(`${hero}\n${agentScreen}`).not.toContain('trustshell status');
    // Every version the landing names is the published one.
    const named = `${hero}\n${agentScreen}`.match(/@hyperdag\/trustshell@(\d+\.\d+\.\d+)/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set(['@hyperdag/trustshell@1.9.1']));
    expect(hero).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(hero).not.toContain('Demo file is not in the repo');
    expect(hero).not.toContain('E:\\TrustDisk');
    expect(hero).not.toMatch(/showDemo|<video/);
    expect(hero).not.toMatch(/(?<!\/lab)\/start/); // /lab/start is the one authorized link
    expect(hero).not.toMatch(/Market|Leaderboard|stake now/i);
    expect(hero).not.toMatch(/connect wallet|your wallet|add wallet|Wallet and stake/i);
  });

  it('x402 card does not claim automatic HAL pay/refuse as shipped', () => {
    expect(earned).not.toMatch(/Pay agents that pass HAL/);
    expect(earned).toMatch(/Automatic origin \+ spend-cap gating ships in 1\.4\.0/);
  });
});
