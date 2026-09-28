/**
 * Public copy must not say stake now.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx|md)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('public copy', () => {
  it('fails if public copy contains stake now', () => {
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), join(ROOT, 'README.md')];
    const hits = files.filter((file) => /stake now/i.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });
});
