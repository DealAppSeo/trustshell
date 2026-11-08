import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePackageVersion } from '../src/lib/version';

describe('resolvePackageVersion', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'version-test-'));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns version "1.2.3" when package.json has version "1.2.3"', () => {
    const packageJson = JSON.stringify({ version: '1.2.3' });
    writeFileSync(join(tempRoot, 'package.json'), packageJson);
    const fromDir = join(tempRoot, 'dist', 'cli'); 
    const result = resolvePackageVersion(fromDir);
    expect(result).toBe('1.2.3');
  });

  it('returns "unknown" when package.json has empty version', () => {
    const packageJson = JSON.stringify({ version: '' });
    writeFileSync(join(tempRoot, 'package.json'), packageJson);
    const fromDir = join(tempRoot, 'dist', 'cli'); 
    const result = resolvePackageVersion(fromDir);
    expect(result).toBe('unknown');
  });

  it('returns "unknown" when package.json has non-string version', () => {
    const packageJson = JSON.stringify({ version: 5 });
    writeFileSync(join(tempRoot, 'package.json'), packageJson);
    const fromDir = join(tempRoot, 'dist', 'cli'); 
    const result = resolvePackageVersion(fromDir);
    expect(result).toBe('unknown');
  });

  it('returns "unknown" when package.json does not exist', () => {
    const fromDir = join(tempRoot, 'dist', 'cli'); 
    const result = resolvePackageVersion(fromDir);
    expect(result).toBe('unknown');
  });
});
