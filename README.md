# TrustShell SDK

[![npm version](https://img.shields.io/npm/v/@hyperdag/trustshell.svg)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> **"Drop-in HAL (Hallucination Assessment Layer) constitutional protection for any agent."**

TrustShell is the official TypeScript SDK for the HyperDAG RepID protocol. It provides a single network call to the canonical HAL pipeline, enabling agents to earn reputation (RepID), prove their tier via ZKP STARKs, and provide verifiable evidence of constitutional alignment.

---

## What's new in v1.0

- **v1.0.0 Brand Statement** — Initial stable release of the HyperDAG trust infrastructure.
- **Native `waitForProof()` Polling** — SDK now includes a built-in mechanism to poll for ZKP finality. Consumers no longer need to manage retry/polling logic for asynchronous STARK generations.
- **Typed Error Hierarchy** — Comprehensive set of catchable error classes (`AuthError`, `RateLimitError`, `NetworkError`, `TimeoutError`).
- **Configurable Engine URL** — The `baseUrl` can now be overridden in the constructor, allowing for custom engine deployments or local testing.
- **Improved 0-Dependency Footprint** — Entirely native `fetch`-based implementation with 0 runtime dependencies.

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

---

## Install

```bash
npm install @hyperdag/trustshell
```

## Quick start

```typescript
import { TrustShell, TrustShellAuthError } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key'
});

try {
  // Score a decision — sends to repid-engine HAL pipeline
  const result = await shell.evaluate(
    'Execute trade: buy 0.1 BTC at market',
    0.87  // certainty 0-1
  );

  console.log(`Decision approved: ${result.approved}`);

  // v1.0 Feature: Poll for ZKP finality
  if (result.proof_job_id) {
    const proof = await shell.waitForProof(result.proof_job_id);
    console.log(`STARK Proof status: ${proof.status}`);
  }
} catch (e) {
  if (e instanceof TrustShellAuthError) {
    console.error('Invalid API Key');
  }
}
```

## Architecture

- **Single network call to the canonical HAL pipeline** — the engine is the source of truth.
- **5-signal extractor** — harm, epistemic uncertainty, evidence quality, scope, certainty.
- **Optional Phase 1.5 cross-LLM 6th signal** — agreement-aware scoring for factual prompts.
- **Pythagorean Comma constant** — 531441/524288 dissonance amplifier.
- **Plonky3 STARK proofs** — Quantum-resistant tier attestation on **Base Sepolia testnet**.
- **ERC-8004 compatible** — standard agent identity registry.

## Roadmap

- **v1.x** (Q1 2026): Performance optimizations and expanded language support.
- **v2.0** (Q2 2026): **Mainnet Launch** — Plonky3 STARK proof anchoring to Ethereum/Base mainnet.
- **v2.x** (Q3 2026): x402 native bundling and ERC-8004 Mainnet ValidationRegistry.

## Resources

- **[repid.dev/start](https://repid.dev/start)** — Register your agent.
- **[trustrepid.dev](https://trustrepid.dev)** — Live leaderboard.
- **[trustrepid.dev/llm-trust](https://trustrepid.dev/llm-trust)** — LLM trust scores.

## License

Apache 2.0 — see [LICENSE](LICENSE).

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). Micah 6:8.
