/**
 * The committed dist/ IS the tsc output of src/. Nothing else.
 *
 * WHY THIS EXISTS. `npm i github:DealAppSeo/trustshell` and a pack from a checkout both ship dist/ as
 * it is COMMITTED; only `npm publish` rebuilds it (prepublishOnly). dist/ had last been rebuilt at
 * #463, so a github install had no kernel client, no `my_job`, and a `check_claim` without deciders or
 * votes: the import surface of a github install was not the import surface of main. Nothing was red.
 * tests/sdk-dist-built.test.ts spot-checks four strings, which cannot see a whole file missing.
 *
 * This compiles src/ with the repo's own TypeScript and the repo's own tsconfig.sdk.json into a temp
 * directory and compares it with dist/ file by file: the same set of files, the same bytes (line
 * endings normalised, since tsc follows the OS). If it fails, run `npm run sdk:build` and commit dist/.
 *
 * It uses node_modules/typescript, not whatever `tsc` is on PATH: a global TypeScript of another major
 * emits different output, and measuring the wrong toolchain is how a clean build gets called broken.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('committed dist/ is the tsc output of src/', () => {
  jest.setTimeout(180000);
  let tmp = '';
  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('has the same files with the same contents (else run `npm run sdk:build` and commit dist/)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'trustshell-dist-'));
    const tsc = require.resolve('typescript/bin/tsc', { paths: [ROOT] });
    const r = spawnSync(process.execPath, [tsc, '--project', join(ROOT, 'tsconfig.sdk.json'), '--outDir', tmp], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect({ status: r.status, out: (r.stdout || '') + (r.stderr || '') }).toEqual({ status: 0, out: '' });

    const built = new Map(walk(tmp).map((p) => [relative(tmp, p).split('\\').join('/'), p]));
    const committed = new Map(walk(join(ROOT, 'dist')).map((p) => [relative(join(ROOT, 'dist'), p).split('\\').join('/'), p]));

    const missing = [...built.keys()].filter((k) => !committed.has(k)).sort();
    const extra = [...committed.keys()].filter((k) => !built.has(k)).sort();
    const different = [...built.keys()]
      .filter((k) => committed.has(k))
      .filter((k) => norm(readFileSync(built.get(k)!, 'utf8')) !== norm(readFileSync(committed.get(k)!, 'utf8')))
      .sort();

    expect({ missing_from_dist: missing, not_in_src: extra, stale: different }).toEqual({ missing_from_dist: [], not_in_src: [], stale: [] });
  });

  it('is what package.json publishes: main, types and the three bins point into dist/', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.main).toBe('dist/lib/index.js');
    expect(pkg.types).toBe('dist/lib/index.d.ts');
    for (const bin of ['trustshell', 'hal', 'trustshell-mcp']) expect(pkg.bin[bin]).toMatch(/^dist\//);
    expect(pkg.files).toContain('dist/');
  });
});
