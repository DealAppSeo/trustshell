/**
 * TrustLattice v0 conformance runner. Feeds every vector in conformance/trustlattice/v0/vectors.json
 * through the SHIPPED verifier (dist/verify) and asserts the per-claim verdict matches expect.
 *
 * This is the proof that "anyone who installs it gets the same results": the vectors are the fixed
 * ruler, the verifier is the thing under test. Run via `npm run test:trustlattice` (builds first).
 * Three-outcome discipline: a mismatch is FAILED, not a warning. No jest — plain node, like the
 * repo's other e2e harnesses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyReceiptOffline, SIX_CLAIM_KEYS } from '../dist/verify/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, '..', 'conformance', 'trustlattice', 'v0', 'vectors.json'), 'utf8'));

let failures = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (id, msg) => { console.error(`FAIL [${id}] ${msg}`); failures++; };

for (const v of corpus.vectors) {
  let r;
  try {
    r = await verifyReceiptOffline(v.receipt, v.options ?? {});
  } catch (e) {
    fail(v.id, `verifier threw (it must never throw): ${e?.stack ?? e}`);
    continue;
  }
  const e = v.expect;
  let ok = true;
  if (r.schema !== e.schema) { fail(v.id, `schema ${r.schema} != ${e.schema}`); ok = false; }
  if (r.sealer.trusted !== e.sealer_trusted) { fail(v.id, `sealer.trusted ${r.sealer.trusted} != ${e.sealer_trusted}`); ok = false; }
  if (r.reconciliation.engine_envelope !== e.engine_envelope) { fail(v.id, `engine_envelope ${r.reconciliation.engine_envelope} != ${e.engine_envelope}`); ok = false; }
  if (!eq([...r.reconciliation.downgraded].sort(), [...e.downgraded].sort())) { fail(v.id, `downgraded ${JSON.stringify(r.reconciliation.downgraded)} != ${JSON.stringify(e.downgraded)}`); ok = false; }
  for (const k of SIX_CLAIM_KEYS) {
    const got = r.claims[k]?.status;
    if (got !== e.claims[k]) { fail(v.id, `claims.${k} ${got} != ${e.claims[k]}`); ok = false; }
  }
  if (ok) console.log(`OK   [${v.id}]`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: TrustLattice v0 conformance — ${corpus.vectors.length} vectors, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
