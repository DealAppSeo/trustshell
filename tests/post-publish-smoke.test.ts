/**
 * scripts/post-publish-smoke.mjs is read-only and keyless, and refuses to guess what to check.
 * The full run needs the registry and an install, so it is not run here; this pins the parts that
 * would make it lie or write.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', 'scripts', 'post-publish-smoke.mjs');
const src = readFileSync(SCRIPT, 'utf8');

describe('post-publish smoke', () => {
  it('with no version, or a version that is not one, prints usage and exits 2 (no network)', () => {
    for (const args of [[], ['latest'], ['1.7.0', '--files', 'x']]) {
      const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stdout).toMatch(/^usage: /);
    }
  });

  it('never publishes, pushes or tags, and strips keys and the endpoint override from every child', () => {
    expect(src).not.toMatch(/['"]publish['"]|git push|['"]tag['"]|dist-tag add/);
    for (const k of ['REPID_API_KEY', 'TRUSTSHELL_API_KEY', 'TRUSTSHELL_API_URL', 'NPM_TOKEN', 'NODE_AUTH_TOKEN']) {
      expect(src).toContain(`'${k}'`);
    }
    expect(src).toMatch(/delete env\[k\]/);
  });

  it('pins the install to its own temp dir (a package.json there, and --prefix), so npm cannot walk up into a parent project', () => {
    expect(src).toMatch(/writeFileSync\(join\(dir, 'package\.json'\)/);
    expect(src).toMatch(/'install', '--prefix', dir/);
  });

  it('checks the 1.8.0 shape by default and fails when latest is not the version asked for', () => {
    expect(src).toMatch(/const DEFAULTS = \{ files: 123, tools: 20 \};/);
    expect(src).toContain("check('dist-tag latest is this version', latest === v");
    expect(src).toContain("!tools.names.includes('quarantine_release')");
    expect(src).toMatch(/process\.exit\(failed\.length \? 1 : 0\)/);
  });
});
