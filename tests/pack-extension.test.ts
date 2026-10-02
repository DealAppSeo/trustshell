/**
 * npm run pack-extension writes a zip with manifest.json and without a .env file.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const KEY = 'sk-pack-test-key-do-not-print';

function zipNames(buf: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const size = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    names.push(buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8'));
    offset += 30 + nameLen + extraLen + size;
  }
  return names;
}

describe('pack-extension', () => {
  it('the zip contains manifest.json and does not contain a .env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-pack-'));
    const ext = join(dir, 'extension');
    const zip = join(dir, 'extension.zip');
    mkdirSync(join(ext, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(ext, 'manifest.json'), '{"manifest_version":3}\n');
    writeFileSync(join(ext, '.env'), 'KEY=' + KEY + '\n');
    writeFileSync(join(ext, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
    const result = spawnSync('npm', ['run', 'pack-extension', '--', ext, zip], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
      timeout: 60000,
    });
    const names = zipNames(readFileSync(zip));
    expect(result.status).toBe(0);
    expect((result.stdout || '') + (result.stderr || '')).not.toContain(KEY);
    expect(names).toContain('manifest.json');
    expect(names.some((name) => name === '.env' || name.endsWith('/.env'))).toBe(false);
    expect(names.some((name) => name.split('/').includes('node_modules'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
