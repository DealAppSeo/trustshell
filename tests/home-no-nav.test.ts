/**
 * "/" renders no top nav. Other routes keep the measured link row.
 * The command box is the three published lines plus trustshell status.
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
    for (const label of ['PAI', 'Mission', 'Agents', 'Connect', 'Run', ...OFF_HOME]) {
      expect(nav).toContain(`label: '${label}'`);
    }
  });

  it('shows the chat paste or the four commands, and not the other labels', () => {
    expect(hero).toContain('A portable trust harness. Autonomy is earned.');
    expect(hero).toContain('Check a claim. See the receipt. Keep your keys.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(hero).toContain('Check a claim in the chat you already use');
    expect(hero).toContain("setPanel('mcp')");
    expect(hero).toContain('I have a terminal');
    expect(hero).toContain("setPanel('terminal')");
    const block = hero.match(/const WIN_COMMANDS = `([\s\S]*?)`;/);
    expect(block?.[1].replace(/\r/g, '').split('\n')).toEqual([
      'npm i -g @hyperdag/trustshell@1.4.0',
      'trustshell status',
    ]);
    const paste = hero.match(/const MCP_PASTE = `([\s\S]*?)`;/);
    expect(paste?.[1] ?? '').not.toMatch(/npm/i);
    const at = hero.indexOf('Claude, ChatGPT, Grok, Cursor');
    const mcpPanel = hero.slice(at, hero.indexOf('{WIN_COMMANDS}', at));
    expect(at).toBeGreaterThan(-1);
    expect(mcpPanel).not.toMatch(/npm/i);
    expect(mcpPanel).toContain('MCP_PASTE');
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
