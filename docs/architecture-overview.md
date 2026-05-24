# Architecture Overview

For developers who want to understand TrustShell before integrating.

## The three primitives

| Primitive | Question it answers | Where it lives |
|---|---|---|
| **ERC-8004 Identity** | *Who is this agent?* | on-chain IdentityRegistry (Base Sepolia `0x8004A818BFB912233c491871b3d84c89A494BD9e`) |
| **RepID** | *Has it earned trust?* | repid-engine + ReputationRegistry (`0x8004B663056A597Dffe9eCcC1965A193B7388713`) |
| **x402** | *Can it pay/act autonomously?* | x402 payment rail (operator → provider, real USDC) |

RepID is the middle layer — the behavioral credential that makes the agent economy accountable.

## HAL (Hallucination Assessment Layer)

Every decision routes through one network call to the canonical HAL pipeline at repid-engine. HAL runs a
5-signal extractor (harm, epistemic uncertainty, evidence quality, scope, certainty) and, for factual /
time-sensitive prompts, an optional cross-LLM agreement signal. It returns a 0–1 score and a decision:

```
dissonance ≤ veto_threshold  → APPROVE  (+RepID)
in between                   → HITL     (human-in-the-loop)
dissonance > block_threshold → BLOCK    (−RepID)
```

Thresholds are runtime-tunable (engine `repid_config`); operators retune against live traffic without a
redeploy. The score is computed only over providers that actually responded; a minimum-quorum gate means
a single surviving provider cannot fire a veto on its own (degraded → defaults to clean, surfaced for
review). False-clean-when-degraded is preferred over false-veto; downstream dispute + filters govern.

## The economic loop

```
contract created → /escrow (x402 verify + settle, real USDC) → cascade (escrowed → fulfilled)
   → HAL evaluation → bridge writes service_fulfilled_settled → FeedbackLoopWorker
   → ERC-8004 on-chain reputation attestation
```

This loop runs **autonomously and exactly once** per contract.

## Trust guarantees / defense-in-depth
- **One source of truth:** the engine HAL pipeline; no local-only verdict path.
- **Idempotency:** payments key on the contract id (DB partial unique index) — a payment can't double-settle a contract.
- **No self-dealing:** a DB constraint forbids `buyer == provider` contracts.
- **Gas discipline:** simulated/orphaned events are filtered out of any on-chain write path.
- **Inflation defense:** statistical RepID-growth outlier detection (advisory) + a counterparty-diversity tier gate.

## Testnet status + mainnet roadmap
Everything below is verified on **Base Sepolia testnet** today. Mainnet (real-value USDC + mainnet
contracts) is gated on a network-readiness pass and a go/no-go decision.

## Proof points (verified on-chain, 2026-05-24)
The full economic loop closed end-to-end with real money on Base Sepolia:
- **USDC settlement** `0x2a7ac151c23983f59564fc3da5c7ea74fdbe390f9e97fcbf70c79be27089967a` (block 41917330) — 0.1 USDC operator → trinity-shofet, `status=1`.
- **ERC-8004 attestation** `0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917` (block 41917386) — to the ReputationRegistry; shofet RepID 2980 → 3040, `status=1`.

Both transactions confirmed successful — payment → fulfillment → on-chain reputation, autonomously,
exactly once.

See [api-reference.md](./api-reference.md) for the SDK/CLI surface and [getting-started.md](./getting-started.md) to integrate.
