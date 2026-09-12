/**
 * `trustshell init --pai` must run scripts/init-pai.mjs (or print that path).
 *
 * Default `init` stays no-network (egress table + check-egress). The PAI FACE
 * is the --pai flag. Missing script is never silent exit 0 — that was the
 * unpublished-bin/check.js failure class.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseArgs,
  resolveInitPai,
  runInitPai,
  INIT_PAI_DOC,
  EXIT,
} from '../src/cli';

describe('trustshell init --pai wires scripts/init-pai.mjs', () => {
  it('parses --pai and forwards --name / --answers / --force', () => {
    const a = parseArgs(['init', '--pai', '--name', 'pai-night-1', '--answers', 'job|cost|brain', '--force']);
    expect(a.error).toBeUndefined();
    expect(a.command).toBe('init');
    expect(a.pai).toBe(true);
    expect(a.name).toBe('pai-night-1');
    expect(a.answers).toBe('job|cost|brain');
    expect(a.force).toBe(true);
  });

  it('default init is still the no-network profile path', () => {
    const a = parseArgs(['init']);
    expect(a.pai).toBeFalsy();
    expect(a.command).toBe('init');
  });

  it('the script is where resolveInitPai looks from src/cli', () => {
    const script = resolveInitPai(join(__dirname, '..', 'src', 'cli'));
    expect(existsSync(script)).toBe(true);
  });

  it('refuses with the documented path when the script is missing — never silent 0', () => {
    const r = runInitPai(
      { exists: () => false, spawn: () => { throw new Error('must not spawn'); } },
      { cliDir: join(__dirname, '..', 'src', 'cli') },
    );
    expect(r.missing).toBe(true);
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.code).not.toBe(0);
    expect(INIT_PAI_DOC).toMatch(/scripts\/init-pai\.mjs/);
  });

  it('spawns node scripts/init-pai.mjs with forwarded flags', () => {
    const spawned: { cmd: string; args: string[] }[] = [];
    const r = runInitPai(
      {
        exists: () => true,
        spawn: (cmd, args) => {
          spawned.push({ cmd, args });
          return { status: 0 };
        },
      },
      {
        cliDir: join('/pkg', 'dist', 'cli'),
        name: 'x',
        answers: 'a|b|c',
        force: true,
      },
    );
    expect(r.missing).toBeFalsy();
    expect(r.code).toBe(0);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].args[0]).toMatch(/init-pai\.mjs$/);
    expect(spawned[0].args).toEqual(expect.arrayContaining(['--name', 'x', '--answers', 'a|b|c', '--force']));
  });
});
