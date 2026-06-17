<div align="center">

# @hyperdag/trustshell

**Add HAL hallucination filtering, ZKP-proven RepID, and A2A micro-tx to any AI agent.**  
Drop in 3 lines. No rearchitecting.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://github.com/DealAppSeo/hyperdag-protocol)

</div>

---

## Install

```bash
npm install @hyperdag/trustshell
```

**~2 packages. Seconds.** The SDK ships no Next.js, React, Supabase, or other app-framework baggage. The only runtime dependency is `@hyperdag/proof-verifier` (the WASM ZKP verifier, bundled).

---

## 60-second quickstart

```typescript
import { TrustShell } from '@hyperdag/trustshell';

// 1. Connect and confirm the backend is reachable
const { client, health } = await TrustShell.init({
  apiKey: 'your-api-key',   // from repid.dev/start
});
console.log(health); // { ok: true, status: 'ok' }

// 2. Verify any LLM output through HAL
const result = await client.verifyOutput(
  'The Eiffel Tower is located in London.'
);

console.log(result.ok);          // false — hallucination caught
console.log(result.verdict);     // 'VETO'
console.log(result.trustScore);  // 0–100 (lower = more suspicious)
console.log(result.halScore);    // 0–1 raw HAL score
console.log(result.decisionReason);
// e.g. "VETO — hal_score 0.91 via fact-check (3 providers quorum)"
console.log(result.evidence);
// e.g. ["groq:FALSE (Eiffel Tower is in Paris, not London)", "mistral:FALSE ..."]

// 3. Read the Glass Box — structured SBFA decision trace
if (result.glassBox) {
  console.log(result.glassBox.decision);          // 'act' | 'hold' | 'abstain' | 'escalate'
  console.log(result.glassBox.weightedAgreement); // 0–1
  console.log(result.glassBox.lines);             // human-readable step-by-step trace
  console.log(result.glassBox.votes);             // per-validator evidence breakdown
}
```

### Reading the verdict

| Field | Type | Meaning |
|---|---|---|
| `ok` | `boolean` | `true` unless HAL hard-vetoed. A soft FLAG still passes (`ok: true`). |
| `verdict` | `'PASS' \| 'FLAG' \| 'VETO'` | `VETO` = hallucination detected; `FLAG` = soft flag (opinion/time-sensitive); `PASS` = clean. |
| `trustScore` | `number` (0-100) | 100 minus risk. 100 = fully trusted; 0 = hard veto. |
| `halScore` | `number` (0-1) | Raw HAL score from the engine (higher = more suspicious). |
| `decisionReason` | `string` | Human-readable quorum summary ("VETO — hal_score 0.91 via fact-check…"). |
| `evidence` | `string[]` | Per-provider verdicts ("groq:FALSE (reason)", "mistral:TRUE"). Present on the fact-check path. |
| `soft` | `boolean` | `true` when verdict is `FLAG` — category-aware soft flag, still passes. |
| `glassBox` | `object \| undefined` | Full SBFA trace: votes, weights, quorum math. Present when the backend runs the fact-check quorum. |

---

## getRepID — fetch an agent's reputation

```typescript
// Public read — no API key required
const rep = await client.getRepID('trinity-shofet');

console.log(rep.agentId);         // 'trinity-shofet'
console.log(rep.repid);           // e.g. 2940
console.log(rep.tier);            // 'ESTABLISHED'
console.log(rep.lastAnchorTx);    // on-chain tx hash of latest EAS anchor, or null
console.log(rep.latestProofHash); // hash of the latest Plonky3 proof, or null
```

Tiers: `PROBATIONARY` (0-499) → `EARNING` (500-999) → `ESTABLISHED` (1000-4999) → `AUTONOMOUS` (5000-7999) → `VETERAN` (8000+).

---

## presentProof — ZKP range proof, WASM-verifiable client-side

```typescript
// Fetch the agent's latest Plonky3 range proof
const proof = await client.presentProof('trinity-shofet');

console.log(proof.tier);       // 'postcard' (the production-live tier)
console.log(proof.scheme);     // 'plonky3_range_check'
console.log(proof.proofBytes); // base64-encoded STARK proof bytes
console.log(proof.statement);
// { agent_id: 'trinity-shofet', repid_score: 2940, threshold: 499, tier: 'ESTABLISHED' }
console.log(proof.createdAt);  // ISO timestamp

// Optionally verify client-side with the bundled WASM verifier
const proofWithVerify = await client.presentProof('trinity-shofet', { verify: true });
console.log(proofWithVerify.verification);
// { verified: true, error: null, verifierVersion: '0.2.0' }
```

You can also call the verifier directly:

```typescript
import { verify } from '@hyperdag/trustshell';

const result = await verify(proof.proofBytes, proof.statement);
console.log(result.verified);          // true
console.log(result.verifier_version);  // '0.2.0'
```

**What the proof proves:** the agent's RepID exceeds a threshold (e.g. RepID > 499 = ESTABLISHED), without revealing the exact score. The proof is a real Plonky3 STARK on the BabyBear field, pinned to revision `27d59f73`. Client-side verification runs via WASM — no server round-trip needed to check a proof.

**Current status (testnet):** Proofs are issued and verifiable today on Base Sepolia. Mainnet anchoring is post-V1.

---

## ERC-8004 — on-chain agent identity and reputation

RepID deltas are anchored on-chain as ERC-8004 reputation attestations. The `reputation` module exposes direct read helpers against the live contracts.

### Contract addresses (Base Sepolia, chain 84532)

| Contract | Address |
|---|---|
| IdentityRegistry (ERC-8004, UUPS) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663...` *(verify via `repid.dev/contracts`)* |

```typescript
import {
  getRepID,
  getReputationHistory,
  getAttestation,
} from '@hyperdag/trustshell/dist/reputation'; // direct module import

const options = {
  rpcUrl: 'https://sepolia.base.org',
  identityRegistryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};

// Query on-chain reputation summary for an agent by token ID or address
const summary = await getRepID(1585, options);
console.log(summary.count);    // number of attestations
console.log(summary.value);    // bigint score
console.log(summary.decimals); // decimal precision

// Recent attestation history
const history = await getReputationHistory(1585, { ...options, limit: 10 });
for (const item of history) {
  console.log(item.clientAddress, item.value.toString(), item.tag1);
}

// Decode a specific attestation by tx hash
const attestation = await getAttestation('0xe372d84d...', options);
console.log(attestation.agentId, attestation.feedbackURI);
```

**What's live:** 5 real EAS anchors are on-chain (Base Sepolia, attester `0x4F8AD3fB35473b6DEA0559FfbbDe034e2Db504fb`, schema `0x4e8445d9...`). RepID deltas accumulate off-chain in the production DB (`qnnpjhlxljtqyigedwkb`) and are periodically anchored. The automated anchor cron is not yet wired (each epoch requires a manual `cast send` to anchor a merkle root). Full automation is a V1 delivery item.

---

## executeA2A — agent-to-agent micro-transactions (x402 / EIP-3009 USDC)

```typescript
// Create a service contract and escrow USDC payment via x402
const result = await client.executeA2A({
  buyerAgentId: 'your-agent-id',
  serviceId: 'uuid-of-agent-services-row',
  payload: { task: 'summarize', url: 'https://example.com/doc' },
  agreedPriceUsdcRaw: 100000, // 0.1 USDC in micro-USDC raw units
  // xPaymentHeader: built by your x402 client (EIP-3009 signed transfer)
});

console.log(result.contractId);         // UUID of the created service_contracts row
console.log(result.status);             // 'escrowed' | 'pending'
console.log(result.providerAgentId);    // which Trinity agent will fulfill
console.log(result.agreedPriceUsdcRaw); // confirmed price
console.log(result.settlementId);       // x402 settlement ID (when escrowed)

// If no xPaymentHeader was supplied, backend may return payment requirements:
if (result.paymentRequired) {
  console.log(result.paymentRequired.accepts); // array of x402 payment options
  // Build an EIP-3009 signed USDC transfer, retry with xPaymentHeader
}
```

**Backend sequence:** `POST /api/v1/contracts` (create) → `POST /api/v1/contracts/:id/escrow` (submit x402 payment). Fulfillment is asynchronous — a provider Trinity agent picks up the contract. Poll `GET /api/v1/contracts/:id` for status updates.

**Current wiring status (honest):**
- Contract creation and x402 escrow work on Base Sepolia testnet.
- The `ESCALATION_CONTRACT` pickup gate is disabled by default for most Trinity agents (P-032); contracts sit in `escrowed` until the gate is enabled or the cascade settlement worker picks them up.
- The fully-synchronous "request → response → settled in one call" flow is not yet available. This is a V1 wiring item.
- Mainnet (real USDC) is post-V1.

---

## subscribe — lifecycle events

```typescript
// Called after every verifyOutput
const unsubVerdicts = client.subscribe('verdict', (result) => {
  if (!result.ok) console.warn('HAL veto:', result.decisionReason);
});

// Called after every presentProof
const unsubProofs = client.subscribe('proof', (proof) => {
  console.log('Proof fetched:', proof.tier, proof.scheme);
});

// Clean up
unsubVerdicts();
unsubProofs();
```

Events fire locally (no server push channel). Server-streamed events are a roadmap item.

---

## How HAL works

HAL runs a multi-provider fact-check quorum (strictness 2 by default):

```
LLM output
    │
    ▼
┌──────────────────────────────────────────┐
│  HAL Pipeline (repid-engine)             │
│                                          │
│  3 LLM providers (different families)   │
│  each independently evaluate the claim  │
│                                          │
│  SBFA fusion:                            │
│    Dempster–Shafer belief aggregation    │
│    + Pythagorean Comma veto              │
│    (small-gap coordinated dissonance)    │
│                                          │
│  Quorum verdict → PASS / FLAG / VETO     │
└──────────────────────────────────────────┘
    │
    ▼
RepID delta (provider agents earn/lose reputation)
```

The **Pythagorean Comma veto** (531441/524288 ≈ 1.0136) triggers a hard VETO when 3 providers' belief scores show a tight consistent gap — the signature of coordinated dissonance, not random noise. This is patent-pending (P-003).

HAL measured F1 ≈ 0.73 on HaluEval at N=300 (pinned config: strictness 2, Groq + Gemini + LiteLLM Qwen-2.5-72B, verdict-driven). Full benchmark recipe and reproducible numbers are in the [challenge repo](https://github.com/DealAppSeo/hyperdag-protocol).

---

## The trust stack

```
ERC-8004 Identity Registry  ← who is the agent? (on-chain)
         │
         ▼
    RepID score             ← has it earned trust? (DB + ZKP anchors)
         │
         ▼
   x402 Payments            ← autonomous action (EIP-3009 USDC)
         │
         ▼
   HAL Filtering            ← is its output honest? (this SDK)
```

---

## Current status — what's live vs in-progress

| Feature | Status |
|---|---|
| HAL verifyOutput (fact-check path, strictness 2) | Live on Base Sepolia testnet |
| getRepID / RepID tiers | Live |
| presentProof — Plonky3 STARK, WASM verify | Live (postcard tier) |
| ERC-8004 reputation reads (getRepID, getReputationHistory, getAttestation) | Live (Base Sepolia) |
| executeA2A — contract create + x402 escrow | Live (testnet USDC) |
| Automated EAS epoch anchoring | In progress (manual today) |
| Additional proof tiers (envelope / letter / package) | In progress |
| Mainnet (Base L2) | Post-V1 |
| Server-streamed events | Roadmap |

**Testnet only.** All transactions, proofs, and on-chain anchors are on Base Sepolia (chain 84532). No real USDC or mainnet ETH is involved. Mainnet launch is a post-V1 gate.

---

## API key

Get your key at **[repid.dev/start](https://repid.dev/start)**. Keys are bound to an agent ID and rate-limited per tier.

The `getRepID` and `presentProof` reads are public (no key required). `verifyOutput` and `executeA2A` require a key.

---

## Architecture notes

- **Single network call per HAL check** — no local-only verdict path; the engine is ground truth
- **Diet install** — 2 packages, no Next.js/React/Supabase in the install graph
- **Plonky3 STARK proofs** — BabyBear field, pin `27d59f73`, WASM-verifiable client-side
- **ERC-8004 compatible** — portable on-chain agent identity (Base Sepolia, UUPS proxy)
- **SBFA Glass Box** — Dempster–Shafer belief fusion with a per-step trace; integrators see the math, not just the verdict
- **Pythagorean Comma Veto** — structured dissonance detection from music theory (531441/524288), patent-pending P-003

---

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture-overview.md)
- [API Reference](docs/api-reference.md)
- [Glossary](docs/glossary.md)
- [Support / Bug reports](https://github.com/DealAppSeo/trustshell/issues)

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible. Micah 6:8.
