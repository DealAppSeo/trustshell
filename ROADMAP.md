# x402 Payment Client Roadmap (V1 Sprint)

This document outlines the plans for completing the `x402` payment attestation client interface within `@hyperdag/trustshell`.

## Current State (v0.5.0)
- **Scaffold & Type Surface:** Fully defined interfaces for `X402Challenge`, `X402Payment`, and client classes.
- **Fetch Interceptor:** An `X402Client` that intercepts HTTP `402 Payment Required` responses, extracts the challenge, and automatically attaches the `X-PAYMENT` header on retry.
- **Stubs:** `constructPaymentAndSign` is stubbed to prevent execution and prompt alignment during this integration phase.

---

## V1 Implementation Goals

### 1. Web3 Wallet Integration
- Support standard Ethereum private keys, hardware wallet interfaces, and standard web3 provider wrappers (e.g., `ethers`, `viem`).
- Allow safe, scoped wallet signatures strictly for generating ERC-8004 attestation payloads.

### 2. On-Chain Settlement Engine
- Implement transaction dispatch to target blockchain networks (Base, Arbitrum, Ethereum Mainnet, etc.) based on the challenge `accepts` field.
- Add robust gas price estimation and replacement transaction handling ("speed up").
- Poll for transaction receipts using configurable block confirmation thresholds before submitting the `X-PAYMENT` header.

### 3. Paymaster & Relay Support (Gasless)
- Support ERC-4337 paymasters or custom relayer endpoints so that agents do not have to hold native gas tokens (ETH, etc.) directly on their operational hot wallets.
- Interface with gasless transaction relayers to pass structured payment signatures.

### 4. Advanced Error Recovery & Retries
- Implement specific catch blocks for:
  - **Insuffient Gas/Funds:** Emits warning event to the agent shell.
  - **Transaction Revert:** Decodes revert reasons to determine if a challenge is stale or payment parameters were rejected.
  - **Mempool Congestion:** Auto-resubmits with elevated gas pricing.

### 5. Alignment with `repid-engine`
- Ensure full end-to-end validation against the server-side attestation parser in `repid-engine`'s API layer.
