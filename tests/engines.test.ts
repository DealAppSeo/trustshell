/**
 * The local memory commands load `node:sqlite`, which needs no flag only from Node 22.13 (22.5-22.12
 * gated it behind --experimental-sqlite). Without `engines`, a stranger on an older Node learned that at
 * run time, not at install (Lane D, RC attack 2026-10-21). Pinned so the floor is not dropped or lowered.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

it('package.json declares Node >= 22.13 for npm to warn at install', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  expect(pkg.engines?.node).toBe('>=22.13.0');
});
