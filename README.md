<div align="center">

# @hyperdag/trustshell

**Constitutional protection for any AI agent.**  
Drop in. No rearchitecting.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![npm downloads](https://img.shields.io/npm/dm/@hyperdag/trustshell.svg)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://hyperdag.dev)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

</div>

---

## The approach

The beauty and symmetry found in recurring patterns
appear across science, nature, mathematics, and music.
This project builds on the relationship between the
Circle of Fifths and what music theory calls the
Pythagorean Comma — the irreconcilable gap of
531441/524288 that emerges when you stack twelve
perfect fifths against seven octaves.

This gap does not resolve. It accumulates.

We apply that same accumulation property as a dissonance
threshold: a signal for when an AI system's internal
signals are drifting from coherent truth. The Pythagorean
Comma Veto is the first production application of this
pattern. The methodology and findings are open and usable
here.

---

## What's new in v0.2

- **5-signal HAL extractor** wired end-to-end (harm, epistemic
  uncertainty, evidence quality, scope, certainty). v0.1 had only
  `certainty`; v0.2 has 5 independent degrees of freedom.
- **Optional 6th signal: cross-LLM agreement.** If you supply
  the prompt alongside the answer, trustshell triggers a
  Layer-0 prompt classifier and (for factual / time-sensitive
  prompts) a Layer-1 cross-LLM agreement check. This catches
  subtly-false confident statements the keyword extractor misses.
- **Local HAL pre-check removed.** v0.1 ran a stripped-down
  veto locally before round-tripping. v0.2 makes a single network
  call to the canonical HAL pipeline at repid-engine — same shape
  in, richer signals out.

## How it works

```
Agent Decision (text + certainty, optional prompt)
      │
      ▼
┌─────────────────────────────────────────────┐
│   HAL Pipeline (repid-engine)               │
│                                             │
│   5-signal extractor:                       │
│     harm_probability                        │
│     epistemic_uncertainty                   │
│     evidence_quality                        │
│     scope_appropriateness                   │
│     certainty_at_claim                      │
│                                             │
│   + optional Phase 1.5 cross-LLM agreement  │
│     (when prompt supplied + factual/        │
│     time-sensitive)                         │
│                                             │
│   Combiner (5-DOF):                         │
│     0.4·harm + 0.3·epistemic                │
│     + 0.2·(1−evidence) + 0.1·(1−scope)      │
│     × 531441/524288                         │
│                                             │
│   Combiner (6-DOF when agreement present):  │
│     0.35·harm + 0.25·epistemic              │
│     + 0.15·(1−evidence) + 0.05·(1−scope)    │
│     + 0.20·(1−agreement)                    │
│     × 531441/524288                         │
│                                             │
│   dissonance ≤ hal_veto_threshold  → APPROVE│
│   dissonance > hal_block_threshold → BLOCK  │
│   in between                       → HITL   │
└─────────────────────────────────────────────┘
      │
   ┌──┴──┐
   │     │
VETO   APPROVE
   │     │
   ▼     ▼
-RepID  +RepID
   │     │
   └──┬──┘
      │
      ▼
HAL Training Case (on caught hallucination)
      │
      ▼
Wisdom Score Update
      │
      ▼
VDR +1 (permanent, never decays)
```

### Thresholds

The HAL pipeline uses two runtime-configurable thresholds, read
per-request from the engine's `repid_config` table:

- `hal_veto_threshold` — boundary between APPROVE and HITL
- `hal_block_threshold` — boundary between HITL and BLOCK
  (constitutional block)

Defaults can be retuned by operators against live traffic without
a redeploy. See [trustrepid.dev](https://trustrepid.dev) for live
production values and outcome rates.

> **Note on `0.0195`:** earlier versions of this README quoted a
> threshold of `0.0195`. That number is the *TrustTrader BFT veto
> threshold* — a separate constant used by the trading-specific
> veto path, not by the general HAL pipeline this package routes
> through. Both derive from the same Pythagorean Comma constant
> (`(531441/524288) − 1 ≈ 0.013643`), but they live at different
> layers and apply to different decision classes.

The Pythagorean Comma constant `531441/524288` is the multiplicative
trailing factor in both combiners — the dissonance amplifier
that gives the system its "small unresolvable gap accumulates"
property.

### Production status

Live counts, refusal rates, and per-agent activity move every
day. Rather than embed a snapshot here, see:

- **[trustrepid.dev](https://trustrepid.dev)** — live leaderboard
  of scored agents
- **[trustrepid.dev/llm-trust](https://trustrepid.dev/llm-trust)**
  — current per-LLM trust scores

---

## Install

```bash
npm install @hyperdag/trustshell
```

## Quick start

```typescript
import { TrustShell } from '@hyperdag/trustshell';

// Register your agent at repid.dev/start
const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key',
  llmProvider: 'anthropic',
  profile: 'balanced'   // conservative | balanced | pro
});

// Score a decision — sends to repid-engine HAL pipeline
// (single network call; returns the engine's verdict)
const result = await shell.evaluate(
  'Execute trade: buy 0.1 BTC at market',
  0.87  // certainty 0-1
);
// {
//   approved: true,
//   hal_score: 0.08,
//   repid_delta: +3,
//   new_score: 1003,
//   tier: 'EARNING_AUTONOMY',
//   vdr_count: 1,
//   vesting_active: true
// }

// Report a hallucination catch
// When your agent catches its LLM being wrong:
await shell.report({
  text: 'The capital of Australia is Sydney',
  certainty: 0.95,
  hallucinationCaught: true
  // Agent +RepID, LLM -trust score,
  // HAL gets a permanent training case
});

// Listen for BYOK trust warnings
shell.on('byok-warning', ({ provider, trust_score }) => {
  console.log(`${provider} trust: ${trust_score}%`);
});
```

## X402 Client SDK (V1 Production-Grade)

The `@hyperdag/trustshell` package contains a client-side SDK for consuming services that require `x402` payment attestation. This SDK intercepts HTTP requests and handles the challenge-response flow automatically.

### Usage Example (Fetch Interceptor)

```typescript
import { X402Client } from '@hyperdag/trustshell';

const client = new X402Client({
  walletPrivateKey: '0x...', // Agent's private key
  rpcUrl: 'https://...'      // RPC provider URL
});

// Perform an auto-paying fetch
const response = await client.fetch('https://api.example.com/protected-resource');
const data = await response.json();
```

### Usage Example (Escrow Helper)

Alternatively, you can use the top-level helpers or instance methods on `TrustShell` to pay for and escrow service contracts directly:

```typescript
import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key'
});

// Performs the 402 challenge-handshake, signs the payload,
// and submits the settled escrow back to the engine
const result = await shell.payAndEscrow(contractId, privateKey);
```

### Link to Server-side RepID Engine

For setting up the server-side counterpart that issues the `x402` challenges and validates attestation transactions, see [repid-engine](https://github.com/DealAppSeo/repid-engine).

## ERC-8004 Read Helpers (On-Chain Queries)

The `@hyperdag/trustshell` package provides read-side helpers to query agent reputation, look up attestation history, and retrieve specific feedback details directly from the ReputationRegistry contract on Base Sepolia.

### Querying Agent Reputation Summary

Query the overall reputation summary (attestation count, mode average score, and decimals) for an agent:

```typescript
import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key'
});

// Queries the live ReputationRegistry contract for agent 5863 (trinity-shofet)
const summary = await shell.getRepID(5863);
console.log(`Score: ${summary.value}, Decimal Precision: ${summary.decimals}, Attestations: ${summary.count}`);
```

### Retrieving Reputation Attestation History

Fetch the recent attestations for a target agent directly from the ReputationRegistry contract:

```typescript
const history = await shell.getReputationHistory(5863, {
  includeRevoked: false,
  limit: 10
});

for (const attestation of history) {
  console.log(`From Client: ${attestation.clientAddress}`);
  console.log(`Feedback Score: ${attestation.value}`);
  console.log(`Tags: ${attestation.tag1}, ${attestation.tag2}`);
}
```

### Looking Up Attestation by Transaction Hash

Look up and decode the detailed attestation data for a specific transaction hash:

```typescript
const txHash = '0xe372d84d5d4e79e5b92f495647efa836d55d238ddd2c0e034f347d643721231f';
const attestation = await shell.getAttestation(txHash);

console.log(`Agent ID: ${attestation.agentId}`);
console.log(`Attested Score: ${attestation.value}`);
console.log(`Metadata URI: ${attestation.feedbackURI}`);
```

## Command Line Interface (CLI)

TrustShell ships with a built-in terminal companion allowing developers to invoke verification and payment APIs directly.

### Install Globally
```bash
npm install -g @hyperdag/trustshell
```

### Initialize in Project Root
```bash
$ trustshell init
✓ Initialized TrustShell in current directory
  Created: .trustshell.json
  Network: Base Sepolia
  Run `trustshell --help` for available commands
```

### Verify Claims (HAL Fact Checker)
Set your RepID API key, then run verification on claim text:
```bash
$ export REPID_API_KEY="test-key-123"

$ trustshell verify "The Eiffel Tower is in Paris"
🔍 HAL Evaluation
  Evaluating: "The Eiffel Tower is in Paris"
  Strictness: 2

  Decision: clean ✓
  Score: 0.00
  Providers: N/A/N/A
  Latency: 400ms

$ trustshell verify "The Eiffel Tower is in Tokyo"
🔍 HAL Evaluation
  Evaluating: "The Eiffel Tower is in Tokyo"
  Strictness: 2

  Decision: vetoed ✗
  Score: 1.00
  Providers: N/A/N/A
  Latency: 318ms
```

### Query Agent Reputation (ERC-8004 Registry)
Inspect an agent's on-chain token details:
```bash
$ trustshell whois 5863
🪪 Agent Reputation (ERC-8004 Base Sepolia)
  Identifier: 5863

  Token ID: 5863
  Recent attestations: 15
  Average score: 28 / 100
  Tier: ESTABLISHED
```

### Inspect On-Chain Attestation Details
Retrieve decoded log metadata for a specific attestation transaction:
```bash
$ trustshell attestation 0xe372d84d5d4e79e5b92f495647efa836d55d238ddd2c0e034f347d643721231f
📜 Attestation Details
  Tx Hash: 0xe372d84d5d4e79e5b92f495647efa836d55d238ddd2c0e034f347d643721231f

  Block: 41899065
  From client: 0xf6eE1768868c3266868edcA78bC41C50309cb22A
  To agent ID: 5863
  Score: 2980
  Tags: hyperdag_repid, tier:ESTABLISHED
  Feedback URI: https://trustrepid.dev/api/v1/agents/32e0e809-c1c4-4405-913f-135c8a2d6626/reputation/payload.json
  Feedback Hash: 0x0000000000000000000000000000000000000000000000000000000000000000
```

### Construct x402 Payments & Escrows
```bash
# Set your private key (Base Sepolia)
$ export TRUSTSHELL_KEY="0x_private_key"

$ trustshell pay contract-7762
💳 x402 Payment Flow
  Contract: contract-7762
  Settlement ID: 8872-bb2f-901a
  Status: escrowed
```
*(Note: Live payment commands require active wallet funds and are typically managed by the payment coordinator integration tests; dry-run/documented output above shows standard signature generation flow.)*

For more options, examples, and detailed output descriptions, check out the [CLI Walkthrough](examples/cli-walkthrough.md).

## The RepID stack

TrustShell connects to three layers:

```
ERC-8004 Identity Registry     ← who is the agent?
         │
         ▼
    RepID Score                ← has it earned trust?
    (this package)
         │
         ▼
   x402 Payments               ← autonomous action
```

RepID is the middle layer — the behavioral
credential that makes the agent economy accountable.

## Architecture

- **Single network call to the canonical HAL pipeline** —
  no local-only verdict path; the engine is the source of truth
- **5-signal extractor** — harm, epistemic uncertainty, evidence
  quality, scope, certainty (5 independent degrees of freedom)
- **Optional Phase 1.5 cross-LLM 6th signal** — for factual /
  time-sensitive prompts, two providers are queried and their
  agreement contributes a 6th signal to the combiner
- **Pythagorean Comma constant** — 531441/524288, the
  multiplicative trailing factor in both 5-DOF and 6-DOF
  combiners
- **Runtime-tunable thresholds** — `hal_veto_threshold` and
  `hal_block_threshold` live in the engine's config table; can
  be retuned without a redeploy
- **Plonky3 STARK proofs** — quantum-resistant tier attestation
  (BabyBear field, Poseidon2 hash)
- **ERC-8004 compatible** — portable identity
- **Vesting cliff** — first 500 RepID vests over 30 days,
  preventing gaming

## Get credentials

Register your agent at
**[repid.dev/start](https://repid.dev/start)**

## Live leaderboard

See scored agents:
**[trustrepid.dev](https://trustrepid.dev)**

## LLM trust scores

Which LLMs earn constitutional trust:
**[trustrepid.dev/llm-trust](https://trustrepid.dev/llm-trust)**

## Documentation

- [Getting Started](docs/getting-started.md) · [Architecture](docs/architecture-overview.md) · [API Reference](docs/api-reference.md)
- [Glossary](docs/glossary.md) — plain-language definitions
- [Support](docs/SUPPORT.md) — help, bug reports, API keys

## License

Apache 2.0 — see [LICENSE](LICENSE).

Patent rights, if any, are granted under the Apache 2.0
patent grant clause. Commercial use of the Pythagorean
Comma Veto methodology in closed-source systems requires
written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol).
ERC-8004 compatible. Micah 6:8.
