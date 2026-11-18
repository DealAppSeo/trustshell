/**
 * risk-class.test.ts — the PR weight classifier's rules for THIS repo (scripts/ci/risk-class-rules.json).
 *
 * The weight has to come from the paths and must not be arguable down. Each row pins one path to
 * its class against the real rules file, so a rules edit that moves a path changes a row here too.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Cls = 'LOW' | 'MEDIUM' | 'MAJOR';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rc = require('../scripts/ci/risk-class.cjs') as {
  loadRules: (file: string) => unknown;
  classify: (paths: string[], rules: unknown, opts?: { pkgChanged?: string[] }) => { class: Cls };
};
const rules = rc.loadRules(join(__dirname, '..', 'scripts', 'ci', 'risk-class-rules.json'));
const cls = (paths: string[], pkgChanged?: string[]) => rc.classify(paths, rules, { pkgChanged }).class;

describe('risk class rules for trustshell', () => {
  const table: Array<[string, Cls]> = [
    // the classifier protects itself
    ['scripts/ci/risk-class-rules.json', 'MAJOR'],
    ['scripts/ci/risk-class.cjs', 'MAJOR'],
    ['.github/workflows/risk-class.yml', 'MAJOR'],
    // release, deploy, permissions
    ['.github/workflows/publish-sdk.yml', 'MAJOR'],
    ['.env.production', 'MAJOR'],
    ['.claude/settings.json', 'MAJOR'],
    ['LICENSE', 'MAJOR'],
    ['dist/cli/index.js', 'MAJOR'],
    ['extension/manifest.json', 'MAJOR'],
    // the contract outside verifiers build against
    ['schemas/trust-receipt-v0.schema.json', 'MAJOR'],
    ['conformance/trustlattice/vectors.json', 'MAJOR'],
    // guard, keys, signing, money
    ['src/cli/guard.ts', 'MAJOR'],
    ['src/sandbox/runner.ts', 'MAJOR'],
    ['src/lib/verify-signer.ts', 'MAJOR'],
    ['src/lib/guarded-payment.ts', 'MAJOR'],
    ['lib/grant-revoke-key.ts', 'MAJOR'],
    ['app/trustkeys/page.tsx', 'MAJOR'],
    // live behaviour and the public site
    ['src/lib/check.ts', 'MEDIUM'],
    ['lib/try-door.ts', 'MEDIUM'],
    ['app/lab/try/page.tsx', 'MEDIUM'],
    ['components/build/charts.tsx', 'MEDIUM'],
    ['README.md', 'MEDIUM'],
    ['CLAUDE.md', 'MEDIUM'],
    ['.github/workflows/check.yml', 'MEDIUM'],
    ['some/new/place/file.xyz', 'MEDIUM'],
    // genuinely low
    ['tests/try-door.test.ts', 'LOW'],
    ['docs/recipes/ci-gate.md', 'LOW'],
    ['reports/2026-11-06/run.md', 'LOW'],
    ['.gitignore', 'LOW'],
  ];
  it.each(table)('%s is %s', (path, want) => {
    expect(cls([path])).toBe(want);
  });

  it('a test file about signing is still LOW: the tests carve-out comes before the keyword rule', () => {
    expect(cls(['tests/verify-signer.test.ts'])).toBe('LOW');
  });

  it('the highest class among the files wins', () => {
    expect(cls(['docs/a.md', 'tests/b.test.ts', 'src/cli/guard.ts'])).toBe('MAJOR');
    expect(cls(['docs/a.md', 'src/lib/check.ts'])).toBe('MEDIUM');
  });

  it('package.json is MAJOR when a release field changed or could not be compared, MEDIUM otherwise', () => {
    expect(cls(['package.json'], ['version'])).toBe('MAJOR');
    expect(cls(['package.json'], undefined)).toBe('MAJOR');
    expect(cls(['package.json'], [])).toBe('MEDIUM');
  });

  it('refuses a rules file whose default is LOW', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.json');
    writeFileSync(f, JSON.stringify({ defaultClass: 'LOW', packageJson: { path: 'package.json', majorFields: [], otherClass: 'MEDIUM' }, rules: [{ class: 'LOW', reason: 'x', globs: ['**'] }] }));
    expect(() => rc.loadRules(f)).toThrow(/never LOW/);
  });
});
