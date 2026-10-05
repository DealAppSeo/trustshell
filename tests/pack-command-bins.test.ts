/**
 * The packed tarball lists remember, recall, redact, verify, repid, proof, and status.
 * A missing bin fails this test.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const REQUIRED = ['remember', 'recall', 'redact', 'verify', 'repid', 'proof', 'status'] as const;

export function missingPackedBins(
  bin: Record<string, string>,
  files: readonly string[],
  packedListing: string,
  required: readonly string[] = REQUIRED,
): string[] {
  return required.filter((name) => {
    const path = `bin/${name}.js`;
    return bin[name] !== path || !files.includes(path) || !packedListing.includes(path);
  });
}

describe('packed command bins', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8').replace(/\r/g, '')) as {
    bin: Record<string, string>;
    files: string[];
  };

  it('package.json bin and files include the seven commands', () => {
    expect(missingPackedBins(pkg.bin, pkg.files, pkg.files.join('\n'))).toEqual([]);
  });

  it('npm pack --dry-run lists those bins', () => {
    // --json, not the human listing: that one is a log line on stderr, and `npm run -s verify`
    // hands this child npm_config_loglevel=silent, so it printed nothing and this test failed
    // on a tarball that had every bin. The JSON file list is output, whatever the loglevel.
    const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
    });
    expect(packed.status).toBe(0);
    const [entry] = JSON.parse(packed.stdout) as { files: { path: string }[] }[];
    const listing = (entry?.files ?? []).map((f) => f.path).join('\n');
    expect(missingPackedBins(pkg.bin, pkg.files, listing)).toEqual([]);
  }, 60000);

  it('a missing bin fails', () => {
    const bin = { ...pkg.bin };
    delete bin.remember;
    expect(missingPackedBins(bin, pkg.files, pkg.files.join('\n'))).toContain('remember');
  });
});
