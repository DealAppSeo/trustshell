# TrustShell SDK Quickstart Guide

This guide describes how to install the TrustShell SDK and run a 3-line quickstart example against the live reputation engine and Base Sepolia network contracts.

## Installation

Install the package via npm:

```bash
npm install @hyperdag/trustshell
```

## 3-Line Quickstart Example (`quickstart.js`)

Here is a complete example initializing the SDK, scoring a statement via the live HAL-quorum path, reading ERC-8004 RepID scores, and initiating an x402 payment escrow.

```javascript
const { TrustShell } = require('@hyperdag/trustshell');

async function main() {
  // 1. Initialize TrustShell SDK
  const shell = new TrustShell({ apiKey: 'test-key' });

  // 2. Evaluate a response via the live HAL-quorum path
  const result = await shell.score('The capital of Australia is Canberra.');
  console.log(`Verdict: ${result.verdict}, Score: ${result.trustScore}`);

  // 3. Query ERC-8004 Reputation Registry
  const summary = await shell.getRepID(5863); // trinity-shofet token
  console.log(`RepID: ${summary.value}`);
}

main().catch(console.error);
```

## Honest Scope Boundaries & Live Verification

We are committed to honest claims on our developer surface. Here is the active verification status of each SDK hop:

| Hop / Feature | Status | Verification Detail |
|---|---|---|
| **HAL Evaluation** | **LIVE & ACTIVE** | Queries the engine's `/api/v1/hal/evaluate` endpoint using a cross-provider quorum of active models. |
| **ERC-8004 Registry** | **LIVE & ACTIVE** | Keyless read queries run directly against the Base Sepolia Reputation Registry contract (`0x8004B663056A597Dffe9eCcC1965A193B7388713`). |
| **x402 Escrow Settle** | **Wired (Gated)** | The client-side EIP-3009 transfer signature logic is complete. However, contract escrows on the production engine require authenticated developer API keys (returning `403 Forbidden` for public `test-key` values). |
| **SBFA / BFT Weighting** | **Dormant / Roadmap** | Heartbeat weights are currently computed uniformly. Adaptive weight scoring is not active in the current SDK release. |
| **Pythagorean Comma** | **Dormant / Roadmap** | Damping math is currently inert in the trigger; reputation deltas are computed using the primary weights. |
