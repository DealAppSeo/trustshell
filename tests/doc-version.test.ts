/**
 * A doc that names this package's version must match package.json.
 *
 * The check script (`scripts/check-doc-version.cjs`) is the guard. These tests
 * pin that the walker finds markdown by walking (not a list), that a v1.3.0
 * surface claim is a hit against 1.4.0, and that a ≥ floor is not.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'check-doc-version.cjs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scan = require('../scripts/check-doc-version.cjs') as {
  walkMarkdown: (root?: string) => string[];
  loadPackageVersion: (root?: string) => { ok: boolean; version: string | null };
  scanFile: (
    text: string,
    fileRel: string,
    pkgVersion: string,
  ) => { file: string; line: number; version: string; kind: string }[];
  scanRepo: (root?: string) => { status: string; reason: string | null; hits: unknown[]; stats: { md: number } | null };
  isFloor: (line: string, idx: number) => boolean;
  isCurrentClaim: (line: string, version: string, idx: number) => boolean;
};

describe('discovery — a walk, not a list', () => {
  it('finds markdown files by walking the tree', () => {
    const files = scan.walkMarkdown(ROOT);
    expect(files.length).toBeGreaterThan(5);
    const rel = files.map((f) => f.replace(/\\/g, '/'));
    expect(rel.some((f) => f.endsWith('docs/api-reference.md'))).toBe(true);
    expect(rel.some((f) => f.endsWith('README.md'))).toBe(true);
  });

  it('loads a real x.y.z from package.json', () => {
    const pkg = scan.loadPackageVersion(ROOT);
    expect(pkg.ok).toBe(true);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns NOT_CHECKED when the walk finds no markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doc-ver-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.4.0' }));
    const result = scan.scanRepo(dir);
    expect(result.status).toBe('NOT_CHECKED');
  });
});

describe('what is a current package-version claim', () => {
  it('flags a published v1.3.0 surface against 1.4.0 — the 1.4.0 tarball defect', () => {
    const line =
      '> Reflects the published `@hyperdag/trustshell` v1.3.0 surface and the production deployment.';
    const hits = scan.scanFile(line + '\n', 'docs/api-reference.md', '1.4.0');
    expect(hits.map((h) => h.version)).toEqual(['1.3.0']);
  });

  it('does not flag a ≥ floor that this release satisfies', () => {
    const line = '> **`badge` ships in `@hyperdag/trustshell` ≥ 1.3.0.**';
    expect(scan.scanFile(line + '\n', 'README.md', '1.4.0')).toEqual([]);
  });

  it('does not flag a matching current version', () => {
    const line = '> Reflects the published `@hyperdag/trustshell` v1.4.0 surface.';
    expect(scan.scanFile(line + '\n', 'docs/api-reference.md', '1.4.0')).toEqual([]);
  });

  it('flags an installed --version example that is behind package.json', () => {
    const line = '# → 1.3.0   (the installed package version)';
    const hits = scan.scanFile(line + '\n', 'docs/getting-started.md', '1.4.0');
    expect(hits.map((h) => h.version)).toEqual(['1.3.0']);
  });
});

describe('the check script itself', () => {
  it('exits 0 with VERIFIED on this tree after the stale claims were fixed', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(r.stdout).toMatch(/^VERIFIED\b/m);
    expect(r.status).toBe(0);
  });
});

describe('unpublished 1.4.0 is not an npx command', () => {
  it('no markdown documents npx @hyperdag/trustshell@1.4.0', () => {
    // Production change that fails this: telling a stranger to npx a version
    // that is not on npm. Walk, not a list — AGENTS.md and docs/MORNING.md
    // both had the line.
    const forbidden = 'npx @hyperdag/trustshell@1.4.0';
    const hits = scan
      .walkMarkdown(ROOT)
      .filter((f) => readFileSync(f, 'utf8').includes(forbidden))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(hits).toEqual([]);
  });
});

