/**
 * Spend-path files must not sign via the raw signer.
 *
 * `buildX402Payment` is the cap-checked lower-level signer. A real spend (example,
 * script, src turn-boundary) goes through `guardedX402Payment` or calls
 * `assertOriginCanPay` first. Tests of the signer itself live under tests/ and
 * are not spend paths. The definition and the wrapper are exempt.
 *
 * Scans the trees, so a new example that signs without the gate fails this file
 * without anyone editing it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const TREES = ['examples', 'scripts', 'src'];
const EXEMPT = new Set([
  'src/lib/trustshell.ts', // definition
  'src/lib/guarded-payment.ts', // the wrap
]);
const EXT = /\.(ts|js|mjs|tsx|jsx)$/;
const RAW_CALL = /\bbuildX402Payment\s*\(/;
const GUARDED_CALL = /\bguardedX402Payment\s*\(/;
const ASSERT_ORIGIN = /\bassertOriginCanPay\s*\(/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXT.test(name)) acc.push(p);
  }
  return acc;
}

describe('spend paths wrap the signer — Unknown cannot pay', () => {
  it('examples/scripts/src do not call buildX402Payment without a gate', () => {
    const unguarded: string[] = [];
    for (const tree of TREES) {
      for (const file of walk(join(ROOT, tree))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (EXEMPT.has(rel)) continue;
        const src = readFileSync(file, 'utf8');
        if (!RAW_CALL.test(src)) continue;
        if (!GUARDED_CALL.test(src) && !ASSERT_ORIGIN.test(src)) unguarded.push(rel);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('a2a-purchase example spends through guardedX402Payment with origin + policy', () => {
    const src = readFileSync(join(ROOT, 'examples', 'a2a-purchase', 'a2a-purchase.mjs'), 'utf8');
    expect(src).toMatch(GUARDED_CALL);
    expect(src).toMatch(/origin:\s*'Cli'/);
    expect(src).toMatch(/policy:/);
    expect(src).toMatch(/agentId:/);
    expect(src).not.toMatch(/\bawait buildX402Payment\s*\(/);
  });
});
