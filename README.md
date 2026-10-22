# Your AI says the job is done. TrustShell checks the evidence.

TrustShell reads a **public GitHub Actions run** from GitHub and sets what your AI agent *said* beside what the run *reports*. Once installed, the only network call is to `api.github.com`: no account, no API key, no TrustShell server, and nothing of yours is uploaded. `GITHUB_TOKEN` is optional and only raises GitHub's rate limit. Public runs only, for now.

**Try Inspect:** [the five-minute challenge](https://trustshell.dev/inspect). One true claim and one false one about a pinned run, the evidence that decides each, and an invitation to break it.

## Check your own CI run

Open any public repository's **Actions** tab, open a run, and paste its URL below. Tested on Node 22. `--claims` and `--claims-file` are new in 1.8.0 (see Status below); 1.7.0 and older do not have them. `@latest` makes npx fetch the current release; without it, npx runs any older copy installed globally.

```bash
RUN=https://github.com/OWNER/REPO/actions/runs/1234567890
printf 'The workflow run succeeded, run %s.\n' "${RUN##*/}" > claims.txt
npx @hyperdag/trustshell@latest check "$RUN" --claims-file claims.txt
```

Windows PowerShell:

```powershell
$run = "https://github.com/OWNER/REPO/actions/runs/1234567890"
"The workflow run succeeded, run $($run.Split('/')[-1])." | Set-Content claims.txt
npx @hyperdag/trustshell@latest check $run --claims-file claims.txt
```

`claims.txt` is what your agent said. The line above writes one claim for you so the first run works; **replace it with your agent's own words** to test them. You get a card that marks each claim **SUPPORTED**, **CONTRADICTED** or **NOT_CHECKED**, and ends with what it does not prove. An excerpt, recorded 2026-10-21 on 1.8.0-rc.0 against a finished public run (`vitejs/vite`, run 39524643058), exit 0:

```
- **Run** `vitejs/vite` · run 39524643058 · attempt 1 · commit `daa260240c0863604b8ab565e3c35d81df6e85f2`
- **GitHub reports** status `completed` · conclusion `success` · check verdict **COMPLETE**
- **Evidence class** PLATFORM_REPORTED: GitHub describing its own run. A platform record, not an independent grade.

### Claims: 2 supported · 0 contradicted · 0 not checked
- **SUPPORTED** `The workflow run succeeded`
- **SUPPORTED** `run 39524643058`
```

Four things to know before you try your own words:
- **Write plain sentences, one per paragraph** (a blank line between them). One line the checker cannot read in full, such as Markdown, a question, or words it has no template for, blocks every verdict: the whole text comes back NOT_CHECKED, exit 3. That is deliberate; a PR description in Markdown is not read at all.
- **Cite the run id** (`run 123456789`) in any sentence about the outcome. A commit alone does not tie a sentence to one of its many runs, so that sentence is not compared.
- **SUPPORTED is narrow.** A green run supports "this workflow run succeeded", and nothing wider. "All tests pass" and "CI is green" are never SUPPORTED by one run.
- **Exit codes:** `0` every claim SUPPORTED on a finished, passing run; `1` a claim CONTRADICTED, or the run failed; `3` something was NOT_CHECKED. NOT_CHECKED never exits `0`.

If the card says **SUPPORTED** and it should not have, that is the worst bug this tool can have: [open an issue](https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml) with the run URL and your claim file. The rules are in [docs/action-evidence.md](docs/action-evidence.md); to help, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Building on ERC-8004, x402 or OpenClaw?

For teams already using ERC-8004 identities, x402 payments or OpenClaw hooks. This is a developer preview and we want you to test it with us. [trustshell.dev/build](https://trustshell.dev/build) shows, for each, what runs today with a command or a source you can check, and what is not built yet:

- **ERC-8004:** if you read ERC-8004 feedback, you can check one of ours on Base Sepolia today. Help us bind feedback to its receipt, payment, delivered work and an independent check; that is not built yet ([#589](https://github.com/DealAppSeo/trustshell/issues/589)).
- **x402:** if your agent pays with x402, run the page's script with a throwaway key and watch the default payment path refuse a payment with no policy, or over the cap it states, before anything is signed. The calling code supplies the policy and cap, so this stops a mistaken or unconfigured agent, not one that writes its own policy. Paying only for work that checked out is not available through TrustShell yet.
- **OpenClaw:** if you already use `before_tool_call` and `after_tool_call`, that is exactly where a policy check and a receipt would attach. An OpenClaw skill that runs the CLI exists ([`skills/trustshell`](skills/trustshell/SKILL.md)); a plugin that uses the hooks does not yet. Build it with us.

The finding we want most is a claim we wrongly supported. A permission we failed to enforce, or a record another machine cannot verify, comes next. [Tell us](https://github.com/DealAppSeo/trustshell/issues/new/choose) with the card from `npx @hyperdag/trustshell check <run-url> --claims-file claims.txt --out card`; a bug we accept and fix gets a regression test in the repo's own test suite.

## Also: check one sentence an AI told you

Paste something an AI told you and see if it checks out. This is a different command with a different promise: it sends the sentence (after scrubbing secrets on your device) to the hosted checkers, so it leaves your machine.

```powershell
npx @hyperdag/trustshell check "If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph."
```

```
veto
The classifier labelled this sentence veto — do not rely on it (755 ms).
Groq and Cerebras both said false.
```

That run exited 1 (1.6.0, 2026-10-07). The last line names who decided; your run may name other checkers.

![How a check works: your sentence is scrubbed on your device; an equation such as 2 + 2 = 5 is worked out with no model; anything else goes to two checkers from different model families; both TRUE is Checks out, both FALSE is Caught, anything else is Not checked.](public/how-a-check-works.svg)


<div align="center">

**@hyperdag/trustshell**

[![npm](https://img.shields.io/npm/v/@hyperdag/trustshell)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![npm downloads](https://img.shields.io/npm/dm/@hyperdag/trustshell.svg)](https://www.npmjs.com/package/@hyperdag/trustshell)
[![Standard: ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-blue)](https://github.com/DealAppSeo/hyperdag-protocol)
[![Protocol: HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-purple)](https://github.com/DealAppSeo/hyperdag-protocol)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

</div>

---

## Status

| | Today |
|---|---|
| npm `latest` | **1.8.0** (`npm view @hyperdag/trustshell version`). |
| HAL quorum | **3 answering / 5 configured** (MEASURED 2026-10-06, `GET /api/v1/hal/stats` → `quorum_health`, 24-hour window). Not a constant 6. |
| Chain | **Base Sepolia**, not mainnet. |
| Grounding | **shadow** — does not mutate live RepID. |

Not a launch announcement.

---

## Where this sits

**Calls:**

- **[DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine)**, the HyperDAG engine, at `https://repid-engine-production.up.railway.app` unless `TRUSTSHELL_API_URL` names another. That default is set in the `TrustShell` constructor (`src/lib/trustshell.ts`) and as `DEFAULT_API_URL` (`src/lib/claim.ts`). Every networked SDK method, CLI command and MCP tool goes there, except `check <runUrl>`, the MCP `inspect_run` tool (both api.github.com only) and `verifySigner()`.
- **`@hyperdag/proof-verifier`** `^0.2.0`, a runtime dependency that npm installs beside this package. `verifyProof()`, `presentProof(id, { verify: true })`, the `verify()` export, `proof --verify` and `badge` load it when called and run it on your machine.
- **The ERC-8004 ReputationRegistry on Base Sepolia**, read only: `getClients` through the public RPC `https://sepolia.base.org`, from `verifySigner()` alone (`src/lib/verify-signer.ts`, needs the optional `ethers`). The package writes nothing on chain and does not read the IdentityRegistry itself. For an agent whose record says `MINTED`, `getIdentity()` / `getRepID()` ask the engine for its own `ownerOf` read (`GET /api/v1/agents/:id/onchain`) and say "on-chain" only if that read found an owner for the token and the recorded registry is the canonical one; otherwise the answer is `NOT_CHECKED`. The canonical address sits in `src/lib/identity.ts` only to compare that record with.
- **`api.github.com`**, from `check <runUrl>` alone.

**Called by:**

- People, from a terminal: the `trustshell` CLI.
- MCP clients such as Claude Desktop and Cursor, through the `trustshell-mcp` server.
- trustshell.dev: its `/check` page imports `src/lib/claim.ts` from this tree.
- [DealAppSeo/example-agent](https://github.com/DealAppSeo/example-agent), which installs it from GitHub (`"@hyperdag/trustshell": "github:DealAppSeo/trustshell"`).

The Chrome extension in `extension/` does not import this package. It asks the same engine endpoint (`POST /api/v1/classify`) itself, and `tests/claim-path-parity.test.ts` keeps its wording equal to `src/lib/claim.ts`.

**The whole map:** https://github.com/DealAppSeo/hyperdag-protocol/blob/main/BUILDERS.md#how-the-pieces-fit

---

## The portable agentic trust harness

Most "LLM trust" tools are *judges* — they score an output and leave the decision to you. TrustShell is a **fail-closed gate**: it can **refuse**, it hands back a **ZK-verifiable receipt** you check yourself (not our word), and it carries a **portable, earned RepID** that travels with the agent as you swap the model underneath. An unavailable check is never a pass. That is the difference between *another LLM judge* and a *trust rail*.

**One `npm install` gives any agent three protocols in one wrapper:**

- ✅ **HAL cross-LLM verification** — `verifyOutput()` — real cross-provider fact-check quorum (keyless, live-verified)
- 🏅 **ERC-8004 portable reputation** — `getRepID()` / `presentProof()` — look up any agent's RepID score + tier, or present a client-verifiable range proof (keyless, live-verified)
- 💸 **x402 payments** — `executeA2A()` / `guardedX402Payment()` — agent-to-agent service purchase over EIP-3009 x402 (key-gated: blocked without an API key and a funded Base Sepolia wallet, which is why [Live vs paused](#live-vs-paused) lists it as `paused/blocked`)

HAL verify and RepID lookup run against the live backend with **no key**. The x402 *pay* path is real but moves testnet value, so it needs credentials — we say so plainly, and never imply a live free purchase.

---

## What it does

TrustShell gives an AI agent (or the dev building one) three things against the **live** HyperDAG backend:

1. **Verify an output** — run any text through a real cross-provider HAL fact-check quorum and get a `PASS` / `FLAG` / `VETO` / `NOT_CHECKED` verdict with evidence. `NOT_CHECKED` means HAL did not decide, and it is never a pass. **No API key.**
2. **Look up reputation** — fetch any agent's current RepID score + tier. **No API key.**
3. **Discover → buy → receipt** — browse the live agent-service marketplace, purchase a service agent-to-agent, and poll for a verifiable settlement receipt. **Needs an API key + a funded Base Sepolia wallet** (it moves real testnet value).

### What runs keyless vs. what needs a key

| Method | Keyless? | Notes |
|---|---|---|
| `TrustShell.init()` | ✅ | live `/health` probe |
| `verifyOutput(text)` / `evaluate(text)` | ✅ | real cross-provider HAL quorum (`evaluate` is an alias) |
| `score(text)` | ✅ | raw HAL signals behind `verifyOutput` |
| `getRepID(agentId)` | ✅ | current RepID + tier (public read) |
| `presentProof(agentId)` | ✅ | RepID range proof for client-side verify |
| `register(...)` | ✅ | public agent onboarding — creates the agent and its RepID. **It does not mint an ERC-8004 identity**; see below |
| ERC-8004 identity mint | 🔑 | `POST /api/v1/agents/:id/mint` — key-gated. A keyless `register()` leaves the agent with **no on-chain identity**, and the passport reports `NOT_MINTED` rather than implying one exists |
| `listServices()` / `getService(id)` | ✅ | catalog read, **verified keyless against the deployed backend** (200, no key). Writes to the same paths — create, reprice, delete a listing — stay key-gated. Browse the same catalog in a browser at **[trustshell.dev/market](https://trustshell.dev/market)**. |
| `executeA2A(...)` / `guardedX402Payment(...)` | 🔑 + 💰 | agent-to-agent purchase; **needs API key AND a funded Base Sepolia wallet** (real EIP-3009 x402 settlement) |

We say this plainly on purpose: **nothing here claims more than actually runs.**

### Honesty

v1 is hosted HAL. The check runs on the HyperDAG engine.

v2 is on-device proof generation. It is not shipped.

There is no mesh in v1. Staking is not live.

### Live vs paused

Three states: **live** | **live-degraded** | **paused/blocked**.

| Surface | State | Today |
|---|---|---|
| This package | live | v1 hosted thin client. Trust computation runs on the HyperDAG engine, not on your machine. On-device proofs are v2, not shipped. `npm view @hyperdag/trustshell version` says which version npm serves. |
| `getRepID()` / `presentProof()` | live | Keyless. Score moves; gate on tier or your own threshold. |
| `register()` | live | Keyless. Creates an agent and a RepID. It does not mint ERC-8004. |
| `verifyOutput()` / `evaluate()` / `trustshell verify` | live-degraded | Keyless. Quorum is measured (`providersUsed`), not a configured 6. MEASURED 2026-10-06: 3 answering / 5 configured (24-hour window). HAL is weaker on paraphrases than on record-grounded facts. |
| ERC-8004 identity mint | paused/blocked | Key-gated, separate call. A keyless `register()` leaves `NOT_MINTED`. |
| On-chain reputation writes | live-degraded | Recorded, each with a transaction hash. On 2026-10-05 the public counter reported 114 rows with a real transaction hash on the reputation registry. That is not a receipt check of every row. |
| x402 `executeA2A()` | paused/blocked | Blocked by credentials, not paused. The call ships, and the engine's contract route answers 401 without a key (MEASURED 2026-10-07). Needs an API key and a funded testnet wallet. Fulfillment is asynchronous, so a contract can sit in `escrowed`. Protocol exists on Base Sepolia (chain id 84532). Not mainnet. |

### Honest limits

- **v1 is a thin client, by design.** This wrapper makes keyless calls to the **hosted** HyperDAG engine for HAL, RepID, and gating — it does **not** run the trust computation on your machine. So it depends on the backend being reachable, and the backend sees each request. **On-device proof generation, where only attestations leave your machine (the real "portable mesh"), is v2 — not shipped.** We name this so v1 is never mistaken for the mesh.
- **ERC-8004 identity is a keyed step, and `register()` is not it.** Registration is keyless and gives you an agent with a live RepID — reputation, proofs and the badge all work from there. The on-chain identity token is minted by a separate, key-gated call. So a keyless onboarding ends with **no token on chain**, and we report that as `NOT_MINTED` rather than showing an identity that is not there. Ask for a key if you need the on-chain identity. (Measured 2026-08-30: the registration path never reaches the minter — this is the documented design, not an outage.)
- **HAL** — record-grounded fact-check detection is strong; the heuristic signal classes are honestly weaker on paraphrase. The cross-provider quorum above is real and live.
- **Behavioral-integrity / deception layer** — **shadow-only** today: it computes and logs, but does **not** mutate live RepID (enforcement is off).
- **On-chain writes** — recorded, each with a transaction hash. See [On-chain today](#on-chain-today-base-sepolia-chain-id-84532).

---

## Install

```bash
npm install @hyperdag/trustshell
```

This is the one live, published install today. It delivers all three protocols in one wrapper — **HAL** verification, **ERC-8004** portable RepID, and **x402** agent-to-agent payments — against the live backend.

The package does not carry the Next.js/React site. The 1.8.0 tarball is 123 files: `dist/`, the command shims in `bin/`, `scripts/init-pai.mjs`, `scripts/value-events.mjs`, `lib/interview.js`, and the README, changelog and license. Runtime dependencies are `@hyperdag/proof-verifier` (dynamically imported; degrades gracefully if the optional WASM build is absent), `@modelcontextprotocol/sdk` and `zod` (for the `trustshell-mcp` server). `ethers` is an **optional** peer dependency: install it (`npm i ethers@^6`) only if you sign x402 payments or call `verifySigner`. (`npm view @hyperdag/trustshell@1.8.0 dependencies peerDependencies dist.fileCount`)

### Which package do I install?

| If you're… | Install | What you get |
|---|---|---|
| A developer building an agent/app **in code** | `npm install @hyperdag/trustshell` | The SDK — HAL verification + ERC-8004 RepID + x402 payments, in your TypeScript/JS |
| Using an **AI tool** (Claude Desktop, Cursor, Claude Code), **no code** | `npm i -g @hyperdag/trustshell@1.8.0`, then point the tool at the `trustshell-mcp` bin (below) | The checks as AI-callable tools |
| Only verifying **ZK proofs** client-side | `npm install @hyperdag/proof-verifier` | Standalone Plonky3 proof checking. It is a dependency of `@hyperdag/trustshell`, so installing that installs this too — rarely installed directly |

**Most people want `@hyperdag/trustshell`. The SDK, the CLI and the MCP server are all in that one package. `proof-verifier` is a separate package it depends on: npm installs it alongside, and the published tarball contains none of its files.**

### MCP server for AI tools

The MCP server is the `trustshell-mcp` bin inside `@hyperdag/trustshell`. A global install puts it on PATH:

```bash
npm i -g @hyperdag/trustshell@1.8.0
```

Then add it to your Claude Desktop / Cursor / Claude Code config:

```json
{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }
```

In 1.8.0 its tools are `check_claim`, `verify_output`, `get_repid`, `getLeaderboard`, `present_proof`, `verify_proof`, `status`, `my_job` (the agent's role and allowed tools, read from its live grants), `kernel_receipt` (a policy-kernel receipt read back, hash checked locally, with its six claims; needs a REPID_API_KEY), `ground_quote` (`trustshell ground` for agents, with the source as text; local, no network), the quarantine tools `quarantine_list` and `quarantine_explain` (there is no release tool over MCP), the learning-loop tools `learn_lessons_for` and `learn_record` (local, no network; see "Learning loop v1" below), and the local `remember` / `recall` (plus deprecated aliases `verify`, `evaluate`, `repid` and `getRepID`). `learn_lessons_for` and `learn_record` are new in 1.8.0. `kernel_receipt`, `ground_quote`, `quarantine_list` and `quarantine_explain` came in 1.7.0; 1.6.1 had the rest, and 1.6.0 also lacked `my_job`. 1.6.0 and 1.6.1 also had a local redact tool; 1.7.0 removes it, because it let any connected agent delete the operator's keyed rows. Deleting stays at the CLI. Since 1.7.0, a note written through the MCP `remember` tool is untrusted and quarantined (see "Quarantine (immune system v0)" below). This tree also registers `inspect_run`, Inspect for agents: a run URL and the claims as text in, the same record, digest and card `trustshell check <runUrl> --claims "<text>"` produces out, deterministic and from api.github.com only. It is a different check from `check_claim`, which labels one sentence with a hosted, model-based check. 1.8.0 does not include it. It has no purchase tool; buying is the SDK's `executeA2A`. Since 1.7.0, every tool that reads the network answers `{untrusted_data, screening}`: data from outside your machine, never instructions. A string in it that reads as instructions is withheld and its place listed in `screening.withheld`.

The separate npm package `@hyperdag/trustshell-mcp` is older (1.0.0, published 2026-07-08). It has no `check_claim`. Use the bin above.

### Install straight from GitHub (no npm registry) — LIVE

The SDK also installs directly from the repo. That gives you `main`, which can run ahead of the published 1.8.0 — useful for pinning a commit or as a registry-independent fallback:

```bash
npm install github:DealAppSeo/trustshell
# or pin a commit / branch:
npm install github:DealAppSeo/trustshell#<commit-or-branch>
```

The package ships a committed `dist/`, so there is no build step on your side, and the lean-package guarantee holds (no Next.js/React tree is pulled). That `dist/` is built from `main`, which can run ahead of the published release. For exactly what npm serves, install `@hyperdag/trustshell@1.8.0`.

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
// Recorded 2026-10-05:
// → PASS 100 [
//   'cerebras:TRUE (Paris is the capital of France.)',
//   'groq:TRUE (Paris is the capital of France.)',
//   'zai:UNCERTAIN (NOT_CHECKED: late after 2-family agreement)',
// ]

const bad = await client.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log(bad.verdict, bad.trustScore, bad.evidence);
// Recorded 2026-10-05:
// → VETO 0 [
//   'cerebras:FALSE (It is in Paris, France.)',
//   'groq:FALSE (Eiffel Tower is in Paris, France.)',
//   'zai:UNCERTAIN (NOT_CHECKED: late after 2-family agreement)',
// ]

// 3) getRepID() — any agent's live reputation (public read).
const rep = await client.getRepID('trinity-shofet');
console.log(rep.repid, rep.tier);   // the score moves; gate on tier
```

**Two things in that output move, and the comments above are illustrative rather than
promised.** *Which providers* answer is chosen by the live quorum — your run may name
different providers from the three shown, and the count varies with availability;
what is fixed is that the verdict is backed by named cross-provider evidence, each with
a reason. And `repid` is a **live score that changes** — gate on `tier`, or on your own
threshold against `repid`, never on a specific number copied from a README.

Runnable version: [`examples/quickstart/quickstart.mjs`](examples/quickstart/quickstart.mjs). See [`examples/quickstart/QUICKSTART.md`](examples/quickstart/QUICKSTART.md).

---

### Payments

`guardedX402Payment` is the spend entry: origin must be pay-capable (`Unknown` cannot pay), a policy must allow the spend, the intent is audited, then `buildX402Payment` signs an EIP-3009 header for x402 on Base Sepolia.
Pass `cap` in the same raw units as `amount` — the **BUYER limit**, not the listing price.
If `cap` is missing, it refuses to sign (`cap required`) unless you pass TrustKeys `readAllowance` with `agentId` (that function is process-local in TrustKeys; inject it — this package does not import that store). An unset agent throws `no_allowance_set` rather than inventing a cap. If both `cap` and `readAllowance` are present, the tighter ceiling wins.
If `amount` exceeds the effective cap, it throws `cap_exceeded`.
The signed bearer header is redeemable on the token; `cap` is a local check and is **not** in the signed message.
The private key signs locally and never leaves the process.
`executeA2A` still needs an API key and a funded testnet wallet. Not mainnet.

## Discover → buy → receipt (agent-to-agent)

The full A2A loop: find a verified service, buy it, get a verifiable receipt. Discovery is keyless; the **purchase** half **moves real Base Sepolia testnet value**, so that half needs an API key and a funded wallet.

```ts
import { TrustShell, guardedX402Payment } from '@hyperdag/trustshell';

const { client } = await TrustShell.init({
  apiKey: process.env.REPID_API_KEY,          // required for the purchase, not for the discovery
});

// DISCOVER — list the live marketplace. Keyless: you can browse before you commit a key.
const { services } = await client.listServices({ type: 'verification' });
const svc = services[0]; // e.g. "Verify-a-claim / HAL fact-check" by trinity-shofet, $0.05
if (!svc) throw new Error('no verification service is listed right now');

// PAY TO — `to` takes the provider's WALLET ADDRESS (0x…). svc.providerAgentId is a UUID, and the
// signer throws "invalid address" on it. The address is the payTo in the backend's 402 requirements:
// an executeA2A call with no xPaymentHeader returns them in paymentRequired.accepts.
const payTo = process.env.TRUSTSHELL_PAY_TO;
if (!payTo) throw new Error('set TRUSTSHELL_PAY_TO to the provider payTo address (0x…)');

// PAY — origin + policy + audit, then sign (the key only signs locally; it never leaves memory).
const xPaymentHeader = await guardedX402Payment({
  origin: 'Cli',                                // Unknown / missing origin cannot pay
  privateKey: process.env.TRUSTSHELL_PAYER_KEY, // funded Base Sepolia wallet
  to: payTo,                                    // a wallet address, never an agent id
  amount: svc.basePriceUsdcRaw,
  cap: 1_000_000n, // BUYER limit (raw USDC units), not the listing price
  agentId: process.env.TRUSTSHELL_BUYER_AGENT,
  policy: { allow: true },                      // missing policy refuses — never a default-allow
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
REPID_API_KEY=...             # your agent API key (repid.dev/start) — for the buy; discovery is keyless
TRUSTSHELL_BUYER_AGENT=...    # the buyer agent UUID the key is bound to
TRUSTSHELL_PAYER_KEY=0x...    # a Base Sepolia wallet funded with test USDC
TRUSTSHELL_PAY_TO=0x...       # the provider's payTo wallet address, from the backend's 402 requirements
```

Runnable version: [`examples/a2a-purchase/a2a-purchase.mjs`](examples/a2a-purchase/a2a-purchase.mjs) — it guards on the missing env and prints exactly what to set (it does **not** fake a purchase; it exits 0 cleanly). If the backend returns a 402, it tells you the exact `payTo` to sign against and retry.

---

## CLI — trust checks in your terminal + CI

The same trust harness ships as a command, so it works with **no code** and slots into any
CI / pre-commit pipeline. Installing the package puts a `trustshell` (and `hal`) bin on your PATH:

```bash
npm install -g @hyperdag/trustshell     # or: npx @hyperdag/trustshell verify "…"

trustshell verify "The capital of France is Paris."
# Recorded 2026-10-07 on 1.6.0, exit 0:
# ✓ PASS  trust 100/100
#   PASS — hal_score 0 via fact-check (full quorum)
#   evidence:
#     - groq:TRUE (Paris is the capital of France.)
#     - cerebras:TRUE (Paris is the capital of France.)
#     - zai:UNCERTAIN (NOT_CHECKED: late after 2-family agreement)
# first-pass NOT_CHECKED
# receipt-id NOT_CHECKED
# receipt columns-missing
# NOT_CHECKED
# (The last four lines report the engine's honesty and receipt records, not the verdict.)

trustshell repid trinity-shofet          # the score moves; gate on tier
trustshell proof trinity-shofet --verify # fetch + client-side-verify a ZK RepID proof
# badge is a subcommand of trustshell, not its own program:
trustshell badge trinity-shofet
trustshell badge trinity-shofet --markdown
```

**`badge` is a portable, self-contained proof.** It fetches an agent's ZK RepID range proof,
**verifies it client-side**, and emits an embeddable SVG — `RepID ≥ threshold ✓ ZK-verified`.
Two honesty guarantees, both test-enforced: it shows the green *verified* state **only** when
local verification actually returned true (an absent, failed, or unavailable verifier renders
grey/red with the reason, and the command exits non-zero — never a false green), and it **never
renders the score** on the badge itself — only the threshold. Note the honest limit: the
score is a **public input to the range-check circuit**, so it travels in the proof statement
beside every proof. The badge does not display it; the proof does not hide it. Making it
genuinely private is a new circuit and a new verifier major, not a wording change.
The SVG has no external references, so it renders offline and cannot phone home. A live example
(a real proof for `trinity-shofet`, verified with the WASM verifier) is checked in at
[`examples/proof-badge-trinity-shofet.svg`](examples/proof-badge-trinity-shofet.svg).

> **Which commands are in which published release.** `verify` / `repid` / `proof` are in every
> published release. **`badge` ships in ≥ 1.3.0.** **`check` / `init` / `inspect` / `report` ship
> in ≥ 1.4.0** — on an older published build they exit `2` with *unknown command*, which is a
> version gap, not a broken install. If you hit that: upgrade, or install from GitHub
> (`npm i github:DealAppSeo/trustshell`). That installs the `dist/` committed on main, not a build
> of the source, so it can trail the source.
>
> **This note exists because the gap was measured, not imagined** [2026-09-23]: running `init`
> against the then-latest published build exited `2`, while the same command worked from source.
> A repo that documents a command its published package does not expose sends every reader who
> follows the README straight into *unknown command* — the same defect this project already
> recorded once, when a correct `bin/check.js` never entered the npm tarball because `files` did
> not list it.
> **Check a command against the artifact a stranger installs, not the checkout you developed in.**

From the SDK:

```ts
import { TrustShell, renderProofBadge } from '@hyperdag/trustshell';
const shell = new TrustShell();
const proof = await shell.presentProof('trinity-shofet', { verify: true });
const svg = renderProofBadge(proof, { href: 'https://www.trustshell.dev/passport/trinity-shofet' });
```

Use the named import. A default import (`import TrustShell from …`) does not give the class in
native ESM — see [`docs/KNOWN-LIMITS.md`](docs/KNOWN-LIMITS.md). The snippet above ran against
1.6.0 in a `.mjs` file on 2026-10-06.

**`verify` is a CI gate.** It exits **0** on `PASS`/`FLAG`, **1** on `VETO`, and **2** when HAL
did not decide (`NOT_CHECKED`), so a gate written as `|| exit 1` fails on a veto and on a miss —
no glue code:

```bash
# .github/workflows/*.yml  (or a pre-commit hook)
# Fail the build unless HAL passes every claim in the release notes.
trustshell verify "$(cat CHANGELOG_CLAIM.txt)" || {
  echo "HAL did not pass a claim — not shipping."; exit 1;
}
```

| Exit code | Meaning |
|---|---|
| `0` | HAL `PASS` (or soft `FLAG`) — safe to proceed |
| `1` | HAL `VETO` — the claim did not pass; fail the build |
| `2` | HAL did not decide (`NOT_CHECKED`) — never a pass. Also usage / bad arguments |
| `3` | runtime error (network / backend / timeout) |
| `4` | `ASK` — only when `TRUSTSHELL_LAYA` is set: a person has to answer. HAL was not called |

### `check` — ask GitHub what it can confirm, with no account

The check subcommand reads a public GitHub Actions run URL from the **public** GitHub API
and prints what GitHub can confirm about it — that the run finished, that its conclusion was
success, that **every job** passed, and that the commit exists on the remote.

A run that is still queued or in progress is `INCONCLUSIVE`, never `FAILED` — an unfinished build
has not failed, it has not answered. Likewise, if GitHub reports more jobs than it returned, the
card says so rather than claiming a pass over jobs it never read.

It needs no account, no key and no TrustShell backend, so a sceptic can point it at *someone
else's* repository and owe nobody anything. `GITHUB_TOKEN` is optional and only raises the rate
limit; if one is set but rejected, the command retries anonymously rather than failing.

Every card ends with **what this does not prove** — that a green run is not a judgement about
whether the code is correct, that it cannot see work on a branch nobody pushed, that passing
tests prove only that *the tests that exist* passed, and that it does not establish authorship.

The verdict is four-valued on purpose, and `INCONCLUSIVE` is not a pass:

| Verdict | Meaning | Exit |
|---|---|---|
| `COMPLETE` | the run succeeded and every job passed | `0` |
| `INCONSISTENT` | GitHub calls the run a success, but a job did not pass | `1` |
| `FAILED` | the run's own conclusion was not success | `1` |
| `INCONCLUSIVE` | the run has not finished, or the jobs could not be fully read — **NOT CHECKED**, not "fine" | `3` |

*(No example output is printed in this section on purpose: a card in a README is a claim about a run
that may not exist. The one at the top is a recorded run that still exists; run yours against a real
run and read your own.)* To compare what an agent said with the run, add `--claims-file`: see
[Check your own CI run](#check-your-own-ci-run).

### `check "<sentence>"` — the same label the Chrome extension shows

When the operand is **not a URL**, `check` labels one sentence `pass`, `veto` or `not-checked` by
asking the same public endpoint the TrustShell Chrome extension asks
(`POST <backend>/api/v1/classify`, backend = `TRUSTSHELL_API_URL` or the live HyperDAG backend).
The MCP server's `check_claim` tool calls the same function, so a terminal, an agent and the
extension get the same label for the same sentence. Any operand with a URL scheme (or a bare
`github.com/...`) still goes to the GitHub run check above, unchanged.

It prints the label on its own line, then one line of explanation. When the endpoint says what
produced the label, the next line names it: who decided (for example `Groq and Cerebras both said
false.`), `Decided by exact calculation. No model was asked.`, `Decided by approximate
calculation, not exact. No model was asked.` (an equation the engine could only compare as decimals,
such as a fractional power), `No checker was asked.` or `No answer in time.` An answer naming a path
this version does not know is `not-checked`, never a pass. If the endpoint asked a clarifying question, it follows on its own line, and
a last line says so when text that looked like a key or personal data was removed before sending.

`--json` prints the result object: `label` and `latency_ms`, plus `by`, `voters` and
`question` when the endpoint sent them, `reason` when the label was decided locally, and
`scrubbed: true` when something was removed. 1.6.0 drops the endpoint's `deciders` and `votes`;
1.6.1 keeps both.

The endpoint itself answers `{label, latency_ms, by}`, plus `voters`, `deciders` and `votes` (each
decider's model family and verdict) when `by` is `votes`, and `question` only on a not-checked from
the votes when the server has questions turned on (`CLASSIFY_QUESTIONS=on`; off by default). By default each visitor gets 100 checks per UTC day
(`CLASSIFY_DAILY_LIMIT`); past that the endpoint answers 429, which the CLI reports as `not-checked`.

| Label | Exit |
|---|---|
| `pass` | `0` |
| `veto` | `1` |
| `not-checked` | `2` — **never** a pass |
| error (nothing was sent: empty sentence, invalid `TRUSTSHELL_API_URL`) | `3` |

A timeout (6 s), a network failure, a non-200 or a body outside the contract is `not-checked`.
Known secret shapes are stripped from the sentence before it is sent.

### Ground a claim in its source (local, no network) — since 1.7.0

> **Since 1.7.0.** On 1.6.1 and older the command below exits `2` with `unknown option: --source`,
> and `groundQuote` / `groundClaims` are not exported.

`ground` checks a quoted claim against the document it cites, with no model and no network: is the
quote really on the cited page, and is the claimed value really in that quote? Pages are split on
form feed, the `pdftotext` convention; a file without one is page 1.

```bash
pdftotext manifest.pdf manifest.txt
trustshell ground --source manifest.txt --quote "ordered 150 ft" --page 1 --kind number --value 150 --unit ft
```

| Status | Reasons | Exit |
|---|---|---|
| `VERIFIED` | `exact_match`: the quote is on the cited page, and the value is in it | `0` |
| `VETO` | `quote_not_found`, `page_mismatch`, `quote_too_short`, `value_not_in_quote` | `1` |
| `NOT_CHECKED` | `no_evidence`, `ambiguous_value`, `template_echo` — **never** a pass | `2` |

Matching ignores case, spacing, quote and dash styles, ligatures, zero-width and bidi characters
and a word hyphenated across a line break, and it never matches half a word or half a number:
`1,250` is not found in `1,250.50`, nor `250` in `-250`. With `--kind number` the quote must hold
one number, or with `--unit` exactly one number written right before that unit: "loaded 50 ft,
ordered 150 ft" is `ambiguous_value` either way, and so is a number with other letters glued to it
(`1.5k`). With `--kind date` the value is `YYYY-MM-DD` and the quote must hold one date that reads
only one way: `03/04/2026` is ambiguous, `25/04/2026` is not, and a two-digit year never verifies.

Pass `--echo "<text>"` (repeatable) on the CLI, or `opts.echoes` in code: the template, form or
label text the document prints for every reader. A quote that only repeats it is `NOT_CHECKED`
`template_echo`. In code, `groundQuote(claim, pages, opts?)` returns that check and
`groundClaims(claims, pages, opts?)` returns one receipt per claim. Every
receipt carries `LIMITATIONS`, `observed: null` (nothing in this package sets it) and
`anchor_status: 'none'`. VERIFIED says the text is on the page. It does not say the quote supports
the claim.

### Quarantine (immune system v0) — since 1.7.0

> **Since 1.7.0.** On 1.6.1 and older, `quarantine`
> is an unknown command, `--trusted`, `--untrusted` and `--source-file` are unknown options, and
> `remember "<text>"` stores an ordinary note that `recall` prints.

Text an agent picks up from outside should not become something it acts on just because it was
written down. In this package's **local memory**, every note now carries a **taint label**, and
untrusted notes are held apart until a check passes.

**Behaviour change:** `trustshell remember "<text>"` now stores the note **untrusted and
quarantined**. A shell command can be run by an agent piping a web page as easily as by a person
typing, and nothing here can tell which. Say `--trusted` when you wrote it yourself.

```bash
trustshell remember --trusted "ship the receipt"             # yours: trusted, recall prints it
trustshell remember --source https://example.test/manifest --source-file manifest.txt "holds 150 ft of cable"
# quarantined 2 (untrusted: not yet checked)
trustshell recall                                            # leaves it out, and says so
# ship the receipt
# do_not_send COUNT 0
# quarantined COUNT 1 (trustshell quarantine list)
trustshell quarantine list                                   # id, source, reason: never the text
trustshell quarantine explain 2                              # the record and the text
trustshell quarantine release 2 --source manifest.txt --page 1   # local: ground it in the recorded document
trustshell quarantine release 2 --check hal                      # network: two checkers on the default endpoint
trustshell quarantine release 2 --trusted                        # your word, recorded as such
```

**What it does:**
- **Taint labels.** Every note records `provenance`: `trusted`, `untrusted`, `grounded` or `verified`, plus a `source`.
  - Only `trustshell remember --trusted` stores a `trusted` note.
  - `trustshell remember "<text>"` (with or without `--untrusted`), and the MCP `remember` tool, store it `untrusted`.
  - Notes saved before this existed are `untrusted`, source `legacy`, and quarantined the first time the file is opened. Nothing recorded who wrote them, so the file does not guess "trusted".
- **Quarantine.** An untrusted note is stored quarantined.
  - `recall` leaves it out and adds a `quarantined COUNT N` line, so nothing is hidden silently.
  - `recall --include-quarantined` (MCP: `include_quarantined: true`) prints it, marked `[QUARANTINED: reason]`.
  - `quarantine list` (and MCP `quarantine_list`, and `--json`) gives the id, source and reason, never the text. `quarantine explain <id>` gives one note's text.
- **Release**, recorded in `released_by`:
  - **ground**: `--source <file>` must be the document recorded when the note was stored (`remember --source-file <file>`, or MCP `remember` with `source_text`). Only its sha256 is kept, and the file you give must match it. Then the whole note must be found, `VERIFIED`, in it (optional `--page`). Local, no network. With no recorded document, or a different one, the result is `NOT_CHECKED`: a caller cannot ground a note against text it picks at release time, such as the note itself. Whoever stored the note also supplied that document, so a ground release is **not** a check they could not pass alone: the note becomes `grounded` (never `verified`), and `released_by` says the note was found in the source document the recorder supplied.
  - **hal**: `--check hal` sends the note to `POST /api/v1/classify` on the **default** endpoint. It releases only on `pass` decided by votes, where two named deciders from two different model families both said `TRUE`; the note becomes `verified`. A custom `TRUSTSHELL_API_URL` releases nothing and is not asked. A `pass` by arithmetic, or one without both votes, is `NOT_CHECKED`. The note is scrubbed first, like `check`. If the scrubber changed it, it is **not** released, because the label would be about other text. This is the only network path, and only when you ask for it.
  - **operator**: `--trusted` is your word, not a check. The note becomes `trusted`, and `released_by` says the operator vouched.
  - Any other result keeps the note held and records why.
- **Exit codes for `release`:** `0` released, `1` held (the check failed), `2` not checked or no such note.
- **Injection-looking text stays held.** It is screened by the package's fixed instruction-smuggling patterns, when stored and again when read (so legacy notes are screened too). That includes `remember --trusted`: the flag vouches for who wrote the note, not for what it says. A match is quarantined with that reason, and **nothing releases it**, not even `--trusted`. `recall` (with or without `--include-quarantined`), `list` and `explain` describe it and never print it.
- **MCP tools:** `quarantine_list` and `quarantine_explain`. There is **no release tool over MCP**: an MCP caller is the untrusted writer, and it must not be able to release its own note.
- **SDK exports:** `rememberUntrusted`, `listQuarantined`, `explainQuarantine`, `releaseByGround`, `releaseByHal`, `sourceDigest`. The release functions are operator surfaces. Do not hand them to an agent as tools. `releaseByHal(id, { timeoutMs })` takes no transport and no endpoint, so a caller cannot supply the answer it is checked against.

**What it does NOT do:**
- **No sandboxed execution.** It holds *text* apart. It runs nothing in isolation.
- **No adaptive learning.** The injection screen is a fixed set of patterns, not a model, and a novel phrasing can get past it. Such text still lands in quarantine as untrusted. It just is not flagged as injection, so a passing check could release it.
- **Only this package's local memory.** An agent's own context window, and tool results it never stores here, are not quarantined.
- **`--trusted` is the operator's word, and anything that can run your shell can say it.** The boundary this enforces is MCP versus your CLI, and untrusted-by-default for everything else.
- **Not a boundary against code in your own process.** Anything that can import the SDK can also write the memory file.
- **A release is not a truth verdict.**
  - A `ground` release (`grounded`) says the note's text is in the document recorded with it. It does not say the document is true, or that whoever recorded it told the truth about where it came from.
  - A `hal` release says two checkers agreed, not that the note is safe to act on.
- **Keyed values (`remember KEY VALUE`) carry no taint label** in v0.

### Learning loop v1 — since 1.8.0

> **Since 1.8.0.** On 1.7.0 and older, `learn` is an unknown command.

A local loop where your corrections become lessons the agent sees, and rulers say whether anything
improved. It does nothing until you create a job, and nothing leaves the machine.

```bash
trustshell learn job add ship --mode delegate "When I ship a change, I want the tests green, so I can merge."
trustshell learn check add --job ship --id ship-tests --cmd "npm test"
trustshell learn correct --job ship --check ship-tests "Run the linter before you say done."
# eval case 1, then lesson 1 (candidate)
trustshell learn accept 1
trustshell learn inject --job ship        # what examples/learn-hook/user-prompt-submit.mjs prints each turn
trustshell learn check run ship-tests     # the only writer of a check outcome: the command's exit code
trustshell learn report
```

- **Only your words reach the model.** A correction is stored verbatim, untrusted and quarantined, until you `accept` it. Declined, held, expired (30 days) and other jobs' lessons never print. At most 5 lessons and 400 tokens per turn, counted as `loop_tokens`.
- **The agent does not grade itself.** `learn record` and the MCP `learn_record` store the agent's outcome where no ruler reads it. Only `learn check run`, the command you registered, writes the outcome the rulers use. A failed check on a turn that carried a lesson retires that lesson, if it is scoped to that check or to no check. A lesson scoped to a check is only shown on turns judged by that check. Only you bring a retired lesson back: `learn reaccept <id>` shows why it was retired and needs you at a terminal to type the id back.
- **Hooks.** `examples/learn-hook/user-prompt-submit.mjs` runs `inject` on every prompt (set `TRUSTSHELL_LEARN_JOB`, `TRUSTSHELL_LEARN_CHECK` for the check the turn is judged by, and `TRUSTSHELL_LEARN_MODEL` / `TRUSTSHELL_LEARN_FAMILY` so the episode carries its model). `examples/learn-hook/stop.mjs` fills in the turn's model, family and tokens from the transcript at the end of the turn.
- **Credit is not taint.** `learn correct --credit <reviewer>` records who prompted your correction. `--derived-from-untrusted <label>` says the text is not yours, and that lesson is never injected.
- **Your memory file is backed up first.** The first `learn` command on an older memory file copies it to `memory.sqlite.bak-<UTC time>` before it widens the table once.
- **The mode you choose changes what is shown.** In `learn` mode no lesson is shown until you record your own attempt, and the recall question is a blank cut from it. `learn probe` and `learn review` measure you unaided.
- **What it does NOT do:** it does not show that anything compounds yet. `learn report` prints `not measured` until each ruler has its minimum data, and says so when nothing compounded. It does not stop an agent with your shell from running `learn accept`: the boundary is MCP versus your CLI, as with `--trusted`. A correction that reads like an injection is held, even when it is yours. Token counts are estimates (characters / 4). The loop never writes your profile.

### What each command talks to

Egress is per command, and `check <runUrl>` is deliberately the odd one out — it is the only
command that reaches nothing owned by this project (the sentence form, `check "<sentence>"`, talks
to the HyperDAG backend's classify endpoint and nothing else):

| Command | Network egress | Auth |
|---|---|---|
| `verify` | HyperDAG backend (`TRUSTSHELL_API_URL`) | keyless; `REPID_API_KEY` optional |
| `repid` | HyperDAG backend | keyless |
| `proof` | HyperDAG backend (`--verify` runs the verifier **locally**) | keyless |
| `badge` | HyperDAG backend (rendering is **local**) | keyless |
| `check` | **`api.github.com` only** — no backend, no telemetry | none; `GITHUB_TOKEN` optional, rate limit only |
| `check "<sentence>"` | HyperDAG backend (`TRUSTSHELL_API_URL`), `/api/v1/classify` only | keyless |
| `receipt` | HyperDAG backend (`TRUSTSHELL_API_URL`), `GET /api/v1/kernel/receipt/:id` only; the hash check is **local**. Since 1.7.0 | `REPID_API_KEY` required |
| `inspect` | **none** — reads a local file | none |
| `ground` | **none** — reads the `--source` file. Since 1.7.0 | none |
| `init` | **none** — writes one local file. `--pai` runs `scripts/init-pai.mjs` (live register) | none |
| `report` | **none** — it has no fetch and no URL parameter | none |
| `profile` | **none** — reads and writes `.trustshell/profile.md`. Since 1.8.0 | none |
| `remember` | **none** — writes the local memory file | none |
| `recall` | **none** — reads the local memory file | none |
| `redact` | **none** — deletes one row from the local memory file | none |
| `quarantine` | **none** — reads and updates the local memory file; `release --source` reads that file | none |
| `learn` | **none** — reads and writes the local memory file; `check run` and `probe run` execute the command you registered. Since 1.8.0 | none |
| `quarantine release --check hal` | the default HyperDAG backend only, `/api/v1/classify`, after the same scrub as `check`. A `TRUSTSHELL_API_URL` that points elsewhere is not asked, and nothing is released | keyless |
| `status` | HyperDAG backend (`TRUSTSHELL_API_URL`): `GET /api/v1/after-create`, `/api/v1/hal/honesty-a` and `/readiness`. It sends no input of yours | keyless |
| `bind-status` | HyperDAG backend (`TRUSTSHELL_API_URL`): `GET /api/v1/after-create` only. It sends no input of yours | keyless |
| `traps` | **none** — reads the fixture bundled in the package and `.trustshell/traps.json` | none |
| `bundle` | **none** — reads `.trustshell/profile.md`, `~/.trustshell/policy.json` and the local memory file; writes one bundle file (export), or the profile, the policy and quarantined notes (import). In this tree, in no npm release yet (not in 1.8.0) | none |
| `guard` | **none** — reads and writes `~/.trustshell/policy.json` and appends to `guard-receipts.jsonl` beside it. In this tree, in no npm release yet (not in 1.8.0) | none |
| `run` | **none** itself — it starts the command you give it only if the policy allows it, and that command's own network is neither seen nor limited. In this tree, in no npm release yet (not in 1.8.0) | none |

No command uploads your input anywhere other than the host named above.

`init` and `profile` are the commands that write to your working directory, and they write exactly one
file: `.trustshell/profile.md`. `init` never overwrites without `--force`, `profile` changes only the
section you name, and neither collects **anything** — not your git config, hostname, username or
email. Every share flag in the file starts `false`, so `report` withholds identity, context and the
personal sections (values, people you help, style, constraints, model priorities) until you turn
them on yourself. (This sentence
used to read "the published CLI writes no files into your working directory." That was true until
`init` shipped, and a promise nobody re-checks is how a README starts lying.)

**`init --pai` is the one variant that touches the network, and it is a different thing from
`init`.** Plain `init` is local-only. `--pai` runs a short interview (three questions, skippable),
**registers an agent on the live backend**, and writes its credentials to `.trustshell/`. So it
creates real, durable state — an agent with a live RepID — where `init` creates a file.

```bash
# init subcommand with --pai, interactive
# init subcommand with --pai --name my-pai --answers "job|cost|brain"
```

**One PAI per store, and the store is the collision boundary.** Credentials live in
`.trustshell/` by default, so a second `init --pai` in the same directory finds the first one's
credentials and reuses them rather than registering a second agent. To run **two** agents, give
each its own store:

```bash
TRUSTSHELL_HOME=.trustshell-cmo   # init subcommand with --pai --name my-cmo
```

`TRUSTSHELL_HOME` is honoured by `init --pai` and by the value-event log, so the two agents keep
separate credentials and separate histories. Registration is **keyless and does not mint an
on-chain identity** — see the `NOT_MINTED` note above; the ERC-8004 token is a separate,
key-gated step.

**A complete, copy-paste GitHub Actions workflow is in [`examples/ci-gate/`](examples/ci-gate/)** —
drop `trust-gate.yml` into `.github/workflows/`, list your claims in `TRUST_CLAIMS.txt`, and your
build fails on a hallucinated one. Keyless, ~5 minutes, no account. Verified green-as-shipped and
red-on-a-false-claim.

Add `--json` to any command for machine-readable output. `verify` / `repid` / `proof` are all
**keyless**; set `REPID_API_KEY` to attach a key and `TRUSTSHELL_API_URL` to point at another backend.
Run `trustshell --help` for the full reference.

> Three ways in, one trust layer, one package: **SDK** (`import`) for code · **MCP**
> (the `trustshell-mcp` bin) for AI agents · **CLI** (`trustshell`) for the terminal + CI.

---

## Agent skill

OpenClaw, Claude, and Grok load [`skills/trustshell/SKILL.md`](skills/trustshell/SKILL.md). A global install of `@hyperdag/trustshell@1.8.0` puts `trustshell` and `trustshell-mcp` on PATH. Agents shell out to those bins. They do not call a new API.

```bash
npm i -g @hyperdag/trustshell@1.8.0

trustshell verify "<claim>"
trustshell repid <id>
trustshell proof <id> --verify
```

`trustshell verify` exits 0 on PASS or FLAG, 1 on VETO, and 2 when HAL did not decide (NOT_CHECKED, never a pass), from 1.6.0. The local stdio server from that same install is `trustshell-mcp` (`{ "command": "trustshell-mcp" }`).

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
- **12 of 12 core agents hold an IdentityRegistry token** (`ownerOf`, 2026-10-05). Eleven of those twelve tokens are held by two other addresses.
- **Reputation writes are recorded, each with a transaction hash.** On 2026-10-05 the public counter reported 114 rows with a real transaction hash on the reputation registry. That number is not a receipt check of every row, and it does not say a write lands every day.

---

## The 3+1 node (the consumer shape)

The intended default for a consumer node is **three role-agents + one router** — a small mixture-of-experts that keeps *your* standards while the model underneath stays a swappable supplier:

| Slot | Role | Responsibility |
|---|---|---|
| 1 | **Observe** | gather context, retrieve, ground claims in records |
| 2 | **Decide** | reason to a proposed action; run it through the HAL gate |
| 3 | **Act** | execute only what the gate allowed; emit the receipt |
| + | **Router** (ANFIS/LASSO) | route each step to the right role + model supplier |

This is the **design roster, not a running swarm.** TrustShell today ships the trust *primitives* — `verifyOutput` (HAL gate), `getRepID`, `presentProof` + the badge — that you compose into this shape. The role axis is configurable (Observe/Decide/Act shown; Truth/Care/Build is an alternative).

For a **high-stakes** step, a single role can be validated by **family-disjoint agents** — a BFT cross-check across different model families so no one model can wave a bad action through. That is a layered upgrade, not the consumer default.

Your standards stay with you (`user_standards_hash`, checked at the gate); the model is a replaceable supplier, rated by *outcome* (RepID). Swap models freely — your standards and the agent's earned track record persist. (Enterprise nodes scale the same primitives to a denser **3×3+3** Trinity shape.)

---

## About the Pythagorean Comma ("Comma Veto")

TrustShell's HAL pipeline experiments with a dissonance signal derived from the Pythagorean Comma (531441/524288) — the irreconcilable gap that accumulates when you stack twelve perfect fifths against seven octaves.

This is the **origin hypothesis**, not a proven mechanism. It is **under active falsification testing**: promising on synthetic data, but **not yet validated on real data with independent lineage**. Do not rely on it as a production guarantee. It is open here precisely so the claim can be independently checked. The live HAL verdicts above come from the cross-provider fact-check quorum, which is real and running today.

---

## Get credentials

Register your agent at **[repid.dev/start](https://repid.dev/start)**. Browse live scored agents at **[trustrepid.dev](https://trustrepid.dev)**.

## Model card

A portable trust harness so AI has to earn it.

Read-only card at [app/model-card/page.tsx](app/model-card/page.tsx). Columns: family, host, Honesty A, Help B. Honesty A is **FIXTURE** counts of TRUE, FALSE, and NOT_CHECKED from [`fixtures/hal-last-week.fixture.json`](fixtures/hal-last-week.fixture.json). Help B is **no ratings**. There is no human-ratings table in this repo.

## Last measured week

FIXTURE, not live. Per-family HAL counts (family, host, TRUE, FALSE, NOT_CHECKED) are in [the receipt page](app/hal-receipt/page.tsx) and [`fixtures/hal-last-week.fixture.json`](fixtures/hal-last-week.fixture.json). A vote is written as `ProviderVerdict` in `src/hal/fact-check.ts` of [DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine) (host, verdict, latency). Family comes from `familyOf(model)` in that file. The durable table is `llm_call_log`, which does not store TRUE or FALSE. This repo cannot read that table.

Agents rate families by outcomes. Vendors do not score themselves.

## Documentation

- [Getting Started](docs/getting-started.md) · [Architecture](docs/architecture-overview.md) · [API Reference](docs/api-reference.md)
- [Glossary](docs/glossary.md) · [Support](docs/SUPPORT.md)

## Governance

HyperDAG Protocol — the trust layer TrustShell builds on — is moving toward community governance. See the [Governance Roadmap](https://github.com/DealAppSeo/hyperdag-protocol/blob/main/GOVERNANCE_ROADMAP.md). Contribute to the live RepID formula discussion at [trustshell.dev/repid](https://trustshell.dev/repid).

## License

Apache 2.0 — see [LICENSE](LICENSE). Patent rights, if any, are granted under the Apache 2.0 patent grant clause. Commercial use of the (experimental) Pythagorean Comma Veto methodology in closed-source systems requires written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible. Micah 6:8.
