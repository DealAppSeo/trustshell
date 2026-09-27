import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const HEADLINE = 'A portable trust harness. Autonomy is earned.';
const STEPS = [
  'npm i -g @hyperdag/trustshell@1.4.0',
  'trustshell verify "The capital of France is Paris."',
  'trustshell verify "The Eiffel Tower is located in Rome, Italy."',
  'trustshell verify "The Earth orbits the Sun."',
  'trustshell status',
  'trustshell proof trinity-shofet --verify',
];

describe('/start walkthrough', () => {
  const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8');
  const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8');

  it('lists install, three verify commands, status, then proof', () => {
    let at = -1;
    for (const step of STEPS) {
      const next = page.indexOf(step);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(page.match(/trustshell verify /g)).toHaveLength(3);
    expect(page).toContain(HEADLINE);
    expect(layout).toContain(HEADLINE);
  });

  it('does not ask for a wallet or a tailor path', () => {
    expect(page).not.toMatch(/wallet/i);
    expect(page).not.toMatch(/stake/i);
    expect(page).not.toMatch(/\/start\/tailor/);
    expect(page).not.toMatch(/HeyGen/i);
    expect(layout).not.toMatch(/wallet/i);
  });
});
