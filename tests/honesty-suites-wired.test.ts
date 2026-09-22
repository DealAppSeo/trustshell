/**
 * Every honesty suite must be wired into the workflow that runs it.
 *
 * `.github/workflows/e2e-honesty.yml` says this about itself, in a comment above the two suites
 * it added last:
 *
 *   > These two existed and were run by NOBODY — not here, not in check.yml (which has no
 *   > browser), not anywhere. 32 assertions whose verdict was never collected. Exactly the shape
 *   > LESSONS warns about: a hand-written list of suites silently omits the next one added, and
 *   > nothing goes red to say so, because a suite that never runs cannot fail.
 *
 * The list stayed hand-written. So the file diagnosed the defect precisely, wrote the warning at
 * the defect site, and left the next author to remember anyway — which is a note, not a
 * mechanism. `tests/e2e/onboarding-honesty.mjs` was about to be the fifth entry and the next
 * silent omission.
 *
 * WHY A GUARD AND NOT A DISCOVERY RULE. `scripts/check-all.mjs` in a sibling repo discovers every
 * `check:*` and runs them, and a discovery rule is the better answer wherever it fits. It does
 * not fit here: these steps carry per-suite `id`s and `if: always()` so that one broken surface
 * cannot hide another's state, and the rollup names each outcome. An explicit list is worth
 * keeping for that. A list is fine WHEN SOMETHING FAILS AS IT GOES STALE — which is what this is.
 *
 * SCOPE IS DELIBERATELY THE `-honesty` FAMILY, not every `test:*` script. `test:create-walk`,
 * `test:acceptance` and the rest are wired, or not, for their own reasons, and a blanket rule
 * would quietly demand things nobody decided. The naming family is unambiguous, and it is where
 * the next one will land.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'e2e-honesty.yml');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = readFileSync(WORKFLOW, 'utf8');

/** Scripts named `test:<something>-honesty`. */
const honestySuites = Object.keys(pkg.scripts).filter((s) => /^test:.+-honesty$/.test(s));

/** Suites that are not `-honesty` but are wired anyway; asserted so removing one goes red. */
const ALSO_WIRED = ['test:mvp-walk', 'test:grants-fail-closed'];

describe('e2e-honesty.yml runs every honesty suite', () => {
  it('finds honesty suites at all (not vacuously green)', () => {
    expect(honestySuites.length).toBeGreaterThan(0);
  });

  it.each(honestySuites)('%s is invoked by the workflow', (script) => {
    expect(workflow).toContain(`npm run ${script}`);
  });

  it.each(honestySuites)('%s has its outcome checked, not just its step run', (script) => {
    // A step with `if: always()` that nothing reads cannot fail the job. The rollup is where a
    // red actually becomes a red, so being invoked is necessary and not sufficient.
    const suiteName = script.replace(/^test:/, '');
    expect(workflow).toContain(`"${suiteName}:$`);
  });

  it.each(ALSO_WIRED)('%s stays wired', (script) => {
    expect(workflow).toContain(`npm run ${script}`);
  });

  it('the workflow does not invoke a suite package.json no longer defines', () => {
    const invoked = [...workflow.matchAll(/npm run (test:[a-z0-9:-]+)/g)].map((m) => m[1]);
    const missing = invoked.filter((s) => !(s in pkg.scripts));
    expect(missing).toEqual([]);
  });
});
