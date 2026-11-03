#!/usr/bin/env node
/**
 * TrustMesh A2A — LIVE-backend, on-chain E2E harness (INERT + GATED).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS. The SAME agent-to-agent (A2A) / x402 flow as the mock-backend E2E
 * (tests/trustmesh-e2e.test.ts, PR #671) — discover a service -> executeA2A (no header) -> receive
 * HTTP 402 -> buildX402Payment -> escrow (X-PAYMENT) -> pollUntilSettled -> terminal status — but
 * driven against a REAL repid-engine backend and a REAL EIP-3009 x402 settlement on Base Sepolia
 * (testnet). It drives the real client code in src/lib/trustshell.ts via the built SDK
 * (dist/lib/index.js). It does NOT import the mock.
 *
 * WHO RUNS IT. **SEAN / the human owner runs this, never Claude / an agent.** The x402 settlement is
 * an ON-CHAIN SEND (a real USDC transfer on Base Sepolia testnet, redeemed by the backend's x402
 * facilitator from the EIP-3009 authorization this signs). That is a MAJOR / Sean-only action
 * (CLAUDE_RULES r30/r31, D-054; the guard hook blocks on-chain sends outright). Base Sepolia has no
 * monetary value, but on-chain writes stay human-only by canon regardless. Claude BUILDS this; Sean
 * RUNS it with his own funded wallet.
 *
 * FAIL-CLOSED (the core safety property). This script REFUSES and exits non-zero unless every
 * required env var is present. It NEVER falls back to the mock, NEVER falls back to a production
 * default, NEVER hardcodes or generates a wallet key. No creds -> it refuses, full stop. The SDK and
 * ethers are imported only AFTER the gate passes, so `node scripts/trustmesh-live-e2e.mjs` with no
 * env prints exactly what is missing and exits 1 without touching the chain, the backend, or a key.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * PRECONDITIONS (Sean supplies at run time; nothing is stored in the repo or held by Claude)
 *   - A faucet-funded Base Sepolia TEST wallet: testnet ETH for gas the facilitator spends, plus a
 *     balance of whatever EIP-3009 token the x402 service settles in (default Base Sepolia USDC
 *     0x036CbD53842c5426634e7929541eC2318f3dCF7e — confirm against the 402 `accepts[].asset`).
 *   - The backend base URL: a staging repid-engine if one exists, else the production host used with
 *     a DEDICATED test buyer agent + a clearly test-labeled service so a real run does not pollute
 *     real data.
 *   - The dedicated test buyer agent's repid-engine API key (buying/escrow is key-gated), its agent
 *     id, and the UUID of the test service to purchase.
 *   - The SDK built once:  npm run sdk:build   (produces dist/lib/index.js, which this imports).
 *
 * REQUIRED ENV (all of them — missing any => refuse + exit 1)
 *   Safety opt-in + credentials (the non-negotiable gate):
 *     TRUSTMESH_LIVE_E2E=1              explicit opt-in; any other value refuses
 *     TRUSTMESH_LIVE_API_URL           real repid-engine base (MUST be https:// — the SDK only sends
 *                                      the Authorization header over https; http would 401 on escrow)
 *     TRUSTMESH_LIVE_WALLET_KEY        the funded Base Sepolia TEST wallet private key (0x + 64 hex);
 *                                      used only to sign EIP-3009 locally via ethers — never logged,
 *                                      never sent on the wire; the signed authorization is
 *     TRUSTMESH_LIVE_API_KEY           the dedicated test buyer agent's repid-engine API key
 *   Run target (the dedicated test agent + service):
 *     TRUSTMESH_LIVE_BUYER_AGENT_ID    the dedicated TEST buyer agent id (owns the API key above)
 *     TRUSTMESH_LIVE_SERVICE_ID        UUID of the clearly test-labeled service to purchase
 *   Optional:
 *     TRUSTMESH_LIVE_DISPUTE_SERVICE_ID  if set, also runs the dispute case and asserts `disputed`
 *     TRUSTMESH_LIVE_POLL_TIMEOUT_MS     terminal-status poll budget (default 300000 = 5 min)
 *     TRUSTMESH_LIVE_POLL_INTERVAL_MS    poll interval (default 5000 = 5s)
 *
 * EXACT COMMAND Sean runs (PowerShell example — set the vars, then invoke):
 *   $env:TRUSTMESH_LIVE_E2E="1"
 *   $env:TRUSTMESH_LIVE_API_URL="https://<real-repid-engine-host>"
 *   $env:TRUSTMESH_LIVE_API_KEY="<dedicated test agent api key>"
 *   $env:TRUSTMESH_LIVE_WALLET_KEY="<funded base-sepolia test wallet private key>"
 *   $env:TRUSTMESH_LIVE_BUYER_AGENT_ID="<dedicated test buyer agent id>"
 *   $env:TRUSTMESH_LIVE_SERVICE_ID="<test service uuid>"
 *   node scripts/trustmesh-live-e2e.mjs            # or:  npm run test:trustmesh-live
 *
 * WHAT IT DOES ON-CHAIN. One real x402 EIP-3009 settlement on Base Sepolia testnet: the backend's
 * facilitator redeems the signed USDC transfer authorization, moving test USDC from the test wallet
 * to the provider's payTo. Real transaction on a real testnet. Human/Sean-only (MAJOR). CI-excluded.
 *
 * EXCLUDED FROM CI / DEFAULT JEST. jest.config.js uses roots:['tests'] + testMatch:['**\/*.test.ts'];
 * this is scripts/*.mjs, so it is never selected. It also fail-closes with no creds, which CI never
 * holds. The npm alias `test:trustmesh-live` is safe for the same reason.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

// ── Gate: validate env and FAIL CLOSED before importing the SDK, ethers, or touching anything. ──

const OPT_IN = { name: 'TRUSTMESH_LIVE_E2E', expect: '1' };
const REQUIRED = [
  'TRUSTMESH_LIVE_API_URL',
  'TRUSTMESH_LIVE_WALLET_KEY',
  'TRUSTMESH_LIVE_API_KEY',
  'TRUSTMESH_LIVE_BUYER_AGENT_ID',
  'TRUSTMESH_LIVE_SERVICE_ID',
];

function refuse(lines) {
  console.error('REFUSED: TrustMesh LIVE E2E is inert without explicit opt-in + credentials.');
  for (const l of lines) console.error('  - ' + l);
  console.error(
    '\nThis harness performs a REAL on-chain x402 settlement on Base Sepolia and is a human/Sean-only (MAJOR) action.',
  );
  console.error('It never falls back to the mock or to a production default. Supply the vars above and re-run.');
  process.exit(1);
}

const missing = [];
if (process.env[OPT_IN.name] !== OPT_IN.expect) {
  missing.push(`${OPT_IN.name} must equal "${OPT_IN.expect}" (explicit opt-in; currently ${process.env[OPT_IN.name] === undefined ? 'unset' : 'set to a different value'})`);
}
for (const name of REQUIRED) {
  if (!process.env[name] || process.env[name].trim() === '') missing.push(`${name} is required but ${process.env[name] === undefined ? 'unset' : 'empty'}`);
}
// Shape checks that are cheap and key-safe (never echo the secret value itself).
const apiUrl = (process.env.TRUSTMESH_LIVE_API_URL || '').trim();
if (apiUrl && !/^https:\/\//i.test(apiUrl)) {
  missing.push('TRUSTMESH_LIVE_API_URL must be https:// — the SDK only sends the Authorization header over https, so http would 401 on escrow');
}
const walletKey = process.env.TRUSTMESH_LIVE_WALLET_KEY || '';
if (walletKey && !/^0x[0-9a-fA-F]{64}$/.test(walletKey.trim())) {
  missing.push('TRUSTMESH_LIVE_WALLET_KEY must be a 0x-prefixed 32-byte hex private key (0x + 64 hex chars)');
}
if (missing.length > 0) refuse(missing);

// ── Gate passed: now (and only now) load the real SDK + signer and run the live flow. ──

import assert from 'node:assert/strict';

const BUYER_AGENT_ID = process.env.TRUSTMESH_LIVE_BUYER_AGENT_ID.trim();
const SERVICE_ID = process.env.TRUSTMESH_LIVE_SERVICE_ID.trim();
const DISPUTE_SERVICE_ID = (process.env.TRUSTMESH_LIVE_DISPUTE_SERVICE_ID || '').trim();
const POLL_TIMEOUT_MS = Number(process.env.TRUSTMESH_LIVE_POLL_TIMEOUT_MS || 300_000);
const POLL_INTERVAL_MS = Number(process.env.TRUSTMESH_LIVE_POLL_INTERVAL_MS || 5_000);

// SUCCESS terminals for the happy path — must NOT include disputed/cancelled.
const SUCCESS_TERMINALS = new Set(['fulfilled', 'settled', 'satisfied', 'resolved']);

const sdkUrl = new URL('../dist/lib/index.js', import.meta.url);
const { TrustShell, buildX402Payment, AGENT_ID_PATTERN } = await import(sdkUrl.href);
assert.ok(typeof TrustShell?.init === 'function', 'SDK import failed: TrustShell.init missing (run `npm run sdk:build` first)');
assert.ok(typeof buildX402Payment === 'function', 'SDK import failed: buildX402Payment missing (run `npm run sdk:build` first)');
assert.ok(AGENT_ID_PATTERN.test(BUYER_AGENT_ID), `TRUSTMESH_LIVE_BUYER_AGENT_ID "${BUYER_AGENT_ID}" is not a valid agent id (AGENT_ID_PATTERN)`);

// ethers only to derive + print the payer address (confirms Sean is spending from the wallet he
// intended) and to validate the key parses. The key signs inside buildX402Payment, not here.
const { Wallet } = await import('ethers');
const payerAddress = new Wallet(process.env.TRUSTMESH_LIVE_WALLET_KEY.trim()).address;

const log = (...a) => console.log(...a);
const first = (obj, keys) => { for (const k of keys) if (obj && obj[k] != null) return obj[k]; return undefined; };

/** Run one full A2A x402 settle flow against the live backend. Returns the terminal contract state. */
async function runOnce(client, serviceId, label) {
  log(`\n=== ${label}: service ${serviceId} ===`);

  // 1) Discover the target service (confirm it exists + is the test-labeled one we expect).
  const svc = await client.getService(serviceId);
  log(`  service: "${svc.serviceName}" (${svc.serviceType}) by provider ${svc.providerAgentId}, price ${svc.basePriceUsdcRaw} raw-USDC, active=${svc.active}`);
  assert.ok(svc.active, `service ${serviceId} is not active`);
  const price = svc.basePriceUsdcRaw;

  // 2) executeA2A WITHOUT a payment header -> backend answers 402 with x402 requirements.
  const probe = await client.executeA2A({ buyerAgentId: BUYER_AGENT_ID, serviceId, payload: { source: 'trustmesh-live-e2e', note: 'inert-harness test purchase' }, agreedPriceUsdcRaw: price });
  assert.ok(probe.paymentRequired, `expected a 402 payment_required on the unpaid probe, got status "${probe.status}"`);
  const accept = probe.paymentRequired.accepts?.[0];
  assert.ok(accept && accept.payTo && accept.maxAmountRequired, 'the 402 did not carry a usable x402 requirement (accepts[0].payTo / maxAmountRequired)');
  log(`  402 received: pay ${accept.maxAmountRequired} of asset ${accept.asset} to ${accept.payTo} (pending contract ${probe.contractId})`);

  // 3) Build + sign the REAL x402 EIP-3009 payment with the funded test wallet. cap = agreed price.
  const xPaymentHeader = await buildX402Payment({
    privateKey: process.env.TRUSTMESH_LIVE_WALLET_KEY.trim(),
    to: accept.payTo,
    amount: accept.maxAmountRequired,
    cap: price,
    origin: 'Market',
    ...(accept.asset ? { asset: accept.asset } : {}),
  });
  log(`  signed x402 authorization from ${payerAddress} (EIP-3009, local sign)`);

  // 4) executeA2A WITH the header -> escrow; the backend/facilitator redeems the on-chain transfer.
  const escrowed = await client.executeA2A({ buyerAgentId: BUYER_AGENT_ID, serviceId, payload: { source: 'trustmesh-live-e2e', note: 'inert-harness test purchase' }, agreedPriceUsdcRaw: price, xPaymentHeader });
  assert.equal(escrowed.status, 'escrowed', `expected status "escrowed" after submitting payment, got "${escrowed.status}"`);
  assert.ok(escrowed.settlementId, 'escrow returned no settlementId (x402_payment_id)');
  log(`  escrowed: contract ${escrowed.contractId}, settlement id ${escrowed.settlementId}`);

  // 5) Poll to a terminal state (async settlement; generous timeout).
  log(`  polling for terminal status (interval ${POLL_INTERVAL_MS}ms, timeout ${POLL_TIMEOUT_MS}ms)...`);
  const state = await client.pollUntilSettled(escrowed.contractId, { intervalMs: POLL_INTERVAL_MS, timeoutMs: POLL_TIMEOUT_MS });

  const txRef = first(state.result, ['txHash', 'transactionHash', 'settlement_tx', 'settlementTx', 'tx_hash']);
  log(`  terminal: status "${state.status}", settlement id ${state.settlementId ?? '(none)'}${txRef ? `, on-chain tx ${txRef}` : ''}`);
  return state;
}

async function main() {
  log('TrustMesh LIVE A2A E2E — opt-in confirmed. Running the REAL on-chain flow.');
  log(`  backend:      ${apiUrl}`);
  log(`  buyer agent:  ${BUYER_AGENT_ID}`);
  log(`  payer wallet: ${payerAddress}`);

  const { client, health } = await TrustShell.init({ apiUrl, apiKey: process.env.TRUSTMESH_LIVE_API_KEY.trim() });
  assert.ok(health.ok, `backend health probe failed: ${JSON.stringify(health)}`);
  log(`  health: ${health.status} (ok=${health.ok})`);

  // Happy path — assert a SUCCESS terminal (not disputed/cancelled).
  const settled = await runOnce(client, SERVICE_ID, 'HAPPY PATH');
  assert.ok(SUCCESS_TERMINALS.has(settled.status), `happy-path contract did not reach a success terminal; got "${settled.status}" (disputed/cancelled would mean the service did not deliver)`);
  assert.ok(settled.settlementId, 'settled contract is missing its settlement id (verifiable linkage lost)');

  // Optional dispute path — only if the human supplied a contested test service.
  if (DISPUTE_SERVICE_ID) {
    const disputed = await runOnce(client, DISPUTE_SERVICE_ID, 'DISPUTE PATH');
    assert.equal(disputed.status, 'disputed', `expected the contested service to settle "disputed", got "${disputed.status}"`);
  }

  log('\n──────── SUMMARY ────────');
  log(`contract id:   ${settled.contractId}`);
  log(`settlement id: ${settled.settlementId}`);
  const txRef = first(settled.result, ['txHash', 'transactionHash', 'settlement_tx', 'settlementTx', 'tx_hash']);
  log(`on-chain tx:   ${txRef ?? '(not reported in the contract result; check the settlement id against the backend / BaseScan)'}`);
  log(`final status:  ${settled.status}`);
  log('PASS — live A2A x402 flow reached a verifiable terminal state.');
}

main().catch((err) => {
  console.error('\nFAILED:', err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
