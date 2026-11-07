/**
 * The workspace guard refuses repo-specific work in the wrong checkout (DECISION 3, #679 sprint): the launcher
 * bound a TrustShell task to the old ihh-ica project. `workspaceMatches` is pure; `main` is run with an injected
 * shell so the test asserts both exit paths without depending on the checkout it runs in.
 */
const { workspaceMatches, main } = require('../scripts/check-workspace.cjs') as {
  workspaceMatches: (remoteUrl: string, expected: string) => boolean;
  main: (argv: string[], env: NodeJS.ProcessEnv, run?: (cmd: string) => string) => number;
};

describe('check-workspace: refuse the wrong checkout (DECISION 3, #679)', () => {
  it('matches https and ssh forms of the expected repo, with or without .git / case / trailing slash', () => {
    for (const u of [
      'https://github.com/DealAppSeo/trustshell.git',
      'https://github.com/DealAppSeo/trustshell',
      'git@github.com:DealAppSeo/trustshell.git',
      'https://github.com/dealappseo/TrustShell/',
    ]) {
      expect(workspaceMatches(u, 'DealAppSeo/trustshell')).toBe(true);
    }
  });

  it('rejects the ihh-ica misroute, a different repo, and empty/garbage remotes', () => {
    expect(workspaceMatches('https://github.com/DealAppSeo/ihh-ica.git', 'DealAppSeo/trustshell')).toBe(false);
    expect(workspaceMatches('git@github.com:DealAppSeo/repid-engine.git', 'DealAppSeo/trustshell')).toBe(false);
    expect(workspaceMatches('', 'DealAppSeo/trustshell')).toBe(false);
    expect(workspaceMatches('not-a-url', 'DealAppSeo/trustshell')).toBe(false);
  });

  it('main() exits 0 on a matching origin and 1 (loudly) on a misroute — injected shell, no real git', () => {
    const asTrustshell = (cmd: string) => (cmd.includes('remote get-url') ? 'https://github.com/DealAppSeo/trustshell.git' : 'main');
    const asIhhIca = (cmd: string) => (cmd.includes('remote get-url') ? 'https://github.com/DealAppSeo/ihh-ica.git' : 'ica-build');
    expect(main(['node', 'check-workspace.cjs'], {} as NodeJS.ProcessEnv, asTrustshell)).toBe(0);
    expect(main(['node', 'check-workspace.cjs'], {} as NodeJS.ProcessEnv, asIhhIca)).toBe(1);
    // explicit expected-repo arg wins
    expect(main(['node', 'check-workspace.cjs', 'DealAppSeo/repid-engine'], {} as NodeJS.ProcessEnv, (cmd) => (cmd.includes('remote get-url') ? 'git@github.com:DealAppSeo/repid-engine.git' : 'main'))).toBe(0);
  });
});
