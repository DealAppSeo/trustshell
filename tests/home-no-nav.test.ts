/**
 * "/" renders no top nav. Other routes keep the measured link row, with Check first.
 * The home page is the check form, then the terminal command and the agent config.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const OFF_HOME = ['Market', 'Leaderboard', 'Claim', 'Preview', 'RepID', 'History', 'Settings'];

describe('home renders no top nav', () => {
  it('returns null on / and keeps the other-route links', () => {
    expect(nav).toMatch(/if\s*\(\s*pathname\s*===\s*'\/'\s*\)\s*return null;/);
    expect(nav).toContain('linksForLanding');
    for (const label of ['Check', 'PAI', 'Mission', 'Agents', 'Connect', 'Run', ...OFF_HOME]) {
      expect(nav).toContain(`label: '${label}'`);
    }
    // Check is the first link: it is the door a stranger uses.
    expect(nav.match(/\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/)?.slice(1)).toEqual(['/check', 'Check']);
  });

  it('shows the check form, the terminal command and the agent config, and not the other labels', () => {
    expect(hero).toContain('Every answer gets checks you can see.');
    expect(hero).toContain('Act when they pass.');
    expect(hero).toContain('Paste something an AI told you. See if it checks out.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(hero).toContain('<CheckForm');
    expect(hero).toContain('Use it in your terminal');
    expect(hero).toContain(`const TERMINAL_COMMAND = 'npx @hyperdag/trustshell check "The Eiffel Tower is in Berlin."';`);
    expect(hero).toContain('Add it to your agent');
    expect(hero).toContain("const INSTALL = 'npm i -g @hyperdag/trustshell@1.5.0';");
    const paste = hero.match(/const MCP_PASTE = `([\s\S]*?)`;/);
    expect(paste?.[1]).toBe('{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }');
    expect(paste?.[1] ?? '').not.toMatch(/npm/i);
    // The agent path names the two apps it works in, and says not yet for the two it does not.
    expect(hero).toContain('For Claude Desktop and Cursor.');
    expect(hero).toContain('ChatGPT and Grok: not yet.');
    expect(hero).not.toContain('Claude, ChatGPT, Grok, Cursor');
    expect(hero).not.toContain('trustshell status');
    expect(hero).not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/Market|Leaderboard/);
  });

  it('home source does not show the other-route labels', () => {
    const home = `${page}\n${hero}`;
    for (const label of OFF_HOME) expect(home).not.toContain(label);
    expect(home).not.toMatch(/stake now/i);
    expect(home).not.toMatch(/href=["']\/stake["']/);
  });
});
