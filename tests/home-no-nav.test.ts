/**
 * The stranger nav is five links, on home and on every other page. Start was added
 * 2026-10-07: until then nothing on the nav or the home page led to making an agent.
 * Leaderboard, market and the other routes stay reachable and off this list.
 * The home page still opens on the check, then the terminal line in the hero,
 * then the agent screen below it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
// Screen 3 carries the install steps since the 2026-10-05 home page.
const agentScreen = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const STRANGER = [
  ['/start', 'Start'],
  ['/#claim', 'Check'],
  ['/#add-agent', 'Add to your agent'],
  ['/docs', 'Docs'],
  ['/#where', 'Why'],
] as const;

const OFF_NAV = ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings', 'PAI', 'Mission', 'Agents', 'Connect', 'Run', 'Stake'];

describe('stranger nav', () => {
  it('lists Start, Check, Add to your agent, Docs, Why, in that order', () => {
    const found = [...nav.matchAll(/\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g)].map((m) => [m[1], m[2]]);
    expect(found).toEqual(STRANGER.map((pair) => [...pair]));
    expect(nav).not.toMatch(/pathname\s*===\s*'\/'\s*\)\s*return null/);
    expect(nav).toContain('linksForLanding');
  });

  it('keeps leaderboard, market and the other routes off the primary nav', () => {
    for (const label of OFF_NAV) expect(nav).not.toContain(`label: '${label}'`);
    for (const href of ['/market', '/leaderboard', '/stake', '/pai', '/preview']) {
      expect(nav).not.toContain(`href: '${href}'`);
      expect(existsSync(join(ROOT, 'app', href.slice(1), 'page.tsx'))).toBe(true);
    }
  });

  it('keeps the hero check, and does not put the other labels back on the home source', () => {
    expect(hero).toContain('AI lies.');
    expect(hero).toContain('Or it sounds sure and it&apos;s wrong.');
    expect(hero).toContain('TrustShell gets you a second opinion before you build on it.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(hero).toContain('<CheckForm');
    expect(hero).toContain('Add it to the agent you already use');
    expect(agentScreen).toContain('In your terminal');
    expect(agentScreen).toContain('export const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;');
    expect(agentScreen).toContain("export const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.0';");
    expect(agentScreen).toContain('In Claude Desktop, Cursor or Claude Code');
    expect(agentScreen).toContain('ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.');
    expect(hero).not.toContain('Claude, ChatGPT, Grok, Cursor');
    expect(`${hero}\n${agentScreen}`).not.toContain('trustshell status');
    expect(hero).not.toMatch(/stake now/i);
    const home = `${page}\n${hero}`;
    for (const label of ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings']) {
      expect(home).not.toContain(label);
    }
    expect(home).not.toMatch(/stake now/i);
    expect(home).not.toMatch(/href=["']\/stake["']/);
    expect(page).toContain('<Hero />');
    expect(page.indexOf('<Hero />')).toBeLessThan(page.indexOf('<HomeAgent />'));
    expect(page.indexOf('<HomeAgent />')).toBeLessThan(page.indexOf('<HomeWhere />'));
  });
});
