# TrustShell CLI Walkthrough

The TrustShell CLI (`trustshell`) provides developer-friendly terminal access to the trust infrastructure for AI agents. This guide covers how to install, configure, and use the CLI to interface with:
1. **HAL Fact-Checking Engine**: Real-time hallucination evaluation and quorum consensus.
2. **ERC-8004 Reputation Registry**: Multi-tier reputation queries for agent addresses.
3. **Attestation History**: On-chain verification log inspection.
4. **x402 Outbound Payments**: Automated escrow construction and settlement.

---

## 1. Installation

Install the package globally using npm:

```bash
npm install -g @hyperdag/trustshell
```

Alternatively, you can run it on-demand using `npx`:

```bash
npx @hyperdag/trustshell --help
```

---

## 2. Configuration & Initialization

To avoid passing RPC endpoints and contract addresses with every command, initialize a configuration file in your project's root directory:

```bash
trustshell init
```

This creates a `.trustshell.json` file in your current directory:

```json
{
  "version": "0.6.0",
  "network": "base-sepolia",
  "chainId": 84532,
  "contracts": {
    "identityRegistry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "reputationRegistry": "0x8004B663056A597Dffe9eCcC1965A193B7388713"
  },
  "api": {
    "endpoint": "https://repid-engine-production.up.railway.app"
  }
}
```

### Environment Variables
You can set common credentials as environment variables to keep them out of command history:
- `REPID_API_KEY`: API key for HAL evaluation requests.
- `TRUSTSHELL_KEY`: Wallet private key for constructing x402 escrows.

---

## 3. CLI Reference & Subcommands

### 3.1. `verify`
Run HAL evaluation on any claim text.

```bash
# Set API Key first
export REPID_API_KEY="your_api_key_here"

# Execute evaluation
trustshell verify "The transaction hash 0x123... is settled."
```

#### Options:
* `--strictness <1|2>`: HAL strictness level (default: `2`). Strictness `2` requires strict fact checks and lower tolerance for hallucinations.
* `--endpoint <url>`: Override the fact-checking API endpoint.
* `--api-key <key>`: Explicitly provide the API key.

#### Example Output:
```text
🔍 HAL Evaluation
  Evaluating: "The transaction hash 0x123... is settled."
  Strictness: 2

  Decision: clean ✓
  Score: 0.98
  Providers: 3/3
  Latency: 412ms
```

---

### 3.2. `whois`
Query agent reputation from the ERC-8004 registry on Base Sepolia.

```bash
trustshell whois 0x9bB5... # Query by agent address
# OR
trustshell whois 5863      # Query by Agent Token ID
```

#### Options:
* `--rpc <url>`: Custom Web3 RPC provider URL (defaults to Base Sepolia public RPC).
* `--registry <address>`: Custom ReputationRegistry address.
* `--engine <url>`: Custom reputation resolution metadata engine endpoint.

#### Example Output:
```text
🪪 Agent Reputation (ERC-8004 Base Sepolia)
  Identifier: 5863

  Token ID: 5863
  Recent attestations: 24
  Average score: 88 / 100
  Tier: VETERAN
```

#### Reputation Tiers Guide
* `VETERAN` (Score >= 80%): Highly reliable, long-standing agent.
* `AUTONOMOUS` (Score 50% - 79%): Verified agent with typical operational bounds.
* `ESTABLISHED` (Score 10% - 49%): Active agent building up transaction history.
* `EARNING` (Score 5% - 9%): Newly registered agent with initial attestations.
* `PROBATIONARY` (Score < 5%): Unattested, flagged, or new agent.

---

### 3.3. `attestation`
Inspect on-chain attestation details from the Reputation Registry for a specific transaction hash.

```bash
trustshell attestation 0xa6938437b084c84998d16914eaa3168042428cdf61aba96c7e1a04ee1901e632
```

#### Options:
* `--rpc <url>`: Custom Web3 RPC provider URL.
* `--registry <address>`: Custom ReputationRegistry address.

#### Example Output:
```text
📜 Attestation Details
  Tx Hash: 0xa6938437b084c84998d16914eaa3168042428cdf61aba96c7e1a04ee1901e632

  Block: 41875622
  From client: 0x228B105F8bCD440d5885C4FBA6b81F394C01A940
  To agent ID: 5863
  Score: 95
  Tags: validation, base-sepolia
  Feedback URI: ipfs://QmQeY9uD7m7mSw2Dq5...
  Feedback Hash: 0x48a58cd874...
```

---

### 3.4. `pay`
Construct an x402 outbound payment flow to fund and register an escrow for a service contract.

```bash
export TRUSTSHELL_KEY="your_private_wallet_key"

trustshell pay contract-7762
```

#### Options:
* `--key <privateKey>`: Provide wallet private key explicitly. (Keep keys out of shared terminals!).
* `--endpoint <url>`: Override the payment coordinator/engine endpoint.
* `--rpc <url>`: Override the RPC URL.

#### Example Output:
```text
💳 x402 Payment Flow
  Contract: contract-7762

  Settlement ID: 8872-bb2f-901a
  Status: escrowed
```

This completes the client-side signature generation, token approval, and deposit sequence on Base Sepolia.
