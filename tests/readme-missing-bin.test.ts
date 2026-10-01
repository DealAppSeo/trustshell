/**
 * A README line that talks about a bin must name a package.json bin.
 * A stranger name fails. Subcommands that are not bins are left alone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readmeBinsMissing(readme: string, binNames: readonly string[]): string[] {
  const mentioned = new Set<string>();
  for (const line of readme.split(/\r?\n/)) {
    const prose = line.replace(/`[^`]*\/[^`]*`/g, '');
    if (!/\bbin\b/.test(prose)) continue;
    for (const match of prose.matchAll(/`([A-Za-z][A-Za-z0-9-]*)`/g)) mentioned.add(match[1]);
  }
  return [...mentioned].filter((name) => !binNames.includes(name)).sort();
}

describe('README bin names', () => {
  const root = join(__dirname, '..');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  const binNames = Object.keys(pkg.bin);

  it('matches package.json bin', () => {
    expect(readmeBinsMissing(readme, binNames)).toEqual([]);
  });

  it('fails when a line names a bin the package does not ship', () => {
    const sample = 'Installing puts a `frobnicate` bin on your PATH.';
    expect(readmeBinsMissing(sample, ['trustshell', 'hal'])).toEqual(['frobnicate']);
  });
});
