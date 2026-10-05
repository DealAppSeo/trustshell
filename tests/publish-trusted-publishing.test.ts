/**
 * publish-sdk.yml publishes through npm trusted publishing (OIDC), never a long-lived token.
 *
 * npm's OIDC step is "intended to never throw" (npm/cli lib/utils/oidc.js): a failed exchange
 * falls back to whatever token is configured, silently. So the guarantees here are structural:
 * - no npm token in the workflow, so a broken trust fails the publish instead of falling back;
 * - OIDC only on the job that installs nothing, so a dependency's install script in the build
 *   job cannot ask npm for a publish token (the old secret was scoped to three steps for the
 *   same reason);
 * - the rehearsal asks the registry itself, because `npm publish --dry-run` hides the answer;
 * - package.json `repository.url` names this repo exactly, which npm requires to publish from
 *   GitHub with provenance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const wf = readFileSync(join(root, '.github', 'workflows', 'publish-sdk.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** The text of one job, from its `  name:` line to the next job or the end. */
function job(name: string): string {
  const start = wf.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) return '';
  const rest = wf.slice(start);
  const body = rest.indexOf('\n') + 1;
  const next = rest.slice(body).search(/^  [a-z][\w-]*:\s*$/m);
  return next < 0 ? rest : rest.slice(0, body + next);
}

describe('publish-sdk.yml publishes through npm trusted publishing', () => {
  it('never hands npm a long-lived token', () => {
    expect(wf).not.toMatch(/\$\{\{\s*secrets\.NPM_TOKEN/);
    expect(wf).not.toMatch(/^\s*NODE_AUTH_TOKEN:/m); // an env key, not the comment explaining its absence
  });

  it('grants OIDC to the publish job only, and the workflow default is read-only', () => {
    const top = wf.slice(0, wf.search(/^jobs:/m));
    expect(top).not.toMatch(/id-token/);
    expect(job('publish')).toMatch(/permissions:\n\s+contents:\s*read\n\s+id-token:\s*write/);
    expect(job('build')).not.toMatch(/id-token/);
  });

  it('runs no dependency install in the job that can get a publish token', () => {
    const publish = job('publish');
    expect(publish).not.toMatch(/npm (install|ci)(?! -g npm@)/);
    expect(publish).toContain('needs: build');
    expect(publish).toMatch(/npm publish \.\/pkg\/\*\.tgz .*--ignore-scripts/);
    // A bare `pkg/x.tgz` is a GitHub shorthand to npm 11 (it ran git ls-remote on it, run 37267372433).
    expect(job('publish')).not.toMatch(/npm publish pkg\//);
  });

  it('asks for provenance explicitly, so a provenance failure stops the publish', () => {
    // npm 11 enables it by itself for a public repo, but swallows any error doing so (oidc.js).
    const publishes = job('publish').split('\n').filter((l) => /^\s*npm publish /.test(l));
    expect(publishes).toHaveLength(2);
    for (const line of publishes) expect(line).toContain('--provenance');
  });

  it('uses an npm that can publish through OIDC (11.5.1+)', () => {
    expect(job('publish')).toMatch(/npm install -g npm@\^11\.5\.1/);
  });

  it('checks the trust itself, the way npm does, before publishing', () => {
    const publish = job('publish');
    const check = publish.indexOf('/-/npm/v1/oidc/token/exchange/package/');
    expect(publish).toContain('audience=npm:registry.npmjs.org');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(publish.indexOf('npm publish ./pkg/'));
    for (const verdict of ['**VERIFIED**', '**FAILED**', '**NOT CHECKED']) expect(publish).toContain(verdict);
  });
});

describe('package.json names the repository npm checks the publish against', () => {
  it('repository.url is this GitHub repository, exact case', () => {
    expect(pkg.repository?.url).toBe('git+https://github.com/DealAppSeo/trustshell.git');
  });
});
