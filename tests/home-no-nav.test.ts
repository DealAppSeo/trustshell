/**
 * The stranger nav is install-first (2026-10-24, Sean): How it works, Install, Docs, GitHub. Every link
 * serves the one job, running and installing TrustShell. The sentence check (/check), the agent path
 * (/pai), Start, leaderboard, market and the other routes stay reachable at their URLs and off this list.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const STRANGER = [
  ['/#how', 'How it works'],
  ['/#install', 'Install'],
  ['/docs', 'Docs'],
  ['https://github.com/DealAppSeo/trustshell', 'GitHub'],
] as const;

const OFF_NAV = ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings', 'PAI', 'Mission', 'Agents', 'Connect', 'Run', 'Stake', 'Start'];

describe('stranger nav', () => {
  it('lists How it works, Install, Docs, GitHub, in that order', () => {
    const found = [...nav.matchAll(/\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g)].map((m) => [m[1], m[2]]);
    expect(found).toEqual(STRANGER.map((pair) => [...pair]));
    expect(nav).not.toMatch(/pathname\s*===\s*'\/'\s*\)\s*return null/);
    expect(nav).toContain('linksForLanding');
  });

  it('keeps leaderboard, market and the other routes off the primary nav', () => {
    for (const label of OFF_NAV) expect(nav).not.toContain(`label: '${label}'`);
    for (const href of ['/market', '/leaderboard', '/stake', '/start', '/preview', '/check', '/pai']) {
      expect(nav).not.toContain(`href: '${href}'`);
      expect(existsSync(join(ROOT, 'app', href.slice(1), 'page.tsx'))).toBe(true);
    }
  });

  it('the nav anchors exist on the home page', () => {
    expect(page).toContain('id="how"');
    expect(page).toContain('id="install"');
  });

  it('is install-first, and does not put the other labels back on the home source', () => {
    expect(page).toContain('Check what your AI agent did, not what it says it did.');
    expect(page).toContain('<InstallTabs');
    expect(page).not.toContain('<CheckForm');
    expect(page).not.toContain('trustshell status');
    // Word boundaries: the demo output says "Claims:", which is not the Claim label.
    for (const label of ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings']) {
      expect(page).not.toMatch(new RegExp(`\\b${label}\\b`));
    }
    expect(page).not.toMatch(/stake now/i);
    expect(page).not.toMatch(/href=["']\/stake["']/);
  });
});
