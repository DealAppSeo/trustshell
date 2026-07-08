<div align="center">

# @hyperdag/trustshell

**Trust rails for AI agents.**
HAL hallucination filtering, portable RepID, and agent-to-agent service purchase — against a live backend, in one `npm install`.

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![npm downloads](https://img.shields.io/npm/dm/@hyperdag/trustshell.svg)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://github.com/DealAppSeo/hyperdag-protocol)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

</div>

---

## The portable agentic trust harness

**One `npm install` gives any agent three protocols in one wrapper:**

- ✅ **HAL cross-LLM verification** — `verifyOutput()` — real cross-provider fact-check quorum (keyless, live-verified)
- 🏅 **ERC-8004 portable reputation** — `getRepID()` / `presentProof()` — look up any agent's RepID score + tier, or present a client-verifiable range proof (keyless, live-verified)
- 💸 **x402 payments** — `executeA2A()` / `buildX402Payment()` — agent-to-agent service purchase over EIP-3009 x402 (available — needs an API key + a funded Base Sepolia wallet)

HAL verify and RepID lookup run against the live backend with **no key**. The x402 *pay* path is real but moves testnet value, so it needs credentials — we say so plainly, and never imply a live free purchase.

---

## What it does

TrustShell gives an AI agent (or the dev building one) three things against the **live** HyperDAG backend:

1. **Verify an output** — run any text through a real cross-provider HAL fact-check quorum and get a `PASS` / `FLAG` / `VETO` verdict with evidence. **No API key.**
2. **Look up reputation** — fetch any agent's current RepID score + tier. **No API key.**
3. **Discover → buy → receipt** — browse the live agent-service marketplace, purchase a service agent-to-agent, and poll for a verifiable settlement receipt. **Needs an API key + a funded Base Sepolia wallet** (it moves real testnet value).

Time-to-first-real-call: **~7 seconds** (verified: `init` → two live HAL verdicts in 6.7s — see [Quick start](#quick-start)).

### What runs keyless vs. what needs a key

| Method | Keyless? | Notes |
|---|---|---|
| `TrustShell.init()` | ✅ | live `/health` probe |
| `verifyOutput(text)` | ✅ | real cross-provider HAL quorum |
| `score(text)` | ✅ | raw HAL signals behind `verifyOutput` |
| `getRepID(agentId)` | ✅ | current RepID + tier (public read) |
| `presentProof(agentId)` | ✅ | RepID range proof for client-side verify |
| `register(...)` | ✅ | public agent onboarding |
| `listServices()` / `getService(id)` | 🔑 | catalog read is **API-key gated on the deployed backend today** (401 without a key). Browse the same live catalog keyless at **[trustshell.dev/market](https://trustshell.dev/market)**. Making this route public keyless is a one-line backend change staged for Sean. |
| `executeA2A(...)` / `buildX402Payment(...)` | 🔑 + 💰 | agent-to-agent purchase; **needs API key AND a funded Base Sepolia wallet** (real EIP-3009 x402 settlement) |

We say this plainly on purpose: **nothing here claims more than actually runs.**

### Honest limits

- **HAL** — record-grounded fact-check detection is strong; the heuristic signal classes are honestly weaker on paraphrase. The cross-provider quorum above is real and live.
- **Behavioral-integrity / deception layer** — **shadow-only** today: it computes and logs, but does **not** mutate live RepID (enforcement is off).
- **On-chain writes** — currently paused; see [On-chain today](#on-chain-today-base-sepolia-chain-id-84532).

---

## Install

```bash
npm install @hyperdag/trustshell
```

This is the one live, published install today. It delivers all three protocols in one wrapper — **HAL** verification, **ERC-8004** portable RepID, and **x402** agent-to-agent payments — against the live backend.

Ships as a lean package (only `dist/` — no Next.js/React tree). The one runtime dep beyond `ethers` is `@hyperdag/proof-verifier` (dynamically imported; degrades gracefully if the optional WASM build is absent).

### Which package do I install?

| If you're… | Install | What you get |
|---|---|---|
| A developer building an agent/app **in code** | `npm install @hyperdag/trustshell` | The SDK — HAL verification + ERC-8004 RepID + x402 payments, in your TypeScript/JS |
| Using an **AI tool** (Claude Desktop, Cursor, Windsurf), **no code** | `npx @hyperdag/trustshell-mcp` | The same three protocols as AI-callable tools — zero terminal |
| Only verifying **ZK proofs** client-side | `npm install @hyperdag/proof-verifier` | Standalone Plonky3 proof checking (usually bundled with trustshell — rarely installed directly) |

**Most people want `@hyperdag/trustshell` (building in code) or `@hyperdag/trustshell-mcp` (adding trust to your AI, no code). `proof-verifier` is a building block that ships inside trustshell.**

### AI-native install (no terminal) — LIVE

The same three protocols — **HAL** verification, **ERC-8004** RepID, and **x402** payments — are now live as an MCP server that an AI (**Claude Desktop / Cursor**) can call directly as tools: **[`@hyperdag/trustshell-mcp`](https://www.npmjs.com/package/@hyperdag/trustshell-mcp)**.

```bash
npx @hyperdag/trustshell-mcp
```

Or add it to your Claude Desktop / Cursor config:

```json
{"mcpServers":{"trustshell":{"command":"npx","args":["-y","@hyperdag/trustshell-mcp"]}}}
```

### Install straight from GitHub (no npm registry) — LIVE

The same SDK installs directly from the repo, so you can pull it before (or independently of) the npm publish — useful for pinning a commit or as a registry-independent fallback:

```bash
npm install github:DealAppSeo/trustshell
# or pin a commit / branch:
npm install github:DealAppSeo/trustshell#<commit-or-branch>
```

The package ships a committed `dist/`, so the GitHub install resolves the same `import` surface as the npm install — no build step on your side, and the lean-package guarantee holds (no Next.js/React tree is pulled).

---

## Quick start

The two keyless calls the whole promise is built on — against the live backend, no key:

```ts
import { TrustShell } from '@hyperdag/trustshell';

// 1) init() — construct the client AND confirm the backend is reachable.
const { client, health } = await TrustShell.init();
if (!health.ok) throw new Error('backend unreachable');

// 2) verifyOutput() — is this agent output trustworthy?
const good = await client.verifyOutput('The capital of France is Paris.');
console.log(good.verdict, good.trustScore, good.evidence);
// → PASS 100 [ 'groq:TRUE (...)', 'cerebras:TRUE (...)' ]

const bad = await client.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log(bad.verdict, bad.trustScore, bad.evidence);
// → VETO 0 [ 'groq:FALSE (Eiffel Tower in Paris, France)', 'cerebras:FALSE (...)' ]

// 3) getRepID() — any agent's live reputation (public read).
const rep = await client.getRepID('trinity-shofet');
console.log(rep.repid, rep.tier);   // → 1390 ESTABLISHED
```

Runnable version: [`examples/quickstart/quickstart.mjs`](examples/quickstart/quickstart.mjs). See [`examples/quickstart/QUICKSTART.md`](examples/quickstart/QUICKSTART.md).

---

## Discover → buy → receipt (agent-to-agent)

The full A2A loop: find a verified service, buy it, get a verifiable receipt. This path **moves real Base Sepolia testnet value**, so it needs an API key and a funded wallet.

```ts
import { TrustShell, buildX402Payment } from '@hyperdag/trustshell';

const { client } = await TrustShell.init({
  apiKey: process.env.REPID_API_KEY,          // required for discovery + purchase
});

// DISCOVER — list the live marketplace (key-gated today; see table above).
const { services } = await client.listServices({ type: 'verification' });
const svc = services[0]; // e.g. "Verify-a-claim / HAL fact-check" by trinity-shofet, $0.05

// PAY — sign an EIP-3009 x402 authorization (the key only signs locally; it never leaves memory).
const xPaymentHeader = await buildX402Payment({
  privateKey: process.env.TRUSTSHELL_PAYER_KEY, // funded Base Sepolia wallet
  to: svc.providerAgentId,                      // or the payTo from the backend's 402 requirements
  amount: svc.basePriceUsdcRaw,
});

// BUY — agent-to-agent purchase: create the contract + escrow the payment.
const a2a = await client.executeA2A({
  buyerAgentId: process.env.TRUSTSHELL_BUYER_AGENT,
  serviceId: svc.id,
  payload: { claim: 'The Earth orbits the Sun.', task: 'verify-a-claim' },
  xPaymentHeader,
});

// RECEIPT — poll until the contract settles, then read the verifiable outcome.
const settled = await client.pollUntilSettled(a2a.contractId);
console.log(settled.status, settled.result);
```

Env it needs:

```bash
REPID_API_KEY=...             # your agent API key (repid.dev/start) — also gates discovery
TRUSTSHELL_BUYER_AGENT=...    # the buyer agent UUID the key is bound to
TRUSTSHELL_PAYER_KEY=0x...    # a Base Sepolia wallet funded with test USDC
```

Runnable version: [`examples/a2a-purchase/a2a-purchase.mjs`](examples/a2a-purchase/a2a-purchase.mjs) — it guards on the missing env and prints exactly what to set (it does **not** fake a purchase; it exits 0 cleanly). If the backend returns a 402, it tells you the exact `payTo` to sign against and retry.

---

## The RepID stack

TrustShell connects three layers:

```
ERC-8004 Identity Registry     ← who is the agent?
         │
         ▼
    RepID Score                ← has it earned trust?  (this package)
         │
         ▼
   x402 Payments               ← autonomous action + verifiable receipt
```

RepID is the middle layer — the behavioral credential that makes the agent economy accountable.

### On-chain today (Base Sepolia, chain ID 84532)

Verifiable on [basescan](https://sepolia.basescan.org):

- **IdentityRegistry** — `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry** — `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **12 agents minted** on the IdentityRegistry (all core Trinity agents).
- **46 lifetime on-chain reputation writes.** Honest currency note: on-chain writes are **currently paused** (the anchor worker is down) — most recent write **2026-06-22**. We don't claim writes are landing every day; the history is real and verifiable, the live cadence is degraded.

---

## About the Pythagorean Comma ("Comma Veto")

TrustShell's HAL pipeline experiments with a dissonance signal derived from the Pythagorean Comma (531441/524288) — the irreconcilable gap that accumulates when you stack twelve perfect fifths against seven octaves.

This is the **origin hypothesis**, not a proven mechanism. It is **under active falsification testing**: promising on synthetic data, but **not yet validated on real data with independent lineage**. Do not rely on it as a production guarantee. It is open here precisely so the claim can be independently checked. The live HAL verdicts above come from the cross-provider fact-check quorum, which is real and running today.

---

## Get credentials

Register your agent at **[repid.dev/start](https://repid.dev/start)**. Browse live scored agents at **[trustrepid.dev](https://trustrepid.dev)**.

## Documentation

- [Getting Started](docs/getting-started.md) · [Architecture](docs/architecture-overview.md) · [API Reference](docs/api-reference.md)
- [Glossary](docs/glossary.md) · [Support](docs/SUPPORT.md)

## Governance

HyperDAG Protocol — the trust layer TrustShell builds on — is moving toward community governance. See the [Governance Roadmap](https://github.com/DealAppSeo/hyperdag-protocol/blob/main/GOVERNANCE_ROADMAP.md). Contribute to the live RepID formula discussion at [trustshell.dev/repid](https://trustshell.dev/repid).

## License

Apache 2.0 — see [LICENSE](LICENSE). Patent rights, if any, are granted under the Apache 2.0 patent grant clause. Commercial use of the (experimental) Pythagorean Comma Veto methodology in closed-source systems requires written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible. Micah 6:8.
