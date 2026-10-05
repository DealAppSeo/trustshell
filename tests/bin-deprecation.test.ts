/**
 * 1.6.0: the seven bare global bins (remember, recall, redact, verify, repid, proof, status) are
 * deprecated in favour of `trustshell <command>`, which is the same command. A bare global name can
 * collide with another package's bin, and npm refuses to install over one it does not own. They
 * keep working until 2.0. The notice goes to stderr and only on a terminal, so a script or CI log
 * that parses output sees nothing new.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SEVEN = ['remember', 'recall', 'redact', 'verify', 'repid', 'proof', 'status'];

describe('bare global bins are deprecated, quietly', () => {
  for (const name of SEVEN) {
    it(`bin/${name}.js prints the notice on a terminal only, naming trustshell ${name}`, () => {
      const src = readFileSync(join(ROOT, 'bin', `${name}.js`), 'utf8');
      expect(src).toMatch(/if \(process\.stderr\.isTTY\) process\.stderr\.write\(/);
      expect(src).toContain('deprecated and goes away in 2.0. Use \\`trustshell ${command}\\`');
    });
  }

  it('piped (not a terminal), a bin prints no notice and still runs the command', () => {
    // --help, because the tracked dist/ is a stale partial build (BUS S9) and --help is in every build.
    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'verify.js'), '--help'], { encoding: 'utf8' });
    expect(r.stderr).not.toMatch(/deprecated/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/USAGE/);
  });
});
