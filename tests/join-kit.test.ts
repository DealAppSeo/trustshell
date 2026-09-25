import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const box = readFileSync(join(ROOT, 'components/join-kit.tsx'), 'utf8');
const doc = readFileSync(join(ROOT, 'docs/JOIN_KIT.md'), 'utf8');
const home = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

const LINES = [
  'npm i -g @hyperdag/trustshell@1.4.0',
  'trustshell verify "<claim>"',
  'trustshell status',
  'trustshell repid <id>',
  'trustshell proof <id> --verify',
];

describe('join kit', () => {
  it('landing box and JOIN_KIT.md list install, verify, status, repid, proof', () => {
    for (const line of LINES) {
      expect(box).toContain(line);
      expect(doc).toContain(line);
    }
    expect(home.indexOf('<JoinKit />')).toBeGreaterThan(home.indexOf('<Hero'));
    expect(box).not.toMatch(/\/start\/tailor|wallet|1\.5\.0/i);
    expect(doc).not.toMatch(/1\.5\.0/);
  });
});
