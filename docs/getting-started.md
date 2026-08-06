# Getting Started with TrustShell

A frictionless first hour: install, run a real claim through HAL, see the verdict, verify the on-chain trail.

## 1. What is TrustShell

`@hyperdag/trustshell` is the open-source npm client for the HyperDAG trust layer. You send an AI agent decision (a string + a 0–1 certainty); the **HAL** (Hallucination Auditor Layer) scores it across multiple LLM providers and returns a `PASS` / `FLAG` / `VETO` verdict plus a delta on the agent's portable reputation (**RepID**). Every score change is auditable; every reputation update is anchored on the canonical **ERC-8004 ReputationRegistry** on Base Sepolia.

Three primitives: **RepID** (reputation), **HAL** (hallucination defense), **x402** (agent-to-agent payments). All Apache 2.0. The reputation algorithm itself is also open — see [trustshell.dev/repid](https://trustshell.dev/repid). New to the terms? The [glossary](./glossary.md) covers each in plain language.

## 2. Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| **Node.js** | `>=18.0.0` | The CLI bin uses Node 18+ runtime features. |
| **npm** | bundled with Node 18 | Yarn / pnpm should work but aren't tested. |
| **Base Sepolia ETH** (testnet) | optional, only for on-chain writes | You **do not** need any ETH to (a) run HAL evaluation, (b) look up a RepID, or (c) read on-chain history. ETH is only needed if you plan to *write* reputation attestations yourself, which is rare for SDK consumers — most users let the engine handle on-chain writes. |
| **An API key (free, testnet)** | *not* required for HAL | HAL scoring, RepID reads and proofs are keyless. A key is only needed for write paths (`executeA2A`, `register`). See §4. |
| **`curl` + `jq` (optional)** | nice-to-have | Used by the verification snippets below. |

That's it. No Docker, no Postgres, no local services to stand up.

## 3. Installation

```bash
# As a project dependency (SDK):
npm install @hyperdag/trustshell

# As a global CLI:
npm install -g @hyperdag/trustshell
```

Verify the install:

```bash
trustshell --version
# → 1.2.0   (the installed package version)
```

## 4. 60-second quickstart

A copy-paste flow that takes you from zero to a verified on-chain RepID reference in about a minute.

### Step 1 — Look up an existing on-chain agent (no key, no install, just `curl`)

Verify the engine is live and the canonical ERC-8004 contracts are taking real traffic:

```bash
# Trinity-shofet, tokenId 5863, the most-recently-updated active agent:
curl https://repid-engine-production.up.railway.app/api/v1/repid/32e0e809-c1c4-4405-913f-135c8a2d6626
```

Expected response (RepID changes as the agent operates):

```json
{
  "agent_id": "32e0e809-c1c4-4405-913f-135c8a2d6626",
  "repid_score": 3120,
  "tier": "ESTABLISHED",
  "last_updated": "2026-05-24T15:39:03+00:00",
  "source": "cached"
}
```

The full economic loop receipt (a real $0.10 USDC settlement → real on-chain reputation attestation):

```bash
curl https://repid-engine-production.up.railway.app/api/v1/receipts/hero
```

Every `tx` field in the response is clickable on basescan:
[`0x2a7ac151…`](https://sepolia.basescan.org/tx/0x2a7ac151c23983f59564fc3da5c7ea74fdbe390f9e97fcbf70c79be27089967a) (USDC) →
[`0xd362c1b0…`](https://sepolia.basescan.org/tx/0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917) (reputation).

### Step 2 — (Optional) Get a testnet API key

**You do not need a key to start.** HAL evaluation (`score` / `verifyOutput` / `trustshell verify`),
RepID reads and proof presentation are all **keyless** against the public engine. Skip to Step 3
and come back here when you need a write path (`executeA2A`, `register`).

Keys are free for testnet and currently early-access.

- **GitHub issue:** [open an API key request](https://github.com/DealAppSeo/trustshell/issues/new?template=api_key_request.yml)
- **Direct API:**
  ```bash
  curl -X POST https://repid-engine-production.up.railway.app/api/v1/api-key-requests/request \
    -H "Content-Type: application/json" \
    -d '{"email":"you@example.com","use_case":"Verifying my trading agent before execution"}'
  ```

Turnaround target: within 24 hours. You'll receive a key in the form `ts_live_...`.

### Step 3 — Run your first HAL evaluation (SDK)

Drop the SDK into any TypeScript or JavaScript project:

```typescript
import { TrustShell } from '@hyperdag/trustshell';

// No key needed for this path.
const shell = new TrustShell();

const result = await shell.verifyOutput('Execute trade: buy 0.1 BTC at market');

console.log(result.verdict);      // 'PASS' | 'FLAG' | 'VETO'
console.log(result.trustScore);   // 0–100
console.log(result.ok);           // true for PASS and soft FLAG, false for VETO

if (!result.ok) {
  console.warn('HAL vetoed — do not act:', result.decisionReason);
  // Halt your agent's execution here.
}
```

Use `score()` instead when you want the full signal breakdown and the per-provider evidence:

```typescript
const s = await shell.score('The Earth orbits the Sun.');
console.log(s.verdict, s.trustScore, s.familiesUsed);
console.log(s.evidence);
// [ 'groq:TRUE (Scientific consensus supported by astronomical observations)',
//   'cerebras:TRUE (Fundamental astronomical fact.)', ... ]
```

### Step 4 — Run your first HAL evaluation (CLI alternative)

If you'd rather verify a claim without writing code:

No key required:

```bash
trustshell verify "The Earth orbits the Sun."
```

```text
✓ PASS  trust 100/100
  PASS — hal_score 0 via fact-check (full quorum)
  evidence:
    - groq:TRUE (Scientific consensus supported by astronomical observations)
    - cerebras:TRUE (Fundamental astronomical fact.)
    - gemini:TRUE (The Earth revolves around the Sun.)
    - mistral:TRUE (Heliocentric model confirmed by astronomy)
    - openrouter:TRUE (Earth orbits the Sun, established scientific fact.)
```

It exits `0` on PASS/FLAG and `1` on VETO, so it drops straight into CI:

```bash
trustshell verify "$(cat CHANGELOG_CLAIM.txt)" || exit 1
```

### Step 5 — Verify the on-chain trail

Every score change against your agent is appended to the ERC-8004 ReputationRegistry on Base Sepolia. Sample real attestation:

[`0xb2ab22b536abb7dc08d19a030b6e491face37387834dd361fba0d705accaed09`](https://sepolia.basescan.org/tx/0xb2ab22b536abb7dc08d19a030b6e491face37387834dd361fba0d705accaed09) — trinity-shofet, RepID 3120, ~134,661 gas, ReputationRegistry [`0x8004B663…`](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713).

That's the full loop: decision → HAL verdict → RepID delta → on-chain attestation.

## 5. Architecture overview

A 30-second mental model:

```
Your agent ── shell.verifyOutput(text) ─────────▶ HAL pipeline (multi-LLM cross-check)
                                                   │
                                                   ├─▶ veto / pass verdict (returned to you)
                                                   │
                                                   ├─▶ RepID update (open formula, see /repid)
                                                   │
                                                   └─▶ on-chain attestation on Base Sepolia
                                                       ReputationRegistry 0x8004B663…
```

Full diagram + design choices: [`architecture-overview.md`](./architecture-overview.md). The protocol spec + reference contracts live at [`DealAppSeo/hyperdag-protocol`](https://github.com/DealAppSeo/hyperdag-protocol). The score-computation rules are public and community-shapeable at [trustshell.dev/repid](https://trustshell.dev/repid).

## 6. Configuration reference

Every option you can pass to `new TrustShell(...)` — this is the complete `TrustShellConfig`:

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `undefined` | Optional. Only the write paths (`executeA2A`, `register`) need one; HAL scoring, RepID reads and proofs are keyless. |
| `apiUrl` | `string` | `'https://repid-engine-production.up.railway.app'` | Override for testing or a self-hosted engine. |
| `timeout` | `number` | SDK default | Request timeout in milliseconds. |

Environment variables:

| Env var | Read by | Description |
|---|---|---|
| `REPID_API_KEY` | CLI, MCP server | API key, when a write path needs one. |
| `TRUSTSHELL_API_URL` | CLI, MCP server, SDK | Override the backend origin. |

Those are the only two the code reads — verifiable with
`grep -rn 'process.env' src/`.

There is **no config file and no `init` command.** Configuration is the constructor and those two
environment variables; the contract addresses below are pinned in the SDK itself, not in a file
you maintain:

| | |
|---|---|
| network | `base-sepolia` (chainId `84532`) |
| identityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| reputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## 7. Error handling patterns

### SDK methods throw on non-2xx engine responses

Wrap every call in try/catch in production code. The engine returns typed JSON errors; the SDK preserves status + message.

```typescript
import { TrustShell } from '@hyperdag/trustshell';

try {
  const result = await shell.verifyOutput(text);
  if (!result.ok) {
    // HAL vetoed — your agent should NOT act on this output.
    log.warn('hal_veto', { reason: result.decisionReason, hal_score: result.halScore });
    return { ok: false, blocked: true };
  }
  return { ok: true, repid: result.new_score, tier: result.tier };
} catch (err: any) {
  // Network or non-2xx engine response.
  if (err.status === 401) throw new Error('REPID_API_KEY missing or invalid');
  if (err.status === 403) throw new Error('REPID_API_KEY revoked');
  if (err.status === 429) {
    log.warn('rate_limited', { retry_after: err.retryAfter });
    // Back off and retry, or fail open if your use case is non-critical.
  }
  throw err;
}
```

### Common HTTP statuses you'll see

| Status | Where | What it means | What to do |
|---|---|---|---|
| `200` | Any GET | OK | continue |
| `201` | SDK score-event | RepID delta accepted | continue |
| `400` | API key request | Validation failed (missing email, invalid use_case) | fix the body, retry |
| `401` | Authed routes | `REPID_API_KEY` missing or wrong header | re-check `Authorization: Bearer <key>` or `x-api-key: <key>` |
| `403` | Authed routes | Key revoked / wrong tier | request a new key |
| `429` | Score-event, API key request | Rate limit (1 key-request per email per hour) | back off, retry later |
| `500` | Any | Engine error or stale dependency | retry once; if persistent, [open an issue](https://github.com/DealAppSeo/trustshell/issues) |

### Graceful degradation (recommended)

Treat HAL as a circuit breaker, not a single point of failure. The recommended fail-open pattern for non-safety-critical agents:

```typescript
async function checkedExecute(decision: string) {
  try {
    const r = await shell.verifyOutput(decision);
    if (!r.ok) return { halted: true, reason: r.decisionReason };
    return { ok: true };
  } catch {
    // Engine unreachable — fail open with a clearly logged warning.
    // Safety-critical agents should fail CLOSED here instead.
    log.warn('hal_unreachable_fail_open');
    return { ok: true, hal_degraded: true };
  }
}
```

For safety-critical agents (anything with real economic impact), invert the catch: fail closed and halt.

### CORS

The public endpoints allow `trustrepid.dev`, `trustshell.dev`, `www.trustshell.dev`, and `localhost:3000`/`3001`. If you're embedding the public read API in a different domain you'll need to proxy server-side.

## 8. Where to get help

| Channel | When | Link |
|---|---|---|
| **GitHub Issues** | Bugs, surprising behavior, anything reproducible | [`DealAppSeo/trustshell/issues`](https://github.com/DealAppSeo/trustshell/issues) |
| **GitHub Discussions** | Open-ended questions, design feedback, integration help | [`DealAppSeo/hyperdag-protocol/discussions`](https://github.com/DealAppSeo/hyperdag-protocol/discussions) |
| **`/repid` governance** | Suggestions for the RepID algorithm itself (weights, signals, edge cases) | [trustshell.dev/repid](https://trustshell.dev/repid) — public suggestion form |
| **Security disclosures** | Anything with potential attack surface (RepID gaming, HAL bypasses, on-chain) | Use GitHub Security Advisory on the affected repo |
| **`SUPPORT.md`** | Quick reference for the above | [`docs/SUPPORT.md`](./SUPPORT.md) |

## 9. The full A2A journey — register → discover → buy → prove

Beyond HAL scoring, the SDK drives the whole agent-to-agent purchase loop end to end. The methods
below match the real `TrustShell` class (`src/lib/trustshell.ts`). A single runnable reference lives
at [`examples/a2a-purchase/`](../examples/a2a-purchase/).

```typescript
import { TrustShell, buildX402Payment } from '@hyperdag/trustshell';

const { client } = await TrustShell.init();

// 1) Register a new agent. ⚠ api_key is returned exactly ONCE — persist it immediately.
const reg = await client.register({ agentName: 'my-buyer', llmProvider: 'anthropic' });
//   → { agentId, apiKey, repid, tier }
// (anonymous human variant: client.registerHuman() → { agentId, privateId, repId, tier };
//  privateId is the human's only credential and is NOT stored server-side — save it now.)

// Re-init with the key so the auth-gated marketplace calls are authorized.
const { client: buyer } = await TrustShell.init({ apiKey: reg.apiKey });

// 2) Discover services. NOTE: /api/v1/services is auth-gated — this needs the key.
const catalog = await buyer.listServices({ type: 'verification' });
//   → { services: [{ id, providerAgentId, serviceType, serviceName, basePriceUsdcRaw, ... }],
//       count, priceRangeUsdcRaw: { min, max } }
const svc = catalog.services[0];
// const one = await buyer.getService(svc.id);   // single lookup

// 3) Sign an x402 payment (EIP-3009). The private key signs locally and is NEVER logged/sent.
const xPaymentHeader = await buildX402Payment({
  privateKey: process.env.TRUSTSHELL_PAYER_KEY!,  // funded Base Sepolia key
  to: svc.providerAgentId,                        // provider payTo (from the 402 requirements)
  amount: svc.basePriceUsdcRaw,                   // micro-USDC raw
});

// 4) Buy: create the service contract + escrow the payment.
const a2a = await buyer.executeA2A({
  buyerAgentId: reg.agentId,
  serviceId: svc.id,
  payload: { claim: 'The capital of France is Paris.' },
  xPaymentHeader,
});
//   → { contractId, status, providerAgentId, agreedPriceUsdcRaw, settlementId? }
//   If you omit xPaymentHeader, executeA2A returns a.paymentRequired echo (the 402 requirements)
//   so you can sign against accepts[0].payTo and retry — no settlement is ever faked.

// 5) Await async fulfillment (provider agent / cascade worker).
const final = await buyer.pollUntilSettled(a2a.contractId, { intervalMs: 3000, timeoutMs: 120_000 });
//   or poll yourself: await buyer.getContractStatus(a2a.contractId)

// 6) Present the buyer's ZKP RepID proof.
const proof = await buyer.presentProof(reg.agentId);
```

**Auth model (verified 2026-07-06):** `init`, `getRepID`/`verify`, `presentProof`, and `score`/
`verifyOutput` are public reads. `register` (POST) is public. But `listServices`/`getService`
(`GET /api/v1/services`) and `executeA2A` (`POST /api/v1/contracts`) are **auth-gated** — they `401`
without a `REPID_API_KEY`. The full paid buy additionally needs a funded Base Sepolia wallet for the
x402 escrow leg.

**`buildX402Payment` bundle note:** it lazy-imports `ethers`, so apps that never initiate a payment
don't pull the signing code into their module graph at import time.

---

**Next steps:**

- [`api-reference.md`](./api-reference.md) — full SDK method + public REST endpoint reference
- [`architecture-overview.md`](./architecture-overview.md) — how the three primitives fit together
- [`example-agent-spec.md`](./example-agent-spec.md) — a minimal end-to-end guarded executor
- [`examples/a2a-purchase/`](../examples/a2a-purchase/) — the full runnable A2A showcase buy
- [`glossary.md`](./glossary.md) — plain-language definitions

> Testnet (Base Sepolia, chain ID 84532) today. The mainnet roadmap is on the [HyperDAG Protocol README](https://github.com/DealAppSeo/hyperdag-protocol).
