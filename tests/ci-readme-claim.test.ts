/**
 * CI must HAL-verify one README claim with THIS tree's CLI.
 *
 * Production change that would make this fail: deleting
 * .github/workflows/readme-claim.yml, or switching the step to
 * `npx @hyperdag/trustshell@latest` (published 1.3.0, not 1.4.0).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'readme-claim.yml');

describe('CI README-claim gate', () => {
  it('exists as its own workflow (not folded into the check job)', () => {
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it("verifies the README Paris claim with this tree's CLI, not published 1.3.0", () => {
    const yml = readFileSync(WORKFLOW, 'utf8');
    expect(yml).toContain('The capital of France is Paris.');
    expect(yml).toContain('npm run sdk:build');
    expect(yml).toMatch(/node dist\/cli\/index\.js verify/);
    expect(yml).not.toMatch(/@hyperdag\/trustshell@latest/);
    expect(yml).not.toMatch(/npx @hyperdag\/trustshell/);
  });

  it('runs on pull_request only — not on push to main', () => {
    const yml = readFileSync(WORKFLOW, 'utf8');
    expect(yml).toMatch(/^\s*pull_request:\s*$/m);
    expect(yml).not.toMatch(/branches:\s*\[main\]/);
  });
});
