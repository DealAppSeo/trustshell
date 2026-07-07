# A2A Purchase — full showcase buy (`init → discover → buy → poll → prove`)

The reference end-to-end script for the **agent-to-agent purchase loop**, driven entirely through
`@hyperdag/trustshell` (no hand-rolled HTTP), against the **live** repid-engine.

```bash
node a2a-purchase.mjs
```

## What it does

| Step | SDK call | Endpoint | Needs |
|---|---|---|---|
| 1. init | `TrustShell.init()` | `GET /health` | — |
| (buyer proof) | `getRepID(buyer)` | `GET /api/v1/repid/:id` | — |
| 2. discover | `listServices({ type: 'verification' })` / `getService(id)` | `GET /api/v1/services` | **API key** |
| 3. sign payment | `buildX402Payment({ privateKey, to, amount })` | *(local ethers signing)* | funded wallet key |
| 4. buy | `executeA2A({ buyerAgentId, serviceId, payload, xPaymentHeader })` | `POST /api/v1/contracts` (+ `/escrow`) | **API key** |
| 5. poll | `pollUntilSettled(contractId)` | `GET /api/v1/contracts/:id` | **API key** |
| 6. prove | `presentProof(buyer)` | `GET /api/v1/repid/:uuid/proof` | — |

## Safe by default

Run it with **no environment set** and it does the free legs (`init`, and the buyer RepID read if a
buyer id is given), then prints exactly what it needs and **exits 0** — no crash, no fabricated
settlement.

## Auth note (verified 2026-07-06 against the live engine)

Unlike the quickstart read paths (`repid` / `proof` / `hal/evaluate` are auth-bypassed), the
**marketplace endpoints are NOT public**: `GET /api/v1/services` and `POST /api/v1/contracts` return
`401` without a valid `REPID_API_KEY`. So this showcase needs the key from the first discovery call
onward — not just for the paid leg.

## Environment for the full live buy

Set these via a dotenv file or your shell — **never on the command line**:

| Env var | Required | What |
|---|---|---|
| `REPID_API_KEY` | yes | The buyer agent's API key. Get one from `client.register({ agentName })` — the `api_key` is **shown once**. Must match the deployed Railway allowlist. |
| `TRUSTSHELL_BUYER_AGENT` | yes | The buyer agent **UUID** the key is bound to. |
| `TRUSTSHELL_PAYER_KEY` | yes | A **funded Base Sepolia** private key (`0x…`) used to sign the x402 EIP-3009 payment. Only the signed authorization travels; the key never leaves memory and is never logged. |
| `TRUSTSHELL_API_URL` | no | Override the engine URL (defaults to the live production engine). |
| `TRUSTSHELL_SERVICE_ID` | no | Buy this specific service instead of auto-picking a `verification` one. |
| `TRUSTSHELL_PAY_TO` | no | The provider `payTo` address to sign the x402 payment against. If you don't know it, run once **without** a payment header — `executeA2A` returns the backend's `paymentRequired.accepts[0].payTo`; set that here and re-run. |

## Getting a buyer agent + key first

```js
import { TrustShell } from '@hyperdag/trustshell';
const { client } = await TrustShell.init();
const reg = await client.register({ agentName: 'my-buyer-agent', llmProvider: 'anthropic' });
// reg.apiKey is shown ONCE — save it now (e.g. to your secret store), then:
//   REPID_API_KEY=<reg.apiKey>  TRUSTSHELL_BUYER_AGENT=<reg.agentId>
```

## What's real vs. asynchronous

- The **create + escrow** legs are real: `executeA2A` creates a `service_contracts` row and (with a
  signed `xPaymentHeader`) escrows the x402 payment.
- **Fulfillment is asynchronous** — a provider agent / the cascade settlement worker picks the
  contract up. `pollUntilSettled` awaits that; a timeout is honest (re-check later with
  `getContractStatus`), not a crash. The SDK never fabricates a settlement.
