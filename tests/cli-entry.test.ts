/**
 * `hal` — a PUBLISHED binary — did nothing at all, silently, exit 0.
 *
 * package.json links both `trustshell` and `hal` to dist/cli/index.js. npm
 * installs each as its own symlink, and Node leaves process.argv[1] as the path
 * you INVOKED, not the symlink's target. The old guard matched the invoked NAME
 * (`/trustshell$/`), so under `hal` main() never ran and the process exited 0
 * having done nothing — measured on a clean install: `trustshell check` exits 2
 * with a usage error, `hal check` printed nothing and exited 0.
 *
 * Silent-and-zero is the worst failure available to this tool: `hal verify "$x"
 * || exit 1` is a gate that can only pass. These tests exist so a third bin name
 * cannot reintroduce it.
 */
import { mkdtempSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEntryPath } from '../src/cli/index';

describe('isEntryPath — the guard that decides whether the CLI boots', () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'entry-'));
  const real = join(dir, 'index.js');
  writeFileSync(real, '// stand-in for dist/cli/index.js');

  it('is TRUE when invoked by its own path', () => {
    expect(isEntryPath(real, real)).toBe(true);
  });

  it.each(['trustshell', 'hal', 'some-future-bin'])(
    'is TRUE through a symlink named %s — the bug was that the NAME decided this',
    (name) => {
      const link = join(dir, name);
      symlinkSync(real, link);
      expect(isEntryPath(link, real)).toBe(true);
    },
  );

  it('is FALSE for an unrelated script — importing from a test must not boot the CLI', () => {
    const other = join(dir, 'jest-worker.js');
    writeFileSync(other, '// not the cli');
    expect(isEntryPath(other, real)).toBe(false);
  });

  it('is FALSE when argv[1] is absent', () => {
    expect(isEntryPath(undefined, real)).toBe(false);
  });

  it('falls back rather than refusing to boot when the path cannot be resolved', () => {
    // A path that does not exist makes realpath throw; the old regex then decides.
    expect(isEntryPath('/nope/dist/cli/index.js', real)).toBe(true);
    expect(isEntryPath('/nope/whatever', real)).toBe(false);
  });
});
