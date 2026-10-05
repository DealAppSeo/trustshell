/**
 * The stranger nav is four links, on home and on every other page.
 * Leaderboard, market and the other routes stay reachable and off this list.
 * The home page still opens on the check, then the terminal line in the hero,
 * then the agent screen below it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const STRANGER = [
  ['/#claim', 'Check'],
  ['/#add-agent', 'Add to your agent'],
  ['/docs', 'Docs'],
  ['/#where', 'Why'],
] as const;

const OFF_NAV = ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings', 'PAI', 'Mission', 'Agents', 'Connect', 'Run', 'Stake'];

describe('stranger nav', () => {
  it('lists Check, Add to your agent, Docs, Why, in that order', () => {
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
    expect(hero).toContain('Every answer gets checks you can see.');
    expect(hero).toContain('Act when they pass.');
    expect(hero).toContain('Paste something an AI told you. See if it checks out.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(hero).toContain('<CheckForm');
    expect(hero).toContain('Use it in your terminal');
    expect(hero).toContain('const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;');
    expect(hero).toContain('Add it to your agent');
    expect(hero).toContain("const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.0';");
    const paste = hero.match(/const MCP_PASTE = `([\s\S]*?)`;/);
    expect(paste?.[1]).toBe('{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }');
    expect(hero).toContain('For Claude Desktop and Cursor.');
    expect(hero).toContain('ChatGPT and Grok: not yet.');
    expect(hero).not.toContain('Claude, ChatGPT, Grok, Cursor');
    expect(hero).not.toContain('trustshell status');
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
