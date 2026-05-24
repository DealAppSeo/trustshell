# Getting Started with TrustShell

A 5-minute path from zero to your first verified claim.

## What is TrustShell? (30 sec)

`@hyperdag/trustshell` is a small client that gives any AI agent a **constitutional check** before it
acts and a **portable reputation** (RepID) it earns over time. You send a decision (text + how certain
your agent is); the HAL pipeline scores it for hallucination/risk and returns an APPROVE / HITL / BLOCK
verdict plus a RepID delta. One network call to the canonical engine — no local-only verdict path.

Three primitives: **RepID** (behavioral reputation), **HAL** (hallucination assessment), **x402**
(agent-to-agent payments). See [architecture-overview.md](./architecture-overview.md). New to the terms?
The [glossary](./glossary.md) defines everything in plain language.

## 5-minute quickstart

### 1. Install
```bash
npm install -g @hyperdag/trustshell   # CLI
# or, for the SDK in your project:
npm install @hyperdag/trustshell
```

### 2. Initialize (CLI)
```bash
trustshell init
```
Creates `.trustshell.json` (network, chainId, contract addresses, engine endpoint):
```json
{
  "version": "0.6.0",
  "network": "base-sepolia",
  "chainId": 84532,
  "contracts": {
    "identityRegistry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "reputationRegistry": "0x8004B663056A597Dffe9eCcC1965A193B7388713"
  },
  "api": { "endpoint": "https://repid-engine-production.up.railway.app" }
}
```

### 3. Look up an existing agent (no key needed)
```bash
trustshell whois 5863      # trinity-shofet
```

### 4. Get an API key
HAL evaluation needs a testnet key. Testnet keys are **free** and currently **early access**; expected
turnaround is **within 24 hours**. Pick whichever path you prefer:

**Option A — Web form:** [trustshell.dev/get-api-key](https://trustshell.dev/get-api-key)

**Option B — GitHub Issue:** [open an API-key request](https://github.com/DealAppSeo/trustshell/issues/new?template=api_key_request.yml)

**Option C — Email:** keys@hyperdag.dev (include your use case)

**Option D — Direct API** (for scripts):
```bash
curl -X POST https://repid-engine-production.up.railway.app/api/v1/api-key-requests/request \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","use_case":"Verifying my trading agent'\''s outputs before execution"}'
# → { "request_id": 123, "status": "pending", ... }   (1 request per email per hour)
```
A testnet key (`ts_live_…`) is emailed after review. (Self-service auto-provision is on the roadmap.)

### 5. Verify your first claim
```bash
export REPID_API_KEY="ts_live_your_key_here"
trustshell verify "The transaction is fully settled."
```
```text
🔍 HAL Evaluation
  Evaluating: "The transaction is fully settled."
  Strictness: 2

  Decision: clean ✓
  Score: 0.98
  Providers: 3/3
  Latency: 412ms
```

## What just happened?

Your claim was sent to the HAL pipeline, scored across multiple providers for hallucination/risk, and
returned a decision (`clean` / `flagged` / `vetoed`) with a 0–1 score and the provider quorum. No data
was stored against your agent unless you submit it as a scored decision via the SDK (`evaluate`).

## Integrate into your agent (SDK)

```typescript
import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: process.env.REPID_API_KEY,
  llmProvider: 'anthropic',
  profile: 'balanced'        // conservative | balanced | pro
});

const result = await shell.evaluate('Execute trade: buy 0.1 BTC at market', 0.87);
if (!result.approved) {
  // HAL vetoed — do not act
  console.warn('blocked:', result.veto_reason);
}
```

## How do I know it's working?
The engine exposes a public, no-auth metrics endpoint with live counts:
```bash
curl https://repid-engine-production.up.railway.app/api/v1/metrics
```
Per-LLM trust scores are also public at `/api/v1/llm-trust`. (Live counts move daily; see
[trustrepid.dev](https://trustrepid.dev) for the leaderboard.)

## Next steps
- [glossary.md](./glossary.md) — plain-language definitions of every term
- [architecture-overview.md](./architecture-overview.md) — how RepID + HAL + x402 fit together
- [api-reference.md](./api-reference.md) — every SDK method + CLI command
- [example-agent-spec.md](./example-agent-spec.md) — a minimal end-to-end agent
- [SUPPORT.md](./SUPPORT.md) — where to get help / report bugs / request keys

> Testnet (Base Sepolia) today. See the architecture overview for the mainnet roadmap.
