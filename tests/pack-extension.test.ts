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

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/**
 * Read the archive the way `unzip`, Python and the Chrome Web Store do: end record, then the central
 * directory, then each local header it points at. `zipNames` above walks local headers only, and it
 * passed for as long as the central directory was corrupt (one extra 16-bit field per record), so a
 * zip every real reader rejected looked fine here. Throws on the first inconsistency.
 */
function readThroughCentralDirectory(buf: Buffer): { name: string; data: Buffer }[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let p = buf.readUInt32LE(eocd + 16);
  const cdEnd = p + cdSize;
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`central record ${i}: bad signature`);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: central record points at no local header`);
    const localNameLen = buf.readUInt16LE(local + 26);
    const localExtraLen = buf.readUInt16LE(local + 28);
    if (buf.slice(local + 30, local + 30 + localNameLen).toString('utf8') !== name) throw new Error(`${name}: local name differs`);
    const start = local + 30 + localNameLen + localExtraLen;
    const data = buf.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC in the central directory does not match the data`);
    out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cdEnd) throw new Error(`central directory is ${cdEnd - (cdEnd - cdSize)} bytes but its records end at ${p - (cdEnd - cdSize)}`);
  return out;
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

  it('a real zip reader can open it: every central record matches its local header and data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-pack-'));
    const zip = join(dir, 'extension.zip');
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/pack-extension.mjs'), join(ROOT, 'extension'), zip], {
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(result.status).toBe(0);
    const entries = readThroughCentralDirectory(readFileSync(zip));
    const manifest = entries.find((e) => e.name === 'manifest.json');
    expect(manifest?.data.equals(readFileSync(join(ROOT, 'extension', 'manifest.json')))).toBe(true);
    expect(entries.length).toBeGreaterThan(5);
    rmSync(dir, { recursive: true, force: true });
  });
});
