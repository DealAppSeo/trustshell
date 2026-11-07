/**
 * The import boundary for `@hyperdag/trustshell/verify`.
 *
 * The whole promise of the verify subpath is that a relying party can verify a receipt with no app,
 * no framework, and no network. This pins that: after loading dist/verify, NONE of the heavy app
 * deps may be in the module cache, and verifying the signed golden must succeed with global.fetch
 * stubbed to throw (any network touch is a FAIL, not a warning). Builds the SDK first; run via
 * `npm run test:verify-import`.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const VERIFY = join(HERE, '..', 'dist', 'verify', 'index.js');

let failures = 0;
const ok = (m) => console.log(`OK   ${m}`);
const fail = (m) => { console.error(`FAIL ${m}`); failures++; };
const assert = (c, m) => (c ? ok(m) : fail(m));

// ── 1. Load the subpath via CJS require so we can inspect the resolved module graph.
const mod = require(VERIFY);
assert(typeof mod.verifyReceiptOffline === 'function', 'verify: verifyReceiptOffline is exported');
assert(typeof mod.kernelCanonicalJson === 'function', 'verify: kernelCanonicalJson (pure primitive) is exported');
assert(Array.isArray(mod.SIX_CLAIM_KEYS) && mod.SIX_CLAIM_KEYS.length === 6, 'verify: SIX_CLAIM_KEYS is the 6-key taxonomy');

// ── 2. The heavy app deps must NOT be in the graph. ethers (peer, for keccak) and node builtins are fine.
const FORBIDDEN = ['node_modules/next/', 'node_modules/react/', 'node_modules/react-dom/', 'node_modules/@supabase/', 'node_modules/lucide-react/', 'node_modules/idb-keyval/', 'node_modules/next-themes/', 'node_modules/tailwindcss/', 'node_modules/@modelcontextprotocol/'];
const loaded = Object.keys(require.cache).map((p) => p.replace(/\\/g, '/'));
for (const bad of FORBIDDEN) {
  const hit = loaded.find((p) => p.includes(bad));
  assert(!hit, `verify graph excludes ${bad}${hit ? ` (LOADED: ${hit})` : ''}`);
}

// ── 3. Verification is OFFLINE: with fetch stubbed to throw, the signed golden still verifies.
const golden = JSON.parse(readFileSync(join(HERE, 'fixtures', 'kernel-receipt-v2.golden.json'), 'utf8'));
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { fetchCalls++; throw new Error('network is forbidden during offline verification'); };
try {
  const r = await mod.verifyReceiptOffline(golden.receipt_response.receipt, {
    trustedRoots: [golden.public_key],
    engineEnvelope: golden.receipt_response.six_claims,
  });
  assert(r.claims.integrity.status === 'VERIFIED', 'offline: integrity VERIFIED on the signed golden');
  assert(r.sealer.trusted === true, 'offline: sealer trusted under the pinned key');
  // The envelope is not covered by the receipt signature, so from a bare import its authorization
  // attestation is READ, not re-derived: NOT_CHECKED by default (fail-closed).
  assert(r.claims.authorization.status === 'NOT_CHECKED', 'offline: authorization is read-not-verified without an authenticated envelope (NOT_CHECKED)');
  // ...and reaches VERIFIED only when the caller vouches for the envelope's channel.
  const rAuth = await mod.verifyReceiptOffline(golden.receipt_response.receipt, {
    trustedRoots: [golden.public_key],
    engineEnvelope: golden.receipt_response.six_claims,
    envelopeAuthenticated: true,
  });
  assert(rAuth.claims.authorization.status === 'VERIFIED', 'offline: authorization VERIFIED only under envelopeAuthenticated: true');
  assert(fetchCalls === 0, `offline: no network call (fetch invoked ${fetchCalls}x)`);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: verify subpath import contract — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
