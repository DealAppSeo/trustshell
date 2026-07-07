# @hyperdag/trustshell — 60-second Quickstart

Add live HAL (Hallucination Assessment Layer) trust scoring to any LLM/agent output
in three lines, against the **live** repid-engine. The read paths below need **no API key**.

> **Verified timing (2026-07-06, fresh sandbox, cold):**
> `npm install` **5.7s** + first two live verified calls **8.0s** = **~14s install-to-first-verified-call** — well under the 60-second target.
> Live backend: `https://repid-engine-production.up.railway.app` (`/health` → `{"status":"ok","version":"1.0.0","supabaseConnected":true}`).

---

## 1. Install

```bash
npm install @hyperdag/trustshell
```

The SDK ships a **dependency diet**: the published tarball is 6 files (the `dist/` SDK
output only). `npm install` pulls just `@hyperdag/proof-verifier` + `ethers` — no Next.js,
React, or Supabase tree. That is why install lands in single-digit seconds.

## 2. Verify an agent output (no key required)

```js
// quickstart.mjs  —  node quickstart.mjs
import { TrustShell } from '@hyperdag/trustshell';

// init() constructs the client AND does a live /health probe — fail fast if the backend is down.
const { client, health } = await TrustShell.init();     // defaults to the live engine URL
if (!health.ok) throw new Error(`backend unreachable: ${health.error}`);

// verifyOutput() runs the text through the live HAL quorum and returns an honest verdict.
const r = await client.verifyOutput('The capital of France is Paris.');
console.log(r.verdict, r.trustScore, r.halScore);       // e.g. PASS 100 0
console.log(r.evidence);                                // e.g. ["cerebras:TRUE (Paris is the capital of France.)"]
```

Run it:

```bash
node quickstart.mjs
```

A runnable copy is in this folder: **[`quickstart.mjs`](./quickstart.mjs)** — it verifies both a
truthful and a false claim and prints the wall-clock time to the first verified call.

**Import note:** use the **named** import `import { TrustShell }`. It resolves cleanly from both
ESM and CommonJS. (The SDK is a CommonJS build; a bare `import TrustShell from '...'` default import
binds to the module namespace under Node's CJS→ESM interop, not the class — always destructure.)

## 3. Read a RepID (no key required)

```js
const rep = await client.getRepID('sophia');
console.log(rep.repid, rep.tier);   // e.g. 1027 ESTABLISHED  (live cached read)
```

---

## What runs live with NO key

| Call | Endpoint | Key? | Notes |
|---|---|---|---|
| `TrustShell.init()` | `GET /health` | no | live reachability probe |
| `verifyOutput()` / `score()` | `POST /api/v1/hal/evaluate` | no | live cross-provider HAL quorum |
| `getRepID()` / `verify()` | `GET /api/v1/repid/:id` | no | live cached RepID + tier |
| `presentProof()` | `GET /api/v1/repid/:uuid/proof` | no | live `plonky3_range_check` postcard proof |
| `audit()` | `GET /api/v1/audit/verify` | no | hash-chain audit status |

## What needs a key / a wallet (write paths)

| Call | Needs | Why |
|---|---|---|
| `executeA2A()` | `REPID_API_KEY` bound to the buyer agent **+** a funded Base Sepolia wallet | creates a `service_contracts` row and (optionally) escrows via x402 EIP-3009. The create leg needs the key; the escrow/settlement leg needs the funded wallet. The SDK never fabricates a settlement — with no payment header it returns the backend's 402 `paymentRequired` echo. |

Set the key via env (never on the command line):

```bash
# .env  →  REPID_API_KEY=...   (must match the deployed Railway allowlist)
```

---

## Honest live caveat (2026-07-06)

`verifyOutput()` surfaces the **raw** `halScore` (0–1 risk) and per-provider `evidence` faithfully.
The backend's summary `verdict` can currently under-call a hard **VETO** when the provider quorum is
degraded (e.g. one provider rate-limited/401, leaving a single responder). Example observed today:
a false claim ("Eiffel Tower is in Rome") returned `halScore=1.0, trustScore=0,
evidence=["cerebras:FALSE (...)"]` but backend `decision=clean` because only 1 of 3 providers
answered. **Trust `halScore` + `evidence`** — they carry the real signal even when the rolled-up
verdict is soft. This is a backend provider-key/quorum issue (tracked in engine state), not an SDK
defect; the SDK's contract is to report what the engine returns without smoothing it over.
