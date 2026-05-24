# API Reference

`@hyperdag/trustshell` v0.6.0. Default engine: `https://repid-engine-production.up.railway.app`
(override with `engineUrl` in the constructor). Unfamiliar terms? See the [glossary](./glossary.md).

## SDK

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
Score a decision and record it against your agent. Emits `byok-warning` if your provider's trust < 70,
then submits to the engine.
- `text: string` — the decision/output to check.
- `certainty: number` — 0–1, your agent's confidence.
- `options?: Partial<Decision>` — `taskDomain`, `alignmentCategory`, `economicImpactUSDC`, `hallucinationCaught`.
- **Returns** `RepIDResult`: `{ approved, hal_score, repid_delta, new_score, vested_repid, vesting_active, tier, vdr_count, veto_reason? }`.
- **Throws** if the score-event request fails (non-2xx).
```typescript
const r = await shell.evaluate('Execute trade: buy 0.1 BTC at market', 0.87);
// { approved: true, hal_score: 0.08, repid_delta: +3, new_score: 1003, tier: 'EARNING_AUTONOMY', vdr_count: 1, vesting_active: true }
```

### `report(decision) → Promise<RepIDResult>`
Lower-level submit (called by `evaluate`). `decision: { text, certainty, taskDomain?, alignmentCategory?, economicImpactUSDC?, hallucinationCaught? }`. Use directly to log a caught hallucination:
```typescript
await shell.report({ text: 'The capital of Australia is Sydney', certainty: 0.95, hallucinationCaught: true });
```

### `getRepID(agentAddressOrId?, options?) → Promise<AgentRepID | RepIDSummary>`
Read an agent's RepID. With no args, returns your own agent's RepID (engine read); with an id/address,
queries the on-chain ReputationRegistry summary (count, mode score, decimals).
```typescript
const summary = await shell.getRepID(5863); // trinity-shofet
```

### `getReputationHistory(agentAddressOrId?, options?) → Promise<FeedbackItem[]>`
Recent attestations for a target agent from the ReputationRegistry. `options`: `{ includeRevoked?, limit? }`.

### `getAttestation(txHash, options?) → Promise<AttestationDetails>`
Decode a specific attestation by transaction hash → `{ agentId, value, feedbackURI, ... }`.

### `payAndEscrow(contractId, privateKey) → Promise<any>`
Runs the x402 402-challenge handshake, signs the EIP-3009 authorization, and submits the settled escrow
to the engine. Also available as `X402Client` (fetch interceptor) — see the package README.

### `getLLMTrustScore(provider) → Promise<number | null>`
Current trust score (%) for an LLM provider, or `null` if unknown.

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
Construct + submit an x402 escrow. Requires `TRUSTSHELL_KEY`. (Live USDC fires are gated; dry-run/parse
validated in the published build.)

### `trustshell init`
Writes `.trustshell.json` (network, chainId, contract addresses, engine endpoint).

## Errors
- **401** — missing API key (`Authorization: Bearer <key>` or `x-api-key`).
- **403** — invalid/revoked key.
- **429** — rate limited (e.g. key-request intake: 1/hour/email).
- SDK methods **throw** on non-2xx engine responses; wrap calls in try/catch.

> Examples reflect the published v0.6.0 surface; live CLI output and contract addresses are captured from
> the production deployment. See [examples/cli-walkthrough.md](../examples/cli-walkthrough.md) for the full walkthrough.
