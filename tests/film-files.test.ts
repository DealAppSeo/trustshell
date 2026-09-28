/**
 * Film slots run from 01-lie through 07-headline. The site does not name a video vendor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SLOTS = [
  '01-lie',
  '02-caught',
  '03-receipt',
  '04 NOT_CHECKED',
  '05 NOT_CHECKED',
  '06 NOT_CHECKED',
  '07-headline',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('film files', () => {
  it('lists 01-lie through 07-headline', () => {
    const inbox = readFileSync(join(ROOT, 'docs/FILM_INBOX.md'), 'utf8');
    let at = -1;
    for (const slot of SLOTS) {
      const next = inbox.indexOf(slot);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(SLOTS[0]).toBe('01-lie');
    expect(SLOTS[SLOTS.length - 1]).toBe('07-headline');
    expect(SLOTS).toHaveLength(7);

    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))];
    const hits = files.filter((file) => /HeyGen/i.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
    expect(inbox).not.toMatch(/stake now/i);
  });
});
