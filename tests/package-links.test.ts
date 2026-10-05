/**
 * npm shows three links on the package page: Repository, Homepage and Issues. Until 2026-10-05
 * only Repository was set, so a stranger on npmjs.com had no link to the site or to report a bug.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  homepage?: string;
  bugs?: { url?: string };
  repository?: { url?: string };
};

describe('package.json links', () => {
  it('names the site, the issue tracker and the repository', () => {
    expect(pkg.homepage).toBe('https://trustshell.dev');
    expect(pkg.bugs?.url).toBe('https://github.com/DealAppSeo/trustshell/issues');
    expect(pkg.repository?.url).toBe('git+https://github.com/DealAppSeo/trustshell.git');
  });
});
