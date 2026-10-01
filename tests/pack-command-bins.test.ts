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
    const packed = spawnSync('npm', ['pack', '--dry-run'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
    });
    const listing = `${packed.stdout ?? ''}\n${packed.stderr ?? ''}`;
    expect(packed.status).toBe(0);
    expect(missingPackedBins(pkg.bin, pkg.files, listing)).toEqual([]);
  }, 60000);

  it('a missing bin fails', () => {
    const bin = { ...pkg.bin };
    delete bin.remember;
    expect(missingPackedBins(bin, pkg.files, pkg.files.join('\n'))).toContain('remember');
  });
});
