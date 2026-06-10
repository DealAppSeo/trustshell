/**
 * Runnable DONE-CHECK for D-017 (local HAL primary, repid-engine fallback).
 * Build first:  npx tsc --project tsconfig.sdk.json
 * Run:          node scripts/verify-local-hal.cjs
 *
 * Proves: (1) local-only scores with NO network, (2) createHDP() local-first
 * scores locally with NO network, (3) local-first falls back to repid-engine
 * only when the local provider is unavailable, (4) default 'remote' is unchanged.
 */
const assert = require('assert');
const { TrustShell, createHDP } = require('../dist/index.js');

let networkCalls = 0;
const throwingFetch = async () => {
  networkCalls++;
  throw new Error('NETWORK CALLED — the local path must not hit the network');
};

(async () => {
  // 1) local-only: scores with no network.
  global.fetch = throwingFetch;
  networkCalls = 0;
  const shell = new TrustShell({ mode: 'local-only' });
  const r1 = await shell.score('The capital of France is definitely Paris, guaranteed 100%.');
  assert.strictEqual(networkCalls, 0, 'local-only must not call the network');
  assert.strictEqual(r1.provider, 'local-heuristic-v0', 'must be the local provider');
  assert.ok(r1.halScore >= 0 && r1.halScore <= 1 && ['PASS', 'FLAG', 'VETO'].includes(r1.verdict));
  console.log(`PASS local-only          halScore=${r1.halScore} verdict=${r1.verdict} provider=${r1.provider} networkCalls=${networkCalls}`);

  // 2) createHDP() = local-first: scores locally, no network.
  global.fetch = throwingFetch;
  networkCalls = 0;
  const hdp = createHDP();
  const r2 = await hdp.score('It might rain tomorrow, roughly 60% chance per the forecast.');
  assert.strictEqual(networkCalls, 0, 'createHDP local-first must not call the network when local works');
  assert.strictEqual(r2.provider, 'local-heuristic-v0');
  console.log(`PASS createHDP local-first halScore=${r2.halScore} verdict=${r2.verdict} networkCalls=${networkCalls}`);

  // 3) local-first FALLS BACK to repid-engine only when local is unavailable.
  let remoteHits = 0;
  global.fetch = async () => {
    remoteHits++;
    return { ok: true, json: async () => ({ hal_score: 0.2, hal_verdict: 'PASS', provider_used: 'remote-quorum' }) };
  };
  const brokenLocal = { name: 'broken', score: async () => { throw new Error('local down'); } };
  const hdp2 = createHDP({ localProvider: brokenLocal });
  const r3 = await hdp2.score('some claim');
  assert.strictEqual(r3.provider, 'remote-quorum', 'must fall back to remote when local throws');
  assert.strictEqual(remoteHits, 1);
  console.log(`PASS fallback-to-remote   provider=${r3.provider} remoteHits=${remoteHits}`);

  // 4) default mode 'remote' is unchanged (backward compat).
  remoteHits = 0;
  global.fetch = async () => {
    remoteHits++;
    return { ok: true, json: async () => ({ hal_score: 0.13, hal_verdict: 'PASS', provider_used: 'openai' }) };
  };
  const r4 = await new TrustShell().score('hi');
  assert.ok(remoteHits === 1 && r4.provider === 'openai', 'default mode must use the remote quorum HAL');
  console.log(`PASS default-remote compat provider=${r4.provider} remoteHits=${remoteHits}`);

  console.log('\nALL LOCAL-HAL CHECKS PASSED (D-017)');
})().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
