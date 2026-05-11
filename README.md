<div align="center">

# @hyperdag/trustshell

**Constitutional protection for any AI agent.**  
Drop in. No rearchitecting.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://hyperdag.io)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

</div>

---

## The discovery

The beauty and symmetry found in recurring patterns
appear across science, nature, mathematics, and music.
We believe we have found an essential key in the
relationship between the Circle of Fifths and what
music theory calls the Pythagorean Comma — the
irreconcilable gap of 531441/524288 that emerges when
you stack twelve perfect fifths against seven octaves.

This gap does not resolve. It accumulates.

We discovered that this same accumulation property,
when applied as a dissonance threshold, reliably detects
when an AI system's internal signals are drifting from
coherent truth. The Pythagorean Comma Veto is our first
production application of this pattern. AI has amplified
our ability to explore and stress-test these relationships
at scale. We make our findings open and usable here.

---

## What's new in v0.3

- **Local STARK Verification.** Verify Plonky3 STARK proofs locally using a lazy-loaded WASM module. No network call needed for the math — verify any HyperDAG proof on the edge.
- **Auto-Verify Mode.** Set `autoVerify: true` in config to have `report()` automatically perform cryptographic validation of the server-returned proof job.

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
  llmProvider: 'anthropic'
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
//   tier: 'EARNING',
//   vdr_count: 1,
//   vesting_active: true,
//   cross_llm_agreement_score: 0.94 // Only when prompt supplied
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

// Fetch Plonky3 STARK proof for a decision
const proof = await shell.getProof(result.proof_job_id);
console.log(`STARK Commitment: ${proof.proof_hash}`);
```

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

RepID is the missing middle layer — the behavioral
credential that makes the agent economy accountable.

### RepID Tiers

Agents advance through five canonical tiers based on their current RepID:

| Tier | RepID Range | Description |
|---|---|---|
| **PROBATIONARY** | 0 - 499 | New agents, subject to 30-day vesting cliff. |
| **EARNING** | 500 - 999 | Basic autonomy earned. |
| **ESTABLISHED** | 1000 - 4999 | High reliability verified by peers. |
| **AUTONOMOUS** | 5000 - 7999 | Fully autonomous economic actor. |
| **VETERAN** | 8000 - 10000 | Highest trust tier, protocol governance ready. |

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

Register your agent in 60 seconds:
**[repid.dev/start](https://repid.dev/start)**

## Live leaderboard

See 28+ scored agents:
**[trustrepid.dev](https://trustrepid.dev)**

## LLM trust scores

Which LLMs earn constitutional trust:
**[trustrepid.dev/llm-trust](https://trustrepid.dev/llm-trust)**

## License

Apache 2.0 — see [LICENSE](LICENSE).

Patent rights, if any, are granted under the Apache 2.0
patent grant clause. Commercial use of the Pythagorean
Comma Veto methodology in closed-source systems requires
written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol).
ERC-8004 compatible. Micah 6:8.
