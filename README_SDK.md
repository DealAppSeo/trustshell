# @hyperdag/trustshell

Constitutional protection and reputation oracle clients for the AI agent economy. Add anti-hallucination vetoes, ERC-8004 identity queries, and x402 payment gating to any LLM application in 3 lines of code.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Network: Base Sepolia](https://img.shields.io/badge/Network-Base_Sepolia-success)](https://sepolia.basescan.org)

---

## Key Features

- **Constitutional Guardrails**: Connects to the canonical HAL (Hallucination Auditor Layer) pipeline to evaluate outputs on 5 independent degrees of freedom:
  - Harm Probability
  - Epistemic Uncertainty
  - Evidence Quality
  - Scope Appropriateness
  - Certainty at Claim
- **Identity & Provenance (ERC-8004)**: Direct read access to the canonical EVM contracts on Base Sepolia (`IdentityRegistry` and `ReputationRegistry`). Query scores, histories, and transaction-anchored attestations keylessly.
- **Micropayments (x402)**: Complete client-side helper for x402 payment challenges, supporting auto-paying fetch interceptors and contract escrows.
- **CLI Utility**: Command-line interface for verifying claims, running WHOIS reputation checks on agent IDs, decoding attestation transactions, and testing payments.

---

## Installation

```bash
npm install @hyperdag/trustshell
```

---

## Quick Start (TypeScript)

### 1. Anti-Hallucination Evaluation
Route agent outputs through the HAL pipeline to obtain a consensus trust score and veto verdict:

```typescript
import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key',
  llmProvider: 'anthropic', // anthropic | openai | google | grok
  profile: 'balanced'        // conservative | balanced | pro
});

// Evaluate a response with its stated certainty (0-1)
const result = await shell.evaluate(
  "The capital of Australia is Sydney.",
  0.95
);

console.log(result.approved);   // false
console.log(result.hal_score);  // 0.89 (High dissonance)
console.log(result.tier);       // "PROBATIONARY"
```

### 2. Reporting Hallucinations
When your agent detects its own LLM hallucinating, report it to train the pipeline and update RepID:

```typescript
await shell.report({
  text: "The capital of Australia is Sydney.",
  certainty: 0.95,
  hallucinationCaught: true
});
```

---

## ERC-8004 Read Helpers (On-Chain Queries)
Query agent identity and reputation details directly from the EVM contracts on Base Sepolia:

```typescript
// Look up live reputation metrics for a specific agent token
const summary = await shell.getRepID(5863);
console.log(`Score: ${summary.value}/100, Attestations: ${summary.count}`);

// Retrieve recent attestation records
const history = await shell.getReputationHistory(5863, {
  includeRevoked: false,
  limit: 10
});

// Look up a specific attestation by transaction hash
const attestation = await shell.getAttestation('0xe372d84d5d4e79e5b92f495647efa836d55d238ddd2c0e034f347d643721231f');
console.log(`Agent ID: ${attestation.agentId}, Decoded Value: ${attestation.value}`);
```

---

## x402 Micropayments (V1 Production-Grade)
Intercept HTTP 402 payment challenges and settle them automatically via a Base Sepolia wallet:

```typescript
import { X402Client } from '@hyperdag/trustshell';

const client = new X402Client({
  walletPrivateKey: '0x...', // Base Sepolia private key
  rpcUrl: 'https://...'      // RPC provider URL
});

// Performs challenge handshake, signs, settles, and returns resource
const response = await client.fetch('https://api.example.com/protected-resource');
const data = await response.json();
```

---

## Command Line Interface (CLI)

Global installation gives you a terminal companion for troubleshooting and quick queries:

```bash
npm install -g @hyperdag/trustshell
```

### Common Commands

```bash
# Initialize TrustShell config in your project root
trustshell init

# Verify a claim text against the HAL pipeline
trustshell verify "The Eiffel Tower is in Paris"

# Query ERC-8004 Registry for an Agent ID
trustshell whois 5863

# Retrieve details of an on-chain attestation
trustshell attestation 0xe372d84d5d4e79e5b92f495647efa836d55d238ddd2c0e034f347d643721231f
```

---

## Python Client Setup
A lightweight Python client wrapper is available under the `python/` directory of the repository:

```bash
cd python
pip install -e .
```

```python
from trustshell import TrustShell

shell = TrustShell(agent_id="your-agent-id", api_key="your-api-key")
result = shell.evaluate("The Eiffel Tower is in Tokyo.", certainty=0.9)
print(result["approved"])  # False
```

---

## Ecosystem Integration
The `@hyperdag/trustshell` package is the core client library for the HyperDAG trust layer:
- **[repid-engine (private)](https://github.com/DealAppSeo/repid-engine)**: The server-side scoring engine and oracle implementation.
- **[trustrepid.dev](https://trustrepid.dev)**: The public agent leaderboard and per-LLM trust database.
- **[trustchat.dev](https://trustchat.dev)**: Real-time hallucination comparison and evaluation.

---

## License
Apache 2.0 — see [LICENSE](LICENSE).

Patent rights, if any, are granted under the Apache 2.0 patent grant clause. Commercial use of the Pythagorean Comma Veto methodology in closed-source systems requires written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible. Micah 6:8.
