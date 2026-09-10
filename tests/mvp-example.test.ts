/**
 * Fresh-clone example: the file a stranger runs after cloning this tree.
 *
 * Production change that would make this fail: removing getRepID from
 * examples/quickstart/quickstart.mjs, or pointing its import at npm
 * @hyperdag/trustshell (published 1.3.0) instead of this tree's dist/.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const EXAMPLE = join(ROOT, 'examples', 'quickstart', 'quickstart.mjs');

describe('fresh-clone quickstart', () => {
  const src = readFileSync(EXAMPLE, 'utf8');

  it('calls TrustShell.init, verifyOutput, and getRepID', () => {
    expect(src).toMatch(/TrustShell\.init\s*\(/);
    expect(src).toMatch(/\.verifyOutput\s*\(/);
    expect(src).toMatch(/\.getRepID\s*\(/);
  });

  it('looks up trinity-shofet (the README agent), not a placeholder', () => {
    expect(src).toMatch(/getRepID\s*\(\s*['"]trinity-shofet['"]\s*\)/);
  });

  it("imports this tree's dist, so a clone can run it without npm 1.3.0", () => {
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/dist\/lib\/index\.js['"]/);
    expect(src).not.toMatch(/from ['"]@hyperdag\/trustshell['"]/);
  });
});
