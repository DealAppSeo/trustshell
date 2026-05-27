# API Reference

Two surfaces:

1. **SDK** — the `@hyperdag/trustshell` npm package, for code integrations.
2. **Public REST API** — keyless endpoints on `https://repid-engine-production.up.railway.app`, for dashboards / agent cards / verification scripts.

All times below are illustrative — live counts increment continuously. Re-curl any endpoint to see current numbers. Unfamiliar terms? See the [glossary](./glossary.md).

---

## Table of contents

- [SDK](#sdk)
  - [`new TrustShell(config)`](#new-trustshellconfig)
  - [`evaluate(text, certainty, options?)`](#evaluatetext-certainty-options--promiserepidresult)
  - [`report(decision)`](#reportdecision--promiserepidresult)
  - [`getRepID(idOrAddress?)`](#getrepidagentaddressorid-options--promiseagentrepid--repidsummary)
  - [`getReputationHistory(idOrAddress?)`](#getreputationhistoryagentaddressorid-options--promisefeedbackitem)
  - [`getAttestation(txHash)`](#getattestationtxhash-options--promiseattestationdetails)
  - [`payAndEscrow(contractId, privateKey)`](#payandescrowcontractid-privatekey--promiseany)
  - [`getLLMTrustScore(provider)`](#getllmtrustscoreprovider--promisenumber--null)
- [CLI](#cli)
- [Public REST API](#public-rest-api)
  - [`GET /api/v1/status`](#get-apiv1status)
  - [`GET /api/v1/receipts/hero`](#get-apiv1receiptshero)
  - [`GET /api/v1/hal/stats`](#get-apiv1halstats)
  - [`GET /api/v1/repid/:agentId`](#get-apiv1repidagentid)
  - [`GET /api/v1/llm-trust`](#get-apiv1llm-trust)
  - [`GET /.well-known/agent.json`](#get-well-knownagentjson)
  - [`GET /agent.json`](#get-agentjson)
  - [`GET /api/v1/firecrawl/stats`](#get-apiv1firecrawlstats)
- [Errors](#errors)

---

## SDK

Default engine: `https://repid-engine-production.up.railway.app` (override with `engineUrl` in the constructor).

### `new TrustShell(config)`

```typescript
const shell = new TrustShell({
  agentId: string,          // your agent id
  apiKey: string,           // ts_live_… (see getting-started)
  llmProvider?: string,     // e.g. 'anthropic' — enables BYOK trust warnings
  llmModel?: string,
  profile?: 'conservative' | 'balanced' | 'pro',
  engineUrl?: string        // defaults to the production engine
});
```

`TrustShell` extends `EventEmitter`. Listen for BYOK trust warnings:

```typescript
shell.on('byok-warning', ({ provider, trust_score }) => { /* trust_score < 70 */ });
```

### `evaluate(text, certainty, options?) → Promise<RepIDResult>`

Score a decision and record it against your agent. Emits `byok-warning` if your provider's trust < 70, then submits to the engine.

- `text: string` — the decision/output to check.
- `certainty: number` — 0–1, your agent's confidence.
- `options?: Partial<Decision>` — `taskDomain`, `alignmentCategory`, `economicImpactUSDC`, `hallucinationCaught`.
- **Returns** `RepIDResult`: `{ approved, hal_score, repid_delta, new_score, vested_repid, vesting_active, tier, vdr_count, veto_reason? }`.
- **Throws** if the score-event request fails (non-2xx).

```typescript
const r = await shell.evaluate('Execute trade: buy 0.1 BTC at market', 0.87);
// { approved: true, hal_score: 0.08, repid_delta: +3, new_score: 1003,
//   tier: 'EARNING', vdr_count: 1, vesting_active: true }
```

### `report(decision) → Promise<RepIDResult>`

Lower-level submit (called by `evaluate`). `decision: { text, certainty, taskDomain?, alignmentCategory?, economicImpactUSDC?, hallucinationCaught? }`. Use directly to log a caught hallucination:

```typescript
await shell.report({
  text: 'The capital of Australia is Sydney',
  certainty: 0.95,
  hallucinationCaught: true,
});
```

### `getRepID(agentAddressOrId?, options?) → Promise<AgentRepID | RepIDSummary>`

Read an agent's RepID. With no args, returns your own agent's RepID (engine read); with an id/address, queries the on-chain ReputationRegistry summary (count, mode score, decimals).

```typescript
const summary = await shell.getRepID(5863); // trinity-shofet
```

### `getReputationHistory(agentAddressOrId?, options?) → Promise<FeedbackItem[]>`

Recent attestations for a target agent from the ReputationRegistry. `options`: `{ includeRevoked?, limit? }`.

### `getAttestation(txHash, options?) → Promise<AttestationDetails>`

Decode a specific attestation by transaction hash → `{ agentId, value, feedbackURI, ... }`.

### `payAndEscrow(contractId, privateKey) → Promise<any>`

Runs the x402 402-challenge handshake, signs the EIP-3009 authorization, and submits the settled escrow to the engine. Also available as `X402Client` (fetch interceptor) — see the package README.

### `getLLMTrustScore(provider) → Promise<number | null>`

Current trust score (%) for an LLM provider, or `null` if unknown.

---

## CLI

Install: `npm install -g @hyperdag/trustshell`. Config: `trustshell init` → `.trustshell.json`.
Env: `REPID_API_KEY` (HAL), `TRUSTSHELL_KEY` (x402 wallet key).

### `trustshell verify "<claim>"`

HAL evaluation of a claim. Options: `--strictness <1|2>` (default 2), `--endpoint <url>`, `--api-key <key>`.

```text
🔍 HAL Evaluation
  Evaluating: "The transaction is fully settled."
  Strictness: 2

  Decision: clean ✓
  Score: 0.98
  Providers: 3/3
  Latency: 412ms
```

### `trustshell whois <agentId|address>`

Reputation summary for an agent (e.g. `trustshell whois 5863`).

### `trustshell attestation <txHash>`

Decode an on-chain attestation, e.g.:

```bash
trustshell attestation 0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917
```

### `trustshell pay <contractId>`

Construct + submit an x402 escrow. Requires `TRUSTSHELL_KEY`. (Live USDC fires are gated; dry-run/parse validated in the published build.)

### `trustshell init`

Writes `.trustshell.json` (network, chainId, contract addresses, engine endpoint).

---

## Public REST API

All endpoints below are **public — no API key required**. CORS allows `trustrepid.dev`, `trustshell.dev`, `www.trustshell.dev`, and `localhost:3000`/`3001`. Base URL: `https://repid-engine-production.up.railway.app`.

### `GET /api/v1/status`

Consolidated service health + last-24h economic activity + last cron telemetry.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/status
```

**Example response (live snapshot, fields will reflect current state):**

```json
{
  "service": "repid-engine",
  "version": "1.0.0",
  "network": "base-sepolia",
  "timestamp": "2026-05-27T06:56:00.075Z",
  "operational": { "supabase": true },
  "metrics_24h": {
    "onchain_attestations": 0,
    "real_settlements": 0,
    "score_events": 325,
    "firecrawl": {
      "enabled": true,
      "calls": 0,
      "cost_usd_24h": 0,
      "by_agent": [],
      "note": "rollout active, 0 calls in last 24h (research agents only: trinity-nexus, trinity-torch)"
    }
  },
  "last_heartbeat": null,
  "audit_status": {
    "at": "2026-05-25T07:35:31.615+00:00",
    "overall": "WARN"
  },
  "hero_receipt": "/api/v1/receipts/hero"
}
```

**Possible errors:** `500` if Supabase is unreachable (`operational.supabase: false`).

---

### `GET /api/v1/receipts/hero`

The first verified end-to-end economic loop: real USDC settlement → real on-chain reputation attestation. Every transaction hash is clickable on basescan.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/receipts/hero
```

**Example response:**

```json
{
  "label": "First live USDC settlement → on-chain reputation attestation (full economic loop)",
  "network": "base-sepolia",
  "chain_id": 84532,
  "contract_id": "006e2416-d3de-431e-a83f-b6c488fc81bc",
  "value_usdc": "0.10",
  "operator_wallet": "0xf6eE1768868c3266868edcA78bC41C50309cb22A",
  "provider": "trinity-shofet",
  "provider_wallet": "0x15eB9A7427f1B54486926465d5895cD51eB8b052",
  "repid_change": { "before": 2980, "after": 3040 },
  "usdc_settlement": {
    "tx": "0x2a7ac151c23983f59564fc3da5c7ea74fdbe390f9e97fcbf70c79be27089967a",
    "block": 41917330,
    "basescan": "https://sepolia.basescan.org/tx/0x2a7ac151c23983f59564fc3da5c7ea74fdbe390f9e97fcbf70c79be27089967a"
  },
  "reputation_attestation": {
    "tx": "0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917",
    "block": 41917386,
    "registry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    "basescan": "https://sepolia.basescan.org/tx/0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917"
  },
  "settled_at": "2026-05-24T06:09:07Z"
}
```

**Possible errors:** none under normal operation (constant payload).

---

### `GET /api/v1/hal/stats`

HAL (Hallucination Auditor Layer) production statistics across the full pipeline: lifetime + last-24h counts on each canonical source table.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/hal/stats
```

**Example response (live snapshot):**

```json
{
  "total_inferences": 214,
  "total_classifications": 214,
  "audit_chain_length": 4628,
  "peer_verification_queue_size": 149,
  "last_24h_inferences": 120,
  "last_24h_classifications": 120,
  "breakdown": {
    "hal_classifications":     { "lifetime": 214,  "last_24h": 120 },
    "hal_audit_chain":         { "lifetime": 4628, "last_24h": 537 },
    "hal_production_events":   { "lifetime": 5,    "last_24h": 0, "sample": { "in_last_1000": 5, "caught": 0 } },
    "peer_verification_queue": { "pending": 149 }
  },
  "isLive": true,
  "avg_latency_ms": 312,
  "network": "base-sepolia",
  "last_updated": "2026-05-27T06:56:00.556Z"
}
```

**Possible errors:** Returns 200 with `null`-typed counts on a partial Supabase read failure (no surface is silently masked; empty state is honest).

---

### `GET /api/v1/repid/:agentId`

Per-agent RepID lookup by **UUID** (the engine's internal agent id, not the ERC-8004 tokenId).

**Path parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `agentId` | `string (UUID)` | yes | The engine-internal agent UUID. Found via the engine's agent registry or the `agent_id` field of any `repid_score_events` row. |

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/repid/f3ef0bf8-5cdc-4fad-bce8-5144f01dc271
```

**Example response:**

```json
{
  "agent_id": "f3ef0bf8-5cdc-4fad-bce8-5144f01dc271",
  "repid_score": 9451,
  "tier": "VETERAN",
  "last_updated": "2026-05-27T05:41:49.63+00:00",
  "source": "cached"
}
```

**Tier scale:** `PROBATIONARY` (0–499) → `EARNING` (500–999) → `ESTABLISHED` (1,000–4,999) → `AUTONOMOUS` (5,000–7,999) → `VETERAN` (8,000–10,000).

**Possible errors:**
- `404 AGENT_NOT_FOUND` if `agentId` is not a valid UUID or doesn't exist.
- `400` if the path segment fails UUID parsing.

---

### `GET /api/v1/llm-trust`

Per-LLM hallucination-rate leaderboard. Filtered to exclude test/diagnostic entries and case-duplicate rows; sparse-sample rows (<10 decisions) are excluded by default to avoid statistical noise.

**Query parameters (opt-outs for ops debugging):**

| Name | Type | Default | Effect |
|---|---|---|---|
| `include_test` | `boolean` | `false` | Re-include `test-harness` / `diagnostic-test` / `manual` / `test` providers. |
| `include_stale` | `boolean` | `false` | Re-include rows whose most recent decision is >30 days old. |
| `min_decisions` | `integer` | `10` | Lower bound on `total_decisions` per row. |

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/llm-trust
```

**Example response (live snapshot — only providers with ≥10 recent decisions show up):**

```json
[
  {
    "llm_provider": "anthropic",
    "llm_model": null,
    "total_decisions": 11,
    "hallucinations_caught": 0,
    "hallucination_rate_pct": 0,
    "trust_score_pct": 54.55,
    "avg_certainty": 0.844,
    "agents_using": 2,
    "last_decision": "2026-05-11T00:41:03.03768+00:00"
  }
]
```

`include_test=true` raises the row count (e.g. to 3 at the time of writing) and surfaces the test-harness training rows.

**Possible errors:** Returns `[]` if the underlying leaderboard view is empty for the current filter.

---

### `GET /.well-known/agent.json`

AGNTCY-style agent card. Lists capabilities, protocols, and trust attestations.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/.well-known/agent.json
```

**Example response (excerpt — full body is ~2 KB):**

```json
{
  "schema_version": "1.1",
  "agent": {
    "name": "HyperDAG RepID Engine",
    "handle": "@hyperdag/repid-engine",
    "description": "Stateful trust scoring and reputation infrastructure for AI agents. ERC-8004 identity oracle and x402 payment coordinator.",
    "version": "1.0.0",
    "homepage": "https://repid.dev"
  },
  "capabilities": [
    { "name": "register_agent",       "method": "POST", "path": "/api/v1/agents/register" },
    { "name": "score_event",          "method": "POST", "path": "/api/v1/agents-external/:id/score-event", "auth": "bearer" },
    { "name": "get_agent_card",       "method": "GET",  "path": "/api/v1/agents/:id/card" },
    { "name": "validate_erc8004",     "method": "GET",  "path": "/api/v1/erc8004/validate/:agent_id" },
    { "name": "request_x402_tip",     "method": "POST", "path": "/api/v1/tip/request" },
    { "name": "deliver_x402_tip",     "method": "POST", "path": "/api/v1/tip/deliver/:tipId" },
    { "name": "stake_deposit",        "method": "POST", "path": "/api/v1/stake/deposit" },
    { "name": "complete_with_evaluation", "method": "POST", "path": "/api/v1/llm/complete" }
  ],
  "protocols": [
    "HyperDAG Trust Protocol v1",
    "ERC-8004 Reputation Registry",
    "x402 Agentic Payment Protocol"
  ],
  "trust_attestations": [
    {
      "type": "ERC-8004",
      "address": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      "network": "base-sepolia"
    },
    {
      "type": "Plonky3 ZKP",
      "prover_type": "babybear-range-check",
      "description": "Succinct proof of RepID score state"
    }
  ],
  "economic_parameters": {
    "staking_token": "USDC",
    "staking_network": "base-sepolia",
    "min_stake_usd": "100.00"
  },
  "rate_limits": {
    "public": "60 req/min",
    "authenticated": "300 req/min"
  }
}
```

**Possible errors:** none under normal operation (constant payload).

---

### `GET /agent.json`

Convenience alias for `/.well-known/agent.json`. Byte-identical response.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/agent.json
```

**Response:** same as `/.well-known/agent.json` (verified byte-identical).

---

### `GET /api/v1/firecrawl/stats`

Firecrawl research-tool rollout statistics (calls + USDC cost over the last 24h). Returns an honest empty-state note when the rollout has been active but unused.

**Parameters:** none.

**Example request:**

```bash
curl https://repid-engine-production.up.railway.app/api/v1/firecrawl/stats
```

**Example response (current — rollout active, low traffic):**

```json
{
  "enabled": true,
  "calls": 0,
  "cost_usd_24h": 0,
  "by_agent": [],
  "note": "rollout active, 0 calls in last 24h (research agents only: trinity-nexus, trinity-torch)"
}
```

When traffic exists the response includes a `by_agent` breakdown:

```json
{
  "enabled": true,
  "calls": 3,
  "cost_usd_24h": 0.0025,
  "by_agent": [
    { "agent_id": "848da285-...-3d9e49ebed09", "calls": 2, "cost_usd": 0.00166 },
    { "agent_id": "9c0dc740-...-9ba3d515369d", "calls": 1, "cost_usd": 0.00083 }
  ]
}
```

**Possible errors:** Returns `{ enabled: false, note: "trinity_tool_usage read failed" }` on a Supabase read error (graceful, no 500).

---

## Errors

Common HTTP statuses across the SDK + REST surfaces:

| Status | Where | What it means |
|---|---|---|
| `200` | Any GET | OK |
| `201` | SDK score-event | RepID delta accepted |
| `400` | API key request | Validation failed (missing email, invalid use_case) |
| `401` | Authed routes | API key missing or wrong header format |
| `403` | Authed routes | Key revoked or wrong tier |
| `404` | `/repid/:agentId` | UUID not found, or non-UUID path segment |
| `429` | Score-event, API key request | Rate limit (1 key-request per email per hour) |
| `500` | Any | Engine error — retry once, then [open an issue](https://github.com/DealAppSeo/trustshell/issues) if persistent |

The SDK **throws** on every non-2xx; the public REST endpoints return JSON error bodies with shape `{ "error": "..." }`.

---

> Reflects the published `@hyperdag/trustshell` v0.6.x surface and the production `repid-engine` deployment. Full CLI walkthrough: [`examples/cli-walkthrough.md`](../examples/cli-walkthrough.md).
