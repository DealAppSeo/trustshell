/**
 * The listing package: text, 1280x800 shots, the privacy page, and the zip.
 * Nothing here submits the package.
 */
export {};

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SENT = 'The reply text is sent to our checkers, Groq and Cerebras';

function pngSize(buf: Buffer): { width: number; height: number } {
  const sig = buf.slice(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('not a png');
  if (buf.slice(12, 16).toString('ascii') !== 'IHDR') throw new Error('missing IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function zipEntries(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const size = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const start = offset + 30 + nameLen + extraLen;
    entries.push({ name, data: buf.slice(start, start + size) });
    offset = start + size;
  }
  return entries;
}

describe('store package', () => {
  const listing = readFileSync(join(ROOT, 'store/LISTING.md'), 'utf8');
  const privacy = readFileSync(join(ROOT, 'public/privacy.html'), 'utf8');

  it('the summary names the three labels and Groq, and fits the short field', () => {
    const summary = listing.split('## Summary')[1].split('## Description')[0].trim();
    expect(summary.length).toBeLessThanOrEqual(132);
    expect(summary).toContain('pass, veto, or not-checked');
    expect(summary).toContain(SENT);
    expect(listing).not.toMatch(/launched/i);
    expect(listing.toLowerCase()).not.toContain('stake');
    expect(listing).not.toContain('npx @hyperdag/trustshell@1.5.0');
    expect(privacy).toContain(SENT);
    expect(privacy).toContain('It is not stored. Not printed is not the same as not sent.');
    expect(privacy.toLowerCase()).not.toContain('stake');
    expect(privacy).not.toMatch(/launched/i);
    expect(privacy).not.toMatch(/is not sent/);
    expect(listing).toContain('Check with TrustShell');
    expect(privacy).toContain('Check with TrustShell');
  });

  it('the three shots are 1280 by 800', () => {
    for (const name of ['pass.png', 'veto.png', 'not-checked.png']) {
      const size = pngSize(readFileSync(join(ROOT, 'store/screenshots', name)));
      expect(size).toEqual({ width: 1280, height: 800 });
    }
  });

  // Packed fresh on every run: a committed zip went stale the first time main changed the
  // extension (#438 permissions, #437 CSP), and its byte-equality test then failed every PR.
  it('a fresh pack matches this extension folder and carries no .env', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ts-pack-')), 'extension.zip');
    execFileSync(process.execPath, [join(ROOT, 'scripts/pack-extension.mjs'), join(ROOT, 'extension'), out]);
    const entries = zipEntries(readFileSync(out));
    const names = entries.map((entry) => entry.name);
    expect(names).toContain('manifest.json');
    const packed = entries.find((entry) => entry.name === 'manifest.json')!.data;
    expect(packed.equals(readFileSync(join(ROOT, 'extension/manifest.json')))).toBe(true);
    expect(names.some((name) => name === '.env' || name.endsWith('/.env'))).toBe(false);
    expect(names.some((name) => name.split('/').includes('node_modules'))).toBe(false);
    const manifest = JSON.parse(packed.toString('utf8')) as {
      host_permissions: string[];
      permissions: string[];
    };
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    expect(manifest.host_permissions).toEqual(['https://repid-engine-production.up.railway.app/*']);
    expect(manifest.permissions).toEqual(['storage', 'contextMenus', 'activeTab', 'scripting']);
    const popup = entries.find((entry) => entry.name === 'popup.html')!.data.toString('utf8');
    expect(popup).toContain(SENT);
    expect(names).toContain('select.js');
  });
});
