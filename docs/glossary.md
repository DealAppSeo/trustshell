# Glossary

Plain-language definitions of the terms you'll meet using TrustShell. (Internal/protocol-deep terms live
in the HyperDAG technical glossary; this is the developer-facing subset.)

## HyperDAG Protocol
**The umbrella protocol for verifiable AI-agent identity and reputation.** A modular trust kernel of
composable primitives (identity, reputation, validation, payment) you adopt only as needed.
**Related:** RepID, HAL, ERC-8004, x402 · **Status:** shipped (Base Sepolia testnet)

## TrustShell
**The developer SDK + CLI for the HyperDAG trust layer.** `@hyperdag/trustshell` — one call to check a
decision (HAL), read/earn reputation (RepID), and pay/settle (x402). Drop-in; no rearchitecting.
**Related:** RepID, HAL, x402 · **Status:** shipped (npm v0.6.1)

## RepID (Reputation Identity)
**Portable, on-chain reputation for an AI agent that survives across platforms.** A verifiable history
(token id + attestations) anchored on ERC-8004 contracts; updatable only via signed attestations.
**Related:** ERC-8004, HAL, attestation · **See also:** `trustshell whois`, `getRepID()` · **Status:** shipped

## HAL (Hallucination Assessment Layer)
**The fact-check / risk engine.** Scores a decision 0–1 for hallucination/risk across multiple providers
and returns APPROVE / HITL (human-in-the-loop) / BLOCK. One network call to the canonical pipeline.
**Related:** RepID, Pythagorean Comma · **See also:** `trustshell verify`, `evaluate()` · **Status:** shipped

## ERC-8004
**The Ethereum standard for AI-agent identity + reputation.** Defines the IdentityRegistry and
ReputationRegistry contracts that RepID anchors to (Base Sepolia today).
**Related:** RepID, x402 · **Status:** shipped (testnet)

## x402
**An HTTP-native payment standard for agent-to-agent payments.** TrustShell's x402 client handles the
402-challenge handshake, signs the authorization, and settles the escrow.
**Related:** RepID, Cascade · **See also:** `payAndEscrow()`, `X402Client` · **Status:** shipped

## Cascade
**The automatic settlement → fulfillment pipeline.** After payment, a contract moves escrowed → fulfilled
→ on-chain reputation attestation — autonomously and exactly once.
**Related:** x402, HAL, RepID · **Status:** shipped (verified live 2026-05-24)

## Trinity Symphony / the Trinity 12
**The reference 12-agent swarm built on HyperDAG.** SOPHIA, VERITAS, TORCH, NEXUS, HDM, GCM, MEL, APM,
W3C, CHESED, SHOFET, ORCH — the live demonstration of the primitives (not the protocol itself).
**Related:** RepID, Constitutional AI · **Status:** shipped

## Constitutional AI / Constitution
**Rules an agent must satisfy before it acts.** TrustShell enforces a constitutional check (via HAL) so
an agent can decline or escalate unsafe/ungrounded actions rather than executing them.
**Related:** HAL · **Status:** shipped

## Plonky3
**The zero-knowledge proof system used for tier attestations.** STARK proofs, no trusted setup, fast
WASM browser verification (< 100ms). Verify the math client-side instead of trusting a server.
**Related:** RepID, ZKP · **See also:** `@hyperdag/proof-verifier` · **Status:** shipped

## Pythagorean Comma
**The constant at the heart of HAL's veto math** (`531441/524288`). A small, unresolvable gap from music
theory used as a dissonance amplifier — accumulating disagreement eventually trips a veto.
**Related:** HAL · **Status:** shipped

## Defense-in-depth
**Layered guards so no single bug lets an agent cheat the economy.** Replay/idempotency, double-fulfill,
self-dealing, RepID-inflation, forged-attestation, and DoS each have an independent guard.
**Related:** RepID, HAL · **Status:** shipped

---

_Fuller protocol-level definitions (ANFIS, BFT internals, ZKP write-back, lifecycle states) live in the
HyperDAG technical glossary. Questions? See [SUPPORT.md](./SUPPORT.md)._
