import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chrome compiles an <input pattern> with the `v` flag, where a bare `-` at the end of a class is a syntax error:
 * `[A-Za-z0-9-]{1,39}` on /repid logged "Pattern attribute value ... is not a valid regular expression" and the browser
 * silently dropped the check, so the field accepted anything. Found by tests/e2e/site-walk.mjs --poke.
 * This pins every pattern in the app so the next one cannot do the same.
 */
const ROOTS = ['app', 'components'];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

const patterns: { file: string; value: string }[] = [];
for (const root of ROOTS) {
  for (const file of tsxFiles(join(__dirname, '..', root))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bpattern=(?:"([^"]*)"|'([^']*)'|\{"([^"]*)"\}|\{'([^']*)'\})/g)) {
      patterns.push({ file: file.slice(join(__dirname, '..').length + 1), value: m[1] ?? m[2] ?? m[3] ?? m[4] });
    }
  }
}

describe('<input pattern> values', () => {
  it('finds the patterns it is meant to check', () => {
    expect(patterns.length).toBeGreaterThan(0);
  });

  it.each(patterns)('$file: $value compiles under the v flag', ({ value }) => {
    expect(() => new RegExp(`^(?:${value})$`, 'v')).not.toThrow();
  });
});
