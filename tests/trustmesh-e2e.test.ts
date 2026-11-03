/**
 * TrustMesh A2A micro-transaction — end-to-end, two scoped agents, against a faithful LOCAL mock.
 *
 * WHAT THIS IS. One end-to-end exercise of the SDK's agent-to-agent (A2A) payment flow, driving the
 * REAL client code in src/lib/trustshell.ts — TrustShell.init → listServices/getService →
 * executeA2A (HTTP 402 → buildX402Payment → escrow) → getContractStatus/pollUntilSettled — over
 * actual HTTP against `tests/trustmesh-mock-backend.ts`. The mock binds to 127.0.0.1 on an ephemeral
 * port; there is no external network, no live repid-engine, no chain and no funds. The x402 signer is
 * a THROWAWAY random wallet (ethers), signing EIP-712 locally only — the mock never checks a payment
 * on-chain, it only requires a well-formed `X-PAYMENT` header to be present.
 *
 * WHAT THIS IS NOT. This is a CLIENT-FLOW E2E against a contract-faithful mock: it proves the SDK
 * speaks its own documented A2A protocol correctly. It is NOT evidence that the live backend matches
 * those shapes. A live-backend E2E (real repid-engine + real x402 on Base Sepolia) is a separate
 * follow-up.
 *
 * TRUSTSHELL_HOME is pointed at an empty temp dir so the SDK's owner-policy Guard takes its
 * documented "no policy → allow" path (src/lib/guardrails.ts sdkGuard, C9) — the same posture CI
 * runs under — making the run hermetic and independent of the developer's ~/.trustshell. No SDK
 * source is modified; the flow is pointed at the mock purely through the public `apiUrl` config.
 *
 * A NOTE ON WHAT THE SDK ACTUALLY DOES. executeA2A() ALWAYS creates a fresh contract (step 1) before
 * escrow (step 2) — see trustshell.ts:1419-1443. So the documented "receive 402, then call
 * executeA2A again with the header" (trustshell.ts:1403-1406) creates a SECOND contract and escrows
 * that one; the first contract stays `pending`. This test asserts exactly that observed behavior
 * rather than papering over it.
 */
import { Wallet } from 'ethers';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TrustShell,
  buildX402Payment,
  AGENT_ID_PATTERN,
  type A2AResult,
} from '../src/lib/index';
import { startMockBackend, isWellFormedX402, type MockBackend, type MockService } from './trustmesh-mock-backend';

const REQUESTER_ID = 'trustmesh:requester:e2e';
const PROVIDER_ID = 'trustmesh:provider:e2e';
const SERVICE_FULFIL = '11111111-1111-4111-8111-111111111111';
const SERVICE_DISPUTE = '22222222-2222-4222-8222-222222222222';
const PRICE = 100000; // 0.10 USDC in raw micro-USDC.

/** x402 requirement shape the SDK echoes back opaquely (A2AResult.paymentRequired.accepts[]). */
type X402Requirement = { payTo: string; maxAmountRequired: string; asset: string };

let backend: MockBackend;
let requester: TrustShell;
let provider: TrustShell;
let requesterWallet: ReturnType<typeof Wallet.createRandom>;
let savedHome: string | undefined;

beforeAll(async () => {
  // Hermetic owner-policy Guard: an empty home → sdkGuard's documented no-policy allow (C9).
  savedHome = process.env.TRUSTSHELL_HOME;
  process.env.TRUSTSHELL_HOME = mkdtempSync(join(tmpdir(), 'trustmesh-home-'));

  // Throwaway signer + provider payout address — both random, unfunded, never on a real chain.
  requesterWallet = Wallet.createRandom();
  const providerPayTo = Wallet.createRandom().address;

  const services: MockService[] = [
    {
      id: SERVICE_FULFIL,
      provider_agent_id: PROVIDER_ID,
      service_type: 'verification',
      service_name: 'claim-check',
      description: 'Checks a claim and returns a verdict.',
      base_price_usdc_raw: PRICE,
      min_repid_to_purchase: 0,
      active: true,
      settlesTo: 'fulfilled',
    },
    {
      id: SERVICE_DISPUTE,
      provider_agent_id: PROVIDER_ID,
      service_type: 'verification',
      service_name: 'claim-check-contested',
      description: 'A service whose delivery is contested, settling in dispute.',
      base_price_usdc_raw: PRICE,
      min_repid_to_purchase: 0,
      active: true,
      settlesTo: 'disputed',
    },
  ];

  backend = await startMockBackend({ services, providerPayTo });

  // TWO scoped SDK clients, both pointed at the local mock. The mock plays the provider/backend;
  // `provider` is the provider agent's own client (used for catalog discovery of its listing).
  requester = (await TrustShell.init({ apiUrl: backend.baseUrl })).client;
  provider = (await TrustShell.init({ apiUrl: backend.baseUrl })).client;
});

afterAll(async () => {
  await backend?.close();
  if (savedHome === undefined) delete process.env.TRUSTSHELL_HOME;
  else process.env.TRUSTSHELL_HOME = savedHome;
});

it('both scoped agent ids are valid per AGENT_ID_PATTERN', () => {
  expect(AGENT_ID_PATTERN.test(REQUESTER_ID)).toBe(true);
  expect(AGENT_ID_PATTERN.test(PROVIDER_ID)).toBe(true);
  expect(REQUESTER_ID).not.toBe(PROVIDER_ID);
});

it('init reaches the local backend health probe for both clients', async () => {
  const { health } = await TrustShell.init({ apiUrl: backend.baseUrl });
  expect(health.ok).toBe(true);
  expect(health.checked).toBe(true);
  expect(health.status).toBe('ok');
});

it('HAPPY PATH: discover → create → 402 → sign x402 → escrow → poll escrowed→fulfilled → receipt', async () => {
  // 1) Provider confirms its own listing is in the catalog (second scoped client, provider side).
  const listed = await provider.getService(SERVICE_FULFIL);
  expect(listed.providerAgentId).toBe(PROVIDER_ID);
  expect(listed.basePriceUsdcRaw).toBe(PRICE);

  // 2) Requester discovers services.
  const page = await requester.listServices();
  expect(page.services.map((s) => s.id)).toContain(SERVICE_FULFIL);
  expect(page.priceRangeUsdcRaw).toEqual({ min: PRICE, max: PRICE });

  // 3) Create contract WITHOUT a payment header → backend answers 402 with x402 requirements.
  const first: A2AResult = await requester.executeA2A({
    buyerAgentId: REQUESTER_ID,
    serviceId: SERVICE_FULFIL,
    payload: { claim: 'the sky is blue' },
    agreedPriceUsdcRaw: PRICE,
  });
  expect(first.paymentRequired).toBeDefined();
  expect(first.status).toBe('pending');
  expect(first.settlementId).toBeUndefined();
  const req0 = first.paymentRequired!.accepts[0] as X402Requirement;
  expect(req0.payTo).toBe(backend.providerPayTo);
  expect(req0.maxAmountRequired).toBe(String(PRICE));
  const pendingContractId = first.contractId;

  // 4) Build + sign the x402 payment with the throwaway wallet (local EIP-712 sign; no chain).
  const xPaymentHeader = await buildX402Payment({
    privateKey: requesterWallet.privateKey,
    to: req0.payTo,
    amount: req0.maxAmountRequired,
    cap: PRICE,
    origin: 'Market',
    asset: req0.asset,
  });
  expect(typeof xPaymentHeader).toBe('string');
  expect(isWellFormedX402(xPaymentHeader)).toBe(true);

  // 5) Retry WITH the header → escrow succeeds, a settlement id is returned.
  const escrowed: A2AResult = await requester.executeA2A({
    buyerAgentId: REQUESTER_ID,
    serviceId: SERVICE_FULFIL,
    payload: { claim: 'the sky is blue' },
    agreedPriceUsdcRaw: PRICE,
    xPaymentHeader,
  });
  expect(escrowed.status).toBe('escrowed');
  expect(escrowed.paymentRequired).toBeUndefined();
  expect(escrowed.settlementId).toBeTruthy();
  // The SDK creates a fresh contract on the retry; the unpaid one stays pending (not silently escrowed).
  expect(escrowed.contractId).not.toBe(pendingContractId);
  const stillPending = await requester.getContractStatus(pendingContractId);
  expect(stillPending.status).toBe('pending');
  expect(stillPending.settlementId).toBeUndefined();

  // 6) Poll the escrowed contract to a terminal, verifiable receipt: escrowed → fulfilled.
  const settled = await requester.pollUntilSettled(escrowed.contractId, {
    intervalMs: 5,
    timeoutMs: 3000,
  });
  expect(settled.status).toBe('fulfilled');
  // The settlement id from escrow is carried through to the fulfilled receipt (verifiable linkage).
  expect(settled.settlementId).toBe(escrowed.settlementId);
  expect(settled.result).toMatchObject({ ok: true });

  // The 402 probe really hit escrow once with no payment, and the retry carried one.
  const escrowCalls = backend.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/escrow'));
  expect(escrowCalls.some((r) => r.hadPayment === false)).toBe(true);
  expect(escrowCalls.some((r) => r.hadPayment === true)).toBe(true);
});

it('DISPUTE PATH: a paid contract that settles in dispute is surfaced as disputed, not a silent success', async () => {
  // Create → 402 → sign → escrow, same as the happy path, against the dispute service.
  const first = await requester.executeA2A({
    buyerAgentId: REQUESTER_ID,
    serviceId: SERVICE_DISPUTE,
    payload: { claim: 'contested' },
    agreedPriceUsdcRaw: PRICE,
  });
  expect(first.paymentRequired).toBeDefined();
  const req0 = first.paymentRequired!.accepts[0] as X402Requirement;

  const xPaymentHeader = await buildX402Payment({
    privateKey: requesterWallet.privateKey,
    to: req0.payTo,
    amount: req0.maxAmountRequired,
    cap: PRICE,
    origin: 'Market',
    asset: req0.asset,
  });

  const escrowed = await requester.executeA2A({
    buyerAgentId: REQUESTER_ID,
    serviceId: SERVICE_DISPUTE,
    payload: { claim: 'contested' },
    agreedPriceUsdcRaw: PRICE,
    xPaymentHeader,
  });
  expect(escrowed.status).toBe('escrowed');
  expect(escrowed.settlementId).toBeTruthy();

  // Poll to terminal. The default terminal set includes `disputed` (trustshell.ts:1713-1715), so
  // pollUntilSettled RESOLVES on dispute — it does not throw and does not report success.
  const terminal = await requester.pollUntilSettled(escrowed.contractId, {
    intervalMs: 5,
    timeoutMs: 3000,
  });
  expect(terminal.status).toBe('disputed');
  // Explicitly NOT any success status — the dispute is surfaced, never swallowed as settled.
  expect(['fulfilled', 'settled', 'satisfied', 'resolved']).not.toContain(terminal.status);
  expect(terminal.result).toMatchObject({ ok: false });
});
