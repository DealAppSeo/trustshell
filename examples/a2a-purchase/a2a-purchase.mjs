/**
 * @hyperdag/trustshell — full A2A showcase buy (init → discover → buy → poll → prove)
 *
 * This is the reference end-to-end script for the agent-to-agent purchase loop. It uses ONLY the
 * SDK (no hand-rolled HTTP) to drive the whole journey against the LIVE repid-engine:
 *
 *   1. TrustShell.init()      — live /health probe (fail fast)
 *   2. listServices()         — read the marketplace catalog, pick a "verification" service
 *   3. buildX402Payment()     — sign an EIP-3009 x402 payment header (only the signature travels)
 *   4. executeA2A()           — create the service contract + escrow the payment
 *   5. pollUntilSettled()     — await async fulfillment by the provider agent
 *   6. presentProof()         — show the buyer's ZKP RepID postcard proof
 *
 * SAFE BY DEFAULT: without the required env this script prints exactly what it needs and exits 0
 * (no crash, no fabricated settlement). `init()` + `presentProof()` run with no key; discovery
 * (`listServices`) and the buy legs need a key — see the auth note below.
 *
 * AUTH NOTE [verified 2026-07-06 against the live engine]: unlike the read paths in the quickstart
 * (repid / proof / hal-evaluate are auth-bypassed), the marketplace endpoints `GET /api/v1/services`
 * and `POST /api/v1/contracts` are NOT public — they 401 without a valid REPID_API_KEY. So this
 * showcase needs the key from the very first discovery call.
 *
 * Run:  node a2a-purchase.mjs
 *
 * Required env for the LIVE buy (set via a dotenv file / your shell — NEVER on the command line):
 *   REPID_API_KEY          the buyer agent's API key (from register(); must match the deployed allowlist)
 *   TRUSTSHELL_BUYER_AGENT the buyer agent UUID the key is bound to
 *   TRUSTSHELL_PAYER_KEY   a funded Base Sepolia private key (0x…) used to sign the x402 payment
 * Optional:
 *   TRUSTSHELL_API_URL     override the engine URL (defaults to the live production engine)
 *   TRUSTSHELL_SERVICE_ID  buy this specific service instead of auto-picking a "verification" one
 *   TRUSTSHELL_PAY_TO      the provider payTo address to sign the x402 payment against (see note in-code)
 */
import { TrustShell, buildX402Payment } from '@hyperdag/trustshell';

const API_URL = process.env.TRUSTSHELL_API_URL || 'https://repid-engine-production.up.railway.app';
const API_KEY = process.env.REPID_API_KEY;
const BUYER_AGENT = process.env.TRUSTSHELL_BUYER_AGENT;
const PAYER_KEY = process.env.TRUSTSHELL_PAYER_KEY;
const SERVICE_ID = process.env.TRUSTSHELL_SERVICE_ID;

const log = (...a) => console.log(...a);

// --- 1. init() — always runs (public /health probe). -----------------------------------------
const { client, health } = await TrustShell.init({
  apiUrl: API_URL,
  ...(API_KEY ? { apiKey: API_KEY } : {}),
  timeout: 60_000,
});
if (!health.ok) {
  log(`✗ backend unreachable: ${health.error ?? 'unknown'}`);
  process.exit(1);
}
log(`✓ init: backend healthy (status=${health.status})`);

// If a buyer id is known, show their RepID proof up front — this leg needs no key.
if (BUYER_AGENT) {
  try {
    const rep = await client.getRepID(BUYER_AGENT);
    log(`✓ buyer ${BUYER_AGENT}: RepID ${rep.repid} (${rep.tier})`);
  } catch (e) {
    log(`  (could not read buyer RepID: ${e.message})`);
  }
}

// --- Env guard. Discovery + buy both need a key (marketplace is auth-gated — see AUTH NOTE). ---
const missing = [];
if (!API_KEY) missing.push('REPID_API_KEY (buyer agent API key from register(); also gates discovery)');
if (!BUYER_AGENT) missing.push('TRUSTSHELL_BUYER_AGENT (buyer agent UUID the key is bound to)');
if (!PAYER_KEY) missing.push('TRUSTSHELL_PAYER_KEY (funded Base Sepolia private key to sign x402)');

if (missing.length) {
  log('\n— stopping before discovery/buy (init done). To run the FULL live loop, set:');
  for (const m of missing) log(`    • ${m}`);
  log('\nThese are the only things standing between this script and a real on-chain A2A purchase.');
  log('Tip: get a buyer agent + key with client.register({ agentName }) — the api_key is shown ONCE.');
  process.exit(0); // clean exit — no crash, no faked settlement.
}

// --- 2. listServices() — needs a key (marketplace is auth-gated). Pick a "verification" service.
const catalog = await client.listServices({ type: 'verification' });
log(`✓ discover: ${catalog.count} verification service(s) in the catalog`);
if (catalog.priceRangeUsdcRaw) {
  const { min, max } = catalog.priceRangeUsdcRaw;
  log(`  price range: ${(min / 1e6).toFixed(2)}–${(max / 1e6).toFixed(2)} USDC`);
}

const chosen = SERVICE_ID
  ? await client.getService(SERVICE_ID)
  : catalog.services.find((s) => s.active) ?? catalog.services[0];

if (!chosen) {
  log('  (no verification service is currently listed — nothing to buy right now)');
  log('  A provider must list one via POST /api/v1/services first. Exiting cleanly.');
  process.exit(0);
}
log(`  picked: "${chosen.serviceName}" (${chosen.id}) — ${(chosen.basePriceUsdcRaw / 1e6).toFixed(2)} USDC, min RepID ${chosen.minRepidToPurchase}`);

// --- 3. buildX402Payment() — sign the EIP-3009 authorization (key never logged). ---------------
log('\n→ signing x402 payment (EIP-3009 TransferWithAuthorization)…');
const provider = await client.getService(chosen.id); // refresh to get the current payTo/provider
const xPaymentHeader = await buildX402Payment({
  privateKey: PAYER_KEY,
  // The provider's payTo comes back in the 402 requirements; for the happy path we sign for the
  // provider agent's wallet. If you don't know it yet, call executeA2A() once WITHOUT a header to
  // get the backend's `paymentRequired.accepts[0].payTo`, then sign against that and retry.
  to: process.env.TRUSTSHELL_PAY_TO || provider.providerAgentId, // overrideable; see note above
  amount: chosen.basePriceUsdcRaw,
});
log('✓ payment signed (only the signed authorization travels; the private key never leaves memory)');

// --- 4. executeA2A() — create the contract + escrow the payment. ------------------------------
log('\n→ executeA2A: create contract + escrow…');
const a2a = await client.executeA2A({
  buyerAgentId: BUYER_AGENT,
  serviceId: chosen.id,
  payload: { claim: 'The capital of France is Paris.', task: 'verify-a-claim' },
  xPaymentHeader,
});

if (a2a.paymentRequired) {
  // The backend told us its exact requirements — re-sign against accepts[0].payTo and retry.
  const req = a2a.paymentRequired.accepts?.[0] ?? {};
  log(`  backend returned 402 payment-required. Sign for payTo=${req.payTo ?? '(see accepts)'} and retry.`);
  log(`  set TRUSTSHELL_PAY_TO=${req.payTo ?? '<payTo from accepts>'} and re-run to complete escrow.`);
  process.exit(0);
}
log(`✓ contract ${a2a.contractId} — status=${a2a.status}${a2a.settlementId ? ` (settlement ${a2a.settlementId})` : ''}`);

// --- 5. pollUntilSettled() — await async fulfillment by the provider agent. --------------------
log('\n→ pollUntilSettled: awaiting provider fulfillment…');
try {
  const final = await client.pollUntilSettled(a2a.contractId, { intervalMs: 3000, timeoutMs: 120_000 });
  log(`✓ contract reached terminal status: ${final.status}`);
  if (final.result) log(`  provider result: ${JSON.stringify(final.result).slice(0, 200)}`);
} catch (err) {
  // A timeout here is honest, not a crash: fulfillment is async (provider agent / cascade worker).
  log(`  (not yet settled: ${err.message})`);
  log('  Fulfillment is asynchronous — re-check later with client.getContractStatus(contractId).');
}

// --- 6. presentProof() — the buyer's ZKP RepID postcard proof. --------------------------------
log('\n→ presentProof: buyer RepID postcard proof…');
const proof = await client.presentProof(BUYER_AGENT);
log(`✓ proof tier=${proof.tier} scheme=${proof.scheme} bytes=${proof.proofBytes.length}`);
if (proof.statement) {
  log(`  statement: RepID ${proof.statement.repid_score} ≥ threshold ${proof.statement.threshold} (tier ${proof.statement.tier})`);
}

log('\nFull A2A journey complete: init → discover → buy → poll → prove — all through the SDK.');
