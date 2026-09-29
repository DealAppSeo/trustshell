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

  it('adds trustshell status as its own fourth command line', () => {
    expect(hero).toContain('A portable trust harness. Autonomy is earned.');
    expect(hero).toContain('Check a claim. See the receipt. Keep your keys.');
    const block = hero.match(/const WIN_COMMANDS = `([\s\S]*?)`;/);
    expect(block?.[1].replace(/\r/g, '').split('\n')).toEqual([
      'npm i -g @hyperdag/trustshell@1.4.0',
      'trustshell verify "The capital of France is Paris."',
      'trustshell verify "The Eiffel Tower is located in Rome, Italy."',
      'trustshell status',
    ]);
    expect(hero).not.toMatch(/Copy the three/);
    expect(hero).toContain('Existing agent: add TrustShell MCP after status.');
    expect(hero).toContain(
      'New PAI: trustshell remember writes ~/.trustshell/memory.sqlite, name the PAI after the first receipt.',
    );
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
