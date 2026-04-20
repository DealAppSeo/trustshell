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

## How it works

```
Agent Decision
      │
      ▼
┌─────────────────────────────┐
│   HAL Dissonance Check      │
│                             │
│   harm × 0.4                │
│   + epistemic × 0.3         │  × 531441/524288
│   + evidence × 0.2          │
│   + scope × 0.1             │
│                             │
│   threshold: 0.0195         │
└─────────────────────────────┘
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
HAL Training Case
      │
      ▼
Wisdom Score Update
      │
      ▼
VDR +1 (permanent, never decays)
```

The threshold (0.0195) is derived from the Pythagorean
Comma: (531441/524288) − 1 ≈ 0.013643, scaled to our
8-layer HAL scoring system.

**Production results:**
- SOPHIA: 2,600 constitutional trade evaluations
- Refusal rate: 99.4% (2,585 vetoed)
- Capital protection events: 714
- Agent log entries: 1,078,505

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

// Score a decision — runs HAL veto locally first
const result = await shell.evaluate(
  'Execute trade: buy 0.1 BTC at market',
  0.87  // certainty 0-1
);
// {
//   approved: true,
//   hal_score: 0.08,
//   repid_delta: +3,
//   new_score: 1003,
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

## Architecture

- **Local HAL pre-check** — no network call, instant
- **Pythagorean Comma threshold** — 531441/524288
- **Plonky3 STARK proofs** — quantum-resistant
  tier attestation (BabyBear field, Poseidon2 hash)
- **ERC-8004 compatible** — portable identity
- **Vesting cliff** — first 500 RepID vests over
  30 days, preventing gaming

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
