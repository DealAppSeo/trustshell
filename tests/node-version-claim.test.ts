/**
 * Every "Node 22..." the site states must be the version the package really needs (package.json
 * engines). The home page once said "Node 22+" while the package required 22.13: a visitor on 22.0 to
 * 22.12 would follow the page and fail. Found by the 2026-11-09 first-user verification.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const min = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node.replace(/^>=\s*/, '').replace(/\.0$/, '');

describe('the Node version the site asks for', () => {
  const claims = ['app', 'components', 'lib'].flatMap((dir) =>
    (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .flatMap((f) => [...readFileSync(join(ROOT, dir, f), 'utf8').matchAll(/Node (\d+(?:\.\d+)?(?:\+)?)/g)].map((m) => `${dir}/${f}: ${m[1]}`)),
  );

  it('is stated somewhere, so this check can see a claim', () => {
    expect(claims.length).toBeGreaterThan(2);
  });

  it(`always names ${min}, the package's minimum`, () => {
    expect(claims.filter((c) => !c.endsWith(`: ${min}`))).toEqual([]);
  });
});
