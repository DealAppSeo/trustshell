# Paste something an AI told you and see if it checks out.

```powershell
npx @hyperdag/trustshell check "If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph."
```

```
veto
The classifier labelled this sentence veto — do not rely on it (356 ms).
```

That run exited 1.

![How a check works: your sentence is scrubbed on your device; an equation such as 2 + 2 = 5 is worked out with no model; anything else goes to two checkers from different model families; both TRUE is Checks out, both FALSE is Caught, anything else is Not checked.](public/how-a-check-works.svg)

<!--
  Embed slot. The player stays out of the README until the file is in the repo.
  When E:\TrustDisk\video\trustshell-demo-20s.mp4 exists, copy it to public/trustshell-demo-20s.mp4.
-->

Placeholder path: `public/trustshell-demo-20s.mp4`. Source file, when it exists: `E:\TrustDisk\video\trustshell-demo-20s.mp4`. The player is hidden until that file is there.

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
| npm `latest` | **1.6.0** (`npm view @hyperdag/trustshell version`). |
| HAL quorum | **2 answering / 8 configured** (measured). Not a constant 6. |
| Chain | **Base Sepolia**, not mainnet. |
| Grounding | **shadow** — does not mutate live RepID. |

Not a launch announcement.

---

## The portable agentic trust harness

Most "LLM trust" tools are *judges* — they score an output and leave the decision to you. TrustShell is a **fail-closed gate**: it can **refuse**, it hands back a **ZK-verifiable receipt** you check yourself (not our word), and it carries a **portable, earned RepID** that travels with the agent as you swap the model underneath. An unavailable check is never a pass. That is the difference between *another LLM judge* and a *trust rail*.

**One `npm install` gives any agent three protocols in one wrapper:**

- ✅ **HAL cross-LLM verification** — `verifyOutput()` — real cross-provider fact-check quorum (keyless, live-verified)
- 🏅 **ERC-8004 portable reputation** — `getRepID()` / `presentProof()` — look up any agent's RepID score + tier, or present a client-verifiable range proof (keyless, live-verified)
- 💸 **x402 payments** — `executeA2A()` / `guardedX402Payment()` — agent-to-agent service purchase over EIP-3009 x402 (available — needs an API key + a funded Base Sepolia wallet)

HAL verify and RepID lookup run against the live backend with **no key**. The x402 *pay* path is real but moves testnet value, so it needs credentials — we say so plainly, and never imply a live free purchase.

---

## What it does

TrustShell gives an AI agent (or the dev building one) three things against the **live** HyperDAG backend:

1. **Verify an output** — run any text through a real cross-provider HAL fact-check quorum and get a `PASS` / `FLAG` / `VETO` verdict with evidence. **No API key.**
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
| `verifyOutput()` / `evaluate()` / `trustshell verify` | live-degraded | Keyless. Quorum is measured (`providersUsed`), not a configured 6. Live 2026-09-15: 2 answering / 8 configured. HAL is weaker on paraphrases than on record-grounded facts. |
| ERC-8004 identity mint | paused/blocked | Key-gated, separate call. A keyless `register()` leaves `NOT_MINTED`. |
| On-chain reputation writes | live-degraded | Recorded, each with a transaction hash. On 2026-10-05 the public counter reported 114 rows with a real transaction hash on the reputation registry. That is not a receipt check of every row. |
| x402 `executeA2A()` | paused/blocked | Protocol exists on Base Sepolia (chain id 84532). Needs an API key and a funded testnet wallet. Not mainnet. |

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
promised.** *Which providers* answer is chosen by the live quorum — you may see
`groq`/`cerebras` instead of the three shown, and the count varies with availability;
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

// PAY — origin + policy + audit, then sign (the key only signs locally; it never leaves memory).
const xPaymentHeader = await guardedX402Payment({
  origin: 'Cli',                                // Unknown / missing origin cannot pay
  privateKey: process.env.TRUSTSHELL_PAYER_KEY, // funded Base Sepolia wallet
  to: svc.providerAgentId,                      // or the payTo from the backend's 402 requirements
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
REPID_API_KEY=...             # your agent API key (repid.dev/start) — also gates discovery
TRUSTSHELL_BUYER_AGENT=...    # the buyer agent UUID the key is bound to
TRUSTSHELL_PAYER_KEY=0x...    # a Base Sepolia wallet funded with test USDC
```

Runnable version: [`examples/a2a-purchase/a2a-purchase.mjs`](examples/a2a-purchase/a2a-purchase.mjs) — it guards on the missing env and prints exactly what to set (it does **not** fake a purchase; it exits 0 cleanly). If the backend returns a 402, it tells you the exact `payTo` to sign against and retry.

---

## CLI — trust checks in your terminal + CI

The same trust harness ships as a command, so it works with **no code** and slots into any
CI / pre-commit pipeline. Installing the package puts a `trustshell` (and `hal`) bin on your PATH:

```bash
npm install -g @hyperdag/trustshell     # or: npx @hyperdag/trustshell verify "…"

trustshell verify "The capital of France is Paris."
# Recorded 2026-10-05, exit 0:
# ✓ PASS  trust 100/100
#   PASS — hal_score 0 via fact-check (full quorum)
#   evidence:
#     - cerebras:TRUE (Paris is the capital of France.)
#     - groq:TRUE (Paris is the capital of France.)
#     - zai:UNCERTAIN (NOT_CHECKED: late after 2-family agreement)

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
> version gap, not a broken install. If you hit that: upgrade, or install from source
> (`npm i github:DealAppSeo/trustshell`, which tracks the latest).
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
import TrustShell, { renderProofBadge } from '@hyperdag/trustshell';
const shell = new TrustShell();
const proof = await shell.presentProof('trinity-shofet', { verify: true });
const svg = renderProofBadge(proof, { href: 'https://trustrepid.dev/agent/trinity-shofet' });
```

**`verify` is a CI gate.** It exits **0** on `PASS`/`FLAG` and **non-zero (1)** on `VETO`, so you
can fail a build the moment HAL vetoes a claim — no glue code:

```bash
# .github/workflows/*.yml  (or a pre-commit hook)
# Fail the build if HAL vetoes a claim in the release notes.
trustshell verify "$(cat CHANGELOG_CLAIM.txt)" || {
  echo "HAL vetoed a claim — not shipping."; exit 1;
}
```

| Exit code | Meaning |
|---|---|
| `0` | HAL `PASS` (or soft `FLAG`) — safe to proceed |
| `1` | HAL `VETO` — the claim did not pass; fail the build |
| `2` | usage / bad arguments |
| `3` | runtime error (network / backend / timeout) |

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

*(No example output is printed here on purpose: a card in a README is a claim about a run that
may not exist. Run it against a real run and read your own.)*

### `check "<sentence>"` — the same label the Chrome extension shows

When the operand is **not a URL**, `check` labels one sentence `pass`, `veto` or `not-checked` by
asking the same public endpoint the TrustShell Chrome extension asks
(`POST <backend>/api/v1/classify`, backend = `TRUSTSHELL_API_URL` or the live HyperDAG backend).
The MCP server's `check_claim` tool calls the same function, so a terminal, an agent and the
extension get the same label for the same sentence. Any operand with a URL scheme (or a bare
`github.com/...`) still goes to the GitHub run check above, unchanged.

It prints the label on its own line, then one line of explanation; `--json` prints the response
object (`{label, latency_ms}`, plus `reason` when the label was decided locally).

| Label | Exit |
|---|---|
| `pass` | `0` |
| `veto` | `1` |
| `not-checked` | `2` — **never** a pass |
| error (nothing was sent: empty sentence, invalid `TRUSTSHELL_API_URL`) | `3` |

A timeout (6 s), a network failure, a non-200 or a body outside the contract is `not-checked`.
Known secret shapes are stripped from the sentence before it is sent.

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
| `inspect` | **none** — reads a local file | none |
| `init` | **none** — writes one local file. `--pai` runs `scripts/init-pai.mjs` (live register) | none |
| `report` | **none** — it has no fetch and no URL parameter | none |
| `remember` | **none** — writes the local memory file | none |
| `recall` | **none** — reads the local memory file | none |
| `redact` | **none** — deletes one row from the local memory file | none |

No command uploads your input anywhere other than the host named above.

`init` is the one command that writes to your working directory, and it writes exactly one file:
`.trustshell/profile.md`. It never overwrites without `--force`, and it collects **nothing** — not
your git config, hostname, username or email. Every share flag in the file it generates starts
`false`, so `report` withholds identity and context until you turn them on yourself. (This sentence
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

> Three ways in, one trust layer: **SDK** (`import`) for code · **MCP**
> (`@hyperdag/trustshell-mcp`) for AI agents · **CLI** (`trustshell`) for the terminal + CI.

---

## Agent skill

OpenClaw, Claude, and Grok load [`skills/trustshell/SKILL.md`](skills/trustshell/SKILL.md). A global install of `@hyperdag/trustshell@1.6.0` puts `trustshell` and `trustshell-mcp` on PATH. Agents shell out to those bins. They do not call a new API.

```bash
npm i -g @hyperdag/trustshell@1.6.0

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

FIXTURE, not live. Per-family HAL counts (family, host, TRUE, FALSE, NOT_CHECKED) are in [the receipt page](app/hal-receipt/page.tsx) and [`fixtures/hal-last-week.fixture.json`](fixtures/hal-last-week.fixture.json). A vote is written as `ProviderVerdict` in `repid-engine/src/hal/fact-check.ts` (host, verdict, latency). Family comes from `familyOf(model)` in that file. The durable table is `llm_call_log`, which does not store TRUE or FALSE. This repo cannot read that table.

Agents rate families by outcomes. Vendors do not score themselves.

## Documentation

- [Getting Started](docs/getting-started.md) · [Architecture](docs/architecture-overview.md) · [API Reference](docs/api-reference.md)
- [Glossary](docs/glossary.md) · [Support](docs/SUPPORT.md)

## Governance

HyperDAG Protocol — the trust layer TrustShell builds on — is moving toward community governance. See the [Governance Roadmap](https://github.com/DealAppSeo/hyperdag-protocol/blob/main/GOVERNANCE_ROADMAP.md). Contribute to the live RepID formula discussion at [trustshell.dev/repid](https://trustshell.dev/repid).

## License

Apache 2.0 — see [LICENSE](LICENSE). Patent rights, if any, are granted under the Apache 2.0 patent grant clause. Commercial use of the (experimental) Pythagorean Comma Veto methodology in closed-source systems requires written permission from DealApp Inc.

Built on [HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol). ERC-8004 compatible. Micah 6:8.
