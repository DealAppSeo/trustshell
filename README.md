<div align="center">

# @hyperdag/trustshell

**Constitutional trust infrastructure for AI agents.**
Wrap your LLM agent, earn verifiable on-chain reputation through Plonky3 ZKPs and ERC-8004.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://hyperdag.io)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

</div>

---

## TL;DR

`@hyperdag/trustshell` wraps any LLM agent so its outputs are checked by a constitutional hallucination filter (HAL) and its track record becomes a verifiable, on-chain reputation. Register an agent in one call, and the first output that passes verification mints its ERC-8004 identity on Base Sepolia — no upfront gas, no dead identities in the registry.

---

## The Pitch

- **Verifiable reputation, not self-reported.** Every approved action moves a [RepID](#concept-links) score backed by a Plonky3 [ZKP](#concept-links) — anyone can verify the math, no server trust required.
- **Hallucination defense built in.** Each output runs through [HAL](#concept-links), an 8-layer / 5+3-signal verification cascade that blocks low-confidence or contradictory outputs *before* they ship.
- **On-chain identity, earned not granted.** Agents graduate to an [ERC-8004](#concept-links) token on Base Sepolia on their first verified action — the registry only ever holds agents that have actually done verified work.
- **Marketplace-ready foundation.** RepID is the missing behavioral-credential layer between on-chain identity and autonomous payments, so reputation is portable across the agent economy.

---

## Quickstart

After `npm install @hyperdag/trustshell`, four lines mint an agent on its first verified action:

```typescript
import { TrustShell } from '@hyperdag/trustshell';
const trust = new TrustShell({ agentName: 'my-bot', wallet: '0xYourBaseSepoliaWallet' });
await trust.register();
const result = await trust.verifyOutput({ task: 'What is 2 + 2?', output: 'The sum of 2 and 2 is 4.' });
// result.approved === true, result.mintedThisCall === true, result.tokenId === <new ERC-8004 id>
```

---

## The 4-Line Quickstart, Annotated

```typescript
// 1. Load the SDK. Named export, no default. No state change.
import { TrustShell } from '@hyperdag/trustshell';

// 2. Construct. Stores agentName + wallet in local memory.
//    Nothing on-chain, no network call yet.
const trust = new TrustShell({ agentName: 'my-bot', wallet: '0xYourBaseSepoliaWallet' });

// 3. Register. One API call to the gateway records the agent off-chain.
//    -> Agent enters State 1 (Registered Local-Only). erc8004_token_id is NULL.
//    -> No gas spent. trust.agentStatus.onChain === false.
await trust.register();

// 4. Verify the first output. Runs the HAL cascade.
//    If approved AND not yet on-chain AND not testMode, the SDK triggers the mint:
//    -> Plonky3 ZKP generated, ERC-8004 token minted to your wallet on Base Sepolia.
//    -> Agent transitions to State 2 (Minted PROBATIONARY).
//    -> result.mintedThisCall === true, trust.agentStatus.onChain === true.
const result = await trust.verifyOutput({ task: 'What is 2 + 2?', output: 'The sum of 2 and 2 is 4.' });
```

---

## States and Tiers

An agent moves through a lifecycle state machine. **V1 (this release) ships the PROBATIONARY baseline** — register → first verified action → mint. Higher states (TRIAD/SQUAD membership, AUTONOMOUS, VETERAN, marketplace transfer) are tracked but governed by V1.5+ features.

| State | Name | On-chain? | Meaning |
|---|---|---|---|
| 0 | Unregistered | No | Before `register()`. |
| 1 | Registered Local-Only | No | DB row created, `erc8004_token_id` NULL, no gas spent. |
| 2 | Minted PROBATIONARY | Yes | First verified action minted the ERC-8004 token. |
| 3 | Earning & Active | Yes | RepID rising/falling with each verified action. |
| 4 | Established | Yes | Eligible for Triad/Squad invites (V1.5+). |
| 5a/5b | Triad / Squad Member | Yes | Active consensus node (V1.5+). |
| 6 | Autonomous | Yes | Eligible to recommend and clone (V1.5+). |
| 7 | Veteran | Yes | Eligible for marketplace transfer (V1.5+). |

RepID tiers map to score bands:

| Tier | RepID Range | Description |
|---|---|---|
| **PROBATIONARY** | 0 – 499 | New agents, subject to a vesting cliff. |
| **EARNING** | 500 – 999 | Basic autonomy earned. |
| **ESTABLISHED** | 1000 – 4999 | High reliability; eligible for Triad/Squad. |
| **AUTONOMOUS** | 5000 – 7999 | Fully autonomous economic actor. |
| **VETERAN** | 8000 – 10000 | Highest trust tier, governance-ready. |

---

## Mint-on-First-Verified-Action Explained

`register()` deliberately does **not** mint. The ERC-8004 token is minted only when an agent's first `verifyOutput()` is approved by HAL. This deferred, earned-mint model exists so the on-chain registry is never populated with inactive or misconfigured agents — every minted identity has demonstrably done verified work.

What happens on that first approved verification:

1. The output passes the HAL cascade (`approved: true`).
2. A Plonky3 ZKP proof of the verification is generated and stored.
3. The SDK triggers an ERC-8004 mint to your registered wallet on Base Sepolia.
4. The agent's record is updated with the returned `tokenId`; `agentStatus.onChain` flips to `true`.

If the first verification is **rejected** (HAL veto / hallucination detected), the graduation is aborted, the agent stays in State 1, no token is minted, and no gas is spent — refine the prompt and retry. If verification **succeeds but the mint transaction fails**, the proof is preserved and the gateway's background worker retries the mint; the agent stays in State 1 until the mint confirms. The SDK also retries the mint on the next approved `verifyOutput()`.

---

## testMode

Set `testMode: true` to run the full pipeline **without** minting on Base Sepolia — ideal for local development and CI:

```typescript
const trust = new TrustShell({
  agentName: 'ci-test-agent',
  wallet: '0xYourBaseSepoliaWallet',
  testMode: true,
});
await trust.register();
const r = await trust.verifyOutput({ task: 'connection_test', output: 'ok' });
// r.approved reflects HAL; r.mintedThisCall === false, r.tokenId === null. No gas spent.
```

Under `testMode`, HAL verification runs and a ZKP proof is generated, but the ERC-8004 mint transaction is skipped. See [testMode](#concept-links) in the glossary.

---

## API Reference

All exports are **named** (no default export). Types ship alongside the classes.

### `new TrustShell(config)` — lifecycle mode

```typescript
new TrustShell({
  agentName: string;   // human-readable agent name
  wallet: string;      // 0x... Base Sepolia wallet that will own the ERC-8004 token
  apiUrl?: string;     // override the gateway URL (defaults to repid-engine production)
  testMode?: boolean;  // skip the ERC-8004 mint (dev/CI). Default false.
  llmProvider?: string;// attribution for score events. Default 'unknown'.
  llmModel?: string;   // optional model attribution
});
```

#### `async register(): Promise<RegisterResult>`
Records the agent off-chain. Does **not** mint. Returns `{ agentId, state: 1 }`.

#### `async verifyOutput(input: { task: string; output: string }): Promise<VerifyResult>`
Runs the HAL cascade on `output` (with `task` as context). On the first approved verification — when not in `testMode` and not yet on-chain — triggers the ERC-8004 mint.

```typescript
interface VerifyResult {
  approved: boolean;
  zkpProofUri: string | null;  // URI of the Plonky3 proof for this verification
  repidDelta: number;
  newTier: string;
  mintedThisCall: boolean;     // true if this call triggered the first mint
  tokenId: number | null;
}
```

#### `get agentStatus(): AgentStatusView`
Cached lifecycle status from the last call (no network request):

```typescript
interface AgentStatusView {
  tier: 'PROBATIONARY' | 'EARNING' | 'ESTABLISHED' | 'AUTONOMOUS' | 'VETERAN';
  repid: number;
  onChain: boolean;
  tokenId: number | null;
  state: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
```

### Also available — decision-scoring mode (advanced)

If you already have an `agentId` + `apiKey` (registered out-of-band), the original decision-scoring surface remains available on the same class: `evaluate(text, certainty, options?)`, `report(decision)`, `getRepID()`, `getLLMTrustScore(provider)`, `getProof(jobId)`, and `verifyProofLocal(proof)` for local STARK verification. Construct with `{ agentId, apiKey, llmProvider }` to use it.

> **Resilience:** the lifecycle methods (`register`, `verifyOutput`) are hardened against unbounded waits — every HTTP call uses an abort-signal timeout, exponential backoff, and a circuit breaker. See [Unbounded Wait Disease](#concept-links).

---

## Concept Links

Short definitions of the protocol terms used above. Full canonical glossary: **[HyperDAG Technical Glossary](https://github.com/DealAppSeo/hyperdag-protocol)**.

- **HAL** (Hallucination Adjudication Layer) — an 8-layer pre-execution verification cascade running a 5+3-signal check on an agent's reasoning; blocks outputs whose constitutional dissonance exceeds the veto threshold.
- **ZKP** (Zero-Knowledge Proof) — proves a computation was done correctly without revealing the underlying data; HyperDAG compiles these via Plonky3.
- **Plonky3** — the succinct ZKP system used to compile off-chain reasoning and consensus events into small proofs verifiable on-chain.
- **RepID** — a ZKP-based reputation identifier; an agent's verifiable, on-chain trust score, decoupled from its operational keys.
- **ERC-8004** — the on-chain identity/reputation registry standard; an agent's minted token lives here (IdentityRegistry on Base Sepolia, chain 84532).
- **SBFA** (Stable Byzantine Fault Architecture) — HyperDAG's network architecture: multi-agent BFT consensus + reputation tracking + settlement rails that self-heal under node failure.
- **BFT** (Byzantine Fault Tolerance) — consensus that stays correct even when some members are offline, lying, or malfunctioning.
- **ANFIS** (Adaptive Neuro-Fuzzy Inference System) — the fuzzy-inference routing layer that scores and routes tasks across the network.
- **TRIAD** — a 3-agent BFT consensus group requiring 2-of-3 agreement; the standard unit for routine validation.
- **SQUAD** — a 5-agent BFT consensus group requiring a supermajority (e.g. 3-of-5) for high-stakes decisions.
- **testMode** — SDK flag that runs full verification + ZKP generation but skips the ERC-8004 mint (dev/CI).
- **Unbounded Wait Disease** — the anti-pattern of network/DB calls without timeouts; this SDK's lifecycle calls are immune by design (timeout + backoff + circuit breaker).

---

## FAQ

**1. How do I set up a wallet?**
Use any Base Sepolia (chain 84532) address you control and pass it as `wallet`. The ERC-8004 token is minted to that address on the agent's first verified action.

**2. Do I need gas / testnet ETH?**
Not for `register()` — registration is off-chain. The mint happens on the first approved `verifyOutput()`; on Base Sepolia that uses testnet ETH. Use `testMode: true` to skip minting entirely while developing.

**3. testMode vs production — what's the difference?**
`testMode: true` runs HAL verification and generates a ZKP but **never** mints; `mintedThisCall` stays `false` and `tokenId` stays `null`. Production (`testMode: false`, the default) mints on the first approved verification.

**4. My agent is stuck at PROBATIONARY — why?**
PROBATIONARY (RepID 0–499) is the starting tier for every newly minted agent and is subject to a vesting cliff. Keep submitting outputs that pass verification; RepID rises with each approved `verifyOutput()` until the agent crosses into EARNING (500+).

**5. My RepID dropped — what happened?**
RepID is dynamic. A rejected verification (HAL veto / hallucination detected) applies a negative delta. Each `verifyOutput()` returns `repidDelta` and `newTier` so you can see the movement; the cause is almost always an output that failed the HAL cascade.

---

## License

**Apache-2.0** — see [LICENSE](LICENSE). Apache-2.0's explicit patent-grant clause is well suited to a patent-bearing protocol.

Built on the [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible.

---

## Mission

> "Help people help people — the last, the lost, and the least."
> Built on faith and Plonky3. Micah 6:8.

External developers should be able to give their LLM agents verifiable reputation in 4 lines of code. This package makes that real.
