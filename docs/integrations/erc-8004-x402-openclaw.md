# ERC-8004, x402 and OpenClaw: what you can verify, who else is building, and what we have not built

Written 2026-10-24 from sources fetched that day. Every link below was fetched, with its status and time, in
[`LINK_LEDGER_2026-10-24.md`](./LINK_LEDGER_2026-10-24.md); rows marked *listed* were fetched but not read, and a
source's own numbers are quoted as that source's, never as ours. Everything is testnet (Base Sepolia). Nothing here is a
launch claim; for the status vocabulary see [`KNOWN-LIMITS.md`](../KNOWN-LIMITS.md).

States used in this page: **MEASURED** (a command or read produced it, dated), **BUILT** (code exists and a test names it),
**NOT BUILT**, **NOT CHECKED** (nobody looked, or could not).

## 1. Ten minutes: five things you can run

| You want to know | Run | You should see |
|---|---|---|
| What an ERC-8004 agent's identity says, and whether its registration file points back to it | `node examples/erc8004-read-only/read-agent.mjs 6705 --no-check` | `OWNER_FOUND`, the file's EIP-shape rows, `points back MATCH`, and a `not done` list. Exit 2 because the claim check was skipped. Read-only; see [the example's README](../../examples/erc8004-read-only/README.md). |
| Whether the deployed registries expose the EIP's surface | `node docs/integrations/erc8004-conformance/probe.mjs --out raw.json --ids 6705` (needs `npm i ethers`) | The table in [`CONFORMANCE.md`](./erc8004-conformance/CONFORMANCE.md), at the block you ran it. |
| The shape of our x402 payment header | the 10-line snippet in section 4, question 12 | A flat object with seven keys and none of the spec's four top-level ones. |
| Whether what an agent says about a CI run matches GitHub's record (the OpenClaw operator's first job) | `node dist/cli/index.js check https://github.com/DealAppSeo/trustshell/actions/runs/40071506214 --claims "The check workflow passed on f02ae2427c07, run 40071506214."` from a clone (measured on this tree, 1.9.0-dev.0; the published 1.8.0 was not re-run by this lane) | `SUPPORTED`, exit 0. Change the claim to say a run that failed passed, and you get `CONTRADICTED`, exit 1. Table in section 5. |
| What tools `trustshell-mcp` offers an MCP client such as OpenClaw | the `initialize` + `tools/list` exchange in section 5, question 19 | `trustshell` 1.9.0-dev.0, MCP protocol 2025-06-18, 21 tools, with `OFFLINE=1` so nothing can leave the machine. |

Nothing above writes, signs or spends. The example and Inspect read; the example sends one sentence to our hosted check
unless you pass `--no-check`, and Inspect talks to `api.github.com` only.

## 2. Who is building on these, as far as the sources themselves say

Only what each page says about itself. No adoption figure is ours; the ones quoted are the sources' own, with their date.

### ERC-8004

| What | Link | What the source says | State |
|---|---|---|---|
| The EIP | [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004) | Status **Draft**, Standards Track, created 2025-08-13. Three registries: Identity (ERC-721 + URIStorage), Reputation, Validation. Its Security Considerations say Sybil attacks are possible. | MEASURED |
| Discussion | [ethereum-magicians.org/t/…/25098](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098) | The EIP's `discussions-to` thread. | listed |
| Reference contracts | [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) | Registry contracts "curated by the 8004 team"; one address pair for testnets (including Base Sepolia), another for mainnets; the Validation Registry part "still being revised", no address listed for it. | MEASURED |
| Best practices | [erc-8004/best-practices](https://github.com/erc-8004/best-practices) | Has `Registration.md` and `Reputation.md`. | listed (contents not read) |
| Project site and developer hub | [8004.org](https://www.8004.org/), [8004.org/build](https://www.8004.org/build) | titles only | listed |
| Explorer | [8004scan.io](https://8004scan.io/) | Its own counters on 2026-10-24: 1,532,032 registered agents, 803,622 feedback submitted, 29 networks. Self-reported. The paper below found most registrations on three chains are placeholders. | MEASURED (as the site's claim) |
| Other explorers / scanners | [agentscan.info](https://agentscan.info/), [erc-8004.quicknode.com](https://erc-8004.quicknode.com/), [rnwy.com/scanner](https://rnwy.com/scanner) ("Sybil X-Ray Scanner") | titles only; methods unchecked | listed |
| SDKs / indexers | [ChaosChain reference implementation](https://github.com/ChaosChain/trustless-agents-erc-ri), [`@chaoschain/sdk`](https://registry.npmjs.org/@chaoschain/sdk) (0.3.3, MIT, modified 2026-03-27), [agent0lab/subgraph](https://github.com/agent0lab/subgraph), [docs.rs `erc8004`](https://docs.rs/crate/erc8004/latest) | listed by a community list; not evaluated. The Agent0 SDK site could not be read from the measuring network (a firewall answers for it). | listed / NOT CHECKED |
| Other chains | [Celo docs](https://docs.celo.org/build/agents/8004), [0G docs](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc8004) | Both say they deployed the reference registries. Celo's page says feedback can come from any address except the owner and operators, and the contract does not check the sender ever used the agent, so a raw summary can be padded. | MEASURED |
| Independent study | [arXiv 2606.26028](https://arxiv.org/abs/2606.26028) (v3, 18 Oct 2026) | Ethereum, BSC and Base through 13 May 2026: values "not commensurable", feedback "rarely grounded in verifiable interactions", Sybil-flagged reviewers 73.5% / 59.2% / 90.6%. | MEASURED (abstract) |
| **Gone** | Base docs pages that a search listed for ERC-8004 | Both URLs now redirect to a page titled "Base Account and Base MCP Have Moved", with no mention of 8004. | DEAD for this purpose |

### x402

| What | Link | What the source says | State |
|---|---|---|---|
| Spec and SDK repo | [x402-foundation/x402](https://github.com/x402-foundation/x402) | Apache-2.0, "open standard", reference SDKs under `@x402/*`, schemes `exact`, `upto`, `batch-settlement`, specs under `specs/`. | MEASURED |
| Docs | [docs.x402.org index](https://docs.x402.org/llms.txt), [facilitator concept](https://docs.x402.org/core-concepts/facilitator.md) | v2 flow: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` headers. | MEASURED |
| Facilitators | [docs.x402.org/dev-tools/facilitators](https://docs.x402.org/dev-tools/facilitators.md) | Lists "selected" production facilitators (Stellar, Coinbase CDP, Celo, Corbits, Dexter, Fireblocks, others), not exhaustive; the public `x402.org` facilitator is for development and "not intended to be the default production choice for mainnet routes". | MEASURED |
| Testnet facilitator, live | [x402.org/facilitator/supported](https://x402.org/facilitator/supported) | On 2026-10-24: v2 `exact`, `upto`, `batch-settlement` on `eip155:84532` (Base Sepolia) plus several non-EVM networks; one v1 entry (`base-sepolia`). | MEASURED |
| Exact scheme on EVM | [`scheme_exact_evm.md`](https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/exact/scheme_exact_evm.md) | The `PAYMENT-SIGNATURE` payload: `x402Version`, `resource`, `accepted`, and `payload` holding `signature` and `authorization`. | MEASURED |
| Offer and receipt (optional) | [`extension-offer-and-receipt.md`](https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/extension-offer-and-receipt.md) | Servers can sign offers and, after delivery, receipts; lists "verifiable proof of commercial interactions for reputation systems" among the uses; says the wire shape is not stable, the behavioural rules are. | MEASURED |
| SDK | [`@x402/core` on npm](https://registry.npmjs.org/@x402/core) | latest 2.28.0 (modified 2026-09-29), Apache-2.0 | MEASURED |
| Discovery, vendors | [CDP Bazaar docs](https://docs.cdp.coinbase.com/x402/seller/get-discovered), [Fireblocks](https://developers.fireblocks.com/docs/x402-ecosystem.md), [Cloudflare press release](https://www.cloudflare.com/press/press-releases/2025/cloudflare-and-coinbase-will-launch-x402-foundation/) | titles only | listed |

### OpenClaw

| What | Link | What the source says | State |
|---|---|---|---|
| Project | [openclaw/openclaw](https://github.com/openclaw/openclaw), [docs index](https://docs.openclaw.ai/llms.txt) | MIT license shown; the docs index lists security, plugin, hook and MCP pages. | MEASURED |
| Its own trust model | [Security trust model](https://docs.openclaw.ai/gateway/security/trust-model.md) | One trust boundary per gateway; **not** for mutually untrusted users; prompt-injection-only chains with no policy, auth or sandbox bypass are listed as not vulnerabilities by design. | MEASURED |
| ClawHub audits | [Security Audits](https://docs.openclaw.ai/clawhub/security-audits.md) | Audits are "strong safety signals" but not a guarantee a release is risk-free. | MEASURED |
| Internal hooks | [Hook event types](https://docs.openclaw.ai/automation/hooks/event-types.md) | Events: `command:*`, `session:*`, `agent:bootstrap`, `gateway:*`, `message:*`. This is the *internal* hook system and lists no per-tool-call event; tool hooks are a different system, next row. | MEASURED |
| **Plugin hooks, incl. `before_tool_call`** | [Tool call policy hooks](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/hooks/tool-policy.md), [Plugin hooks](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/hooks.md) (OpenClaw repo docs, found by a GitHub code search of `openclaw/openclaw`) | `before_tool_call` gets the tool name, params, agent id, session and requester, and can **block**, **rewrite params**, or **require approval**; `after_tool_call` gets the params, result, error and duration. The overview says the catalog is "the registration API, not a promise that every runtime emits every hook" (Codex native tools support blocking and observation, not rewrites). | MEASURED (docs; no plugin written or run) |
| Policy plugin | [`openclaw policy`](https://docs.openclaw.ai/cli/policy.md) | A conformance layer over OpenClaw settings, checked from `policy.jsonc`; the page says it "does not enforce tool calls or rewrite runtime behavior at request time". | MEASURED |
| MCP | [saved MCP servers](https://docs.openclaw.ai/cli/mcp/registry.md), [config](https://docs.openclaw.ai/gateway/config-extensions.md) | MCP servers are defined under `mcp.servers`; "runtime adapters decide which transport shapes they actually support". | MEASURED |
| Malicious skills | [THN](https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html), [eSecurityPlanet](https://www.esecurityplanet.com/threats/hundreds-of-malicious-skills-found-in-openclaws-clawhub/), [DigitalOcean](https://www.digitalocean.com/resources/articles/openclaw-security-challenges) | A Koi Security audit of 2,857 ClawHub skills found 341 malicious (335 from one campaign, "ClawHavoc"). DigitalOcean adds Bitdefender's separate scan at nearer 900, and SecurityScorecard's count of over 30,000 internet-exposed instances. | MEASURED (secondary reports of one audit) |
| A real OpenClaw CVE | [NVD CVE-2026-25253](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-25253) | OpenClaw before 2026.1.29 opens a WebSocket to a `gatewayUrl` taken from the query string and sends a token. CVSS 8.8 (secondary source). **Not** a malicious-skill CVE, whatever a blog and an issue imply. | MEASURED |

## 3. Questions an ERC-8004 author would ask

**1. Is the IdentityRegistry at `0x8004A818…` yours?** No. It is the shared testnet singleton in the reference repo's
README; TrustShell did not deploy it and does not own it. Its proxy owner is `0x5472…2603`, also not ours. MEASURED, [CONFORMANCE §1](./erc8004-conformance/CONFORMANCE.md).

**2. Does the deployed registry match the EIP?** Its function and event surface does: 22 identity and ERC-721/165
selectors, 10 reputation functions, all events, the final `int128` `giveFeedback` shape, `getSummary` refusing an
empty client list. What each write does, the Validation Registry and event emission are NOT CHECKED. MEASURED at block 49,521,727.

**3. Do your agents' registration files follow the EIP?** Yes on the structure, and `registrations` points back
to the right agent on the right registry. Four gaps: `image` is an empty string, `description` is a generic line, a
`hyperdag` object rides along, and the on-chain URI reaches the file through two redirects. Agent 5863's file could not
be read from the measuring network. The optional domain proof is not published (HTTP 401). MEASURED, [CONFORMANCE §2](./erc8004-conformance/CONFORMANCE.md).

**4. Who rates your agents?** On the three tokens read (6705, 6706, 5863), only two addresses, both ours (a writer and an
attestor). The reputation there is self-issued. We say so rather than call it independent. MEASURED, [CONFORMANCE §3](./erc8004-conformance/CONFORMANCE.md).
Our SDK's `verifySigner` labels every signer against an allowlist and returns unknown ones flagged; it recommends no
policy ([`SIGNER_VERIFICATION.md`](../SIGNER_VERIFICATION.md)).

**5. Does your feedback carry evidence?** Partly, and it is not the evidence you would want. Feedback #17 on token 6705
has a `feedbackHash` that equals the keccak256 of the file at its `feedbackURI`, and a `proofOfPayment` pointing at a real
settled 1.000000 USDC transfer a minute earlier, broadcast by the x402.org facilitator's signer address. But the payee is
not the token's on-chain agent wallet, the payer owns a different agent, and nothing says what was bought or delivered. Only one entry of 17 was
traced. Evidence-bound feedback (payment, delivered work and an independent check, tied together) is **NOT BUILT**,
tracked in [#589](https://github.com/DealAppSeo/trustshell/issues/589). MEASURED, [CONFORMANCE §4](./erc8004-conformance/CONFORMANCE.md).

**6. How do you avoid being fooled by `getSummary` and a stranger's feedback?** The EIP says the client list must be
non-empty; the registry enforces it. Our site's reader passes only our two allowlisted addresses
(`clientsForHyperDagSummary`, `lib/onchain-repid.ts`), after a read-path review found an unfiltered call
([`S1_A7_READPATH_VERDICT.md`](../S1_A7_READPATH_VERDICT.md)). Note what that means: our number is ours by construction.
It is a statement about what we wrote, not a Sybil-resistant score. BUILT, and the limit stated.

**7. Is your score Sybil-resistant?** No. Nothing in this repo claims it, and the site page says "nothing here makes
reputation Sybil-proof".

**8. Do you use the Validation Registry?** No. The reference repo lists no address for it on Base Sepolia and marks it as
under revision. NOT BUILT.

**9. Mainnet?** No. Testnet only ([`PRODUCT.md`](../../PRODUCT.md)).

**10. Is the scoring code public?** The engine repo is public under Apache-2.0 (GitHub API, 2026-10-24, last push
2026-10-23). The site page also says its tuned constants are not public; I did not check that sentence.

**11. How do I read an agent's identity without trusting your backend?** With the example above, directly from the
chain. The published SDK does not do this: its README says `getIdentity()` consumes the engine's own `ownerOf` read and
says "on-chain" only if that read found an owner. The example is the first direct read in this repo.

## 4. Questions an x402 builder would ask

**12. Does your SDK produce a spec x402 payment?** No. `buildX402Payment` signs a correct EIP-3009
`TransferWithAuthorization`, but returns a base64 **flat** object (`from, to, value, validAfter, validBefore, nonce, signature`)
sent as an `X-PAYMENT` header to our own engine's escrow endpoint. The spec's v2 payload is nested
(`x402Version`, `accepted`, `payload.authorization`) and travels in `PAYMENT-SIGNATURE`. MEASURED 2026-10-24 in tree `1b004b06`:

```js
// node, from the repo root; the key is generated in-process, nothing is sent anywhere
const { Wallet } = require('ethers');
const { buildX402Payment } = require('./dist/lib/trustshell.js');
buildX402Payment({ privateKey: Wallet.createRandom().privateKey, to: Wallet.createRandom().address, amount: '10000', cap: '10000', origin: 'Cli', agentId: 'x' })
  .then((h) => console.log(Object.keys(JSON.parse(Buffer.from(h, 'base64').toString()))));
// prints seven keys: 'from', 'to', 'value', 'validAfter', 'validBefore', 'nonce', 'signature'
```

An earlier audit flagged the same thing on 2026-07-06 (F10); it is unchanged in this tree. Whether the engine converts it
before talking to a facilitator, and whether npm 1.8.0 differs: NOT CHECKED.

**13. Have you settled through a standard facilitator?** There is on-chain evidence of one settlement: the transaction in
question 5 was broadcast by the address the x402.org testnet facilitator reports as its signer. How it was produced (the SDK,
the engine, something else) is not established here. One transaction is not a test suite. NOT CHECKED beyond that.

**14. What stops an agent overspending?** `guardedX402Payment` refuses unless the turn's origin may pay, writes the audit
row first, requires a spend policy, and requires a cap (when an allowance reader is supplied, the lower of the declared cap
and the TrustKeys allowance); an optional receipt-writer gate refuses if no receipt can be written. Fail-closed, with tests
([`src/lib/guarded-payment.ts`](../../src/lib/guarded-payment.ts)). Limits: test network only, the cap comes from the calling code and is not signed
by an owner, and **no hosted page spends** ([`X402_SITE_GATE.md`](../X402_SITE_GATE.md)). BUILT, limits stated.

**15. Which schemes and networks?** `exact`/EIP-3009 with USDC on Base Sepolia as the defaults (chain 84532). `upto`,
`batch-settlement`, Solana and the rest: NOT BUILT. Nothing in `src/`, `lib/` or `app/` handles `PAYMENT-REQUIRED` or
`PAYMENT-SIGNATURE`; the SDK reads `x402Version` only from our engine's escrow reply, defaulting to 1.

**16. Do you use the offer-and-receipt extension?** No. It is the spec's own route to "verifiable proof of commercial
interactions for reputation systems", and the likeliest evidence source for the feedback in question 5. Whether a TrustShell
receipt should embed or point at it is an open design question ([`trust-receipt.md`](../trust-receipt.md), question 5). NOT BUILT.

## 5. For OpenClaw operators and maintainers

OpenClaw runs an agent with real access (shell, files, browser, messages). The job TrustShell can do for an operator
who wants the agent to work unattended is narrow: a record of what the agent said it did, checked against something
outside the agent, and a limit it cannot argue past. What exists today, measured on this tree (1.9.0-dev.0) on 2026-10-24:

### Inspect on a real run

Three claims, each checked by `trustshell check <runUrl> --claims "<claim>"` against a public run of this repo. The "GitHub says"
column is the GitHub CLI (`gh run list` and `gh api repos/DealAppSeo/trustshell/actions/runs/<id>`), read separately. No account, no key, no model for Inspect: `api.github.com` only.

| Claim the agent made | GitHub says (independently) | Inspect | Exit |
|---|---|---|---|
| "The check workflow passed on f02ae2427c07, run 40071506214." | run 40071506214: `completed`, `success` | outcome **SUPPORTED**; commit **SUPPORTED**; run id **SUPPORTED** | 0 |
| "The e2e-honesty workflow passed on 1b004b06942d, run 40071306908." | run 40071306908: `completed`, **`failure`** | outcome **CONTRADICTED** (the commit and run id are SUPPORTED) | 1 |
| "All tests pass." | run 40071506214: `success` | **NOT_CHECKED**: a run record does not say which tests ran, and the sentence cites no run | 3 |

Two behaviours worth knowing. A claim is decided only when it cites the run it is about. And **one line the templates do not
read blocks every verdict in the text**: a three-sentence paste that included unreadable sentences decided nothing (0 supported, 0
contradicted, 4 not checked, exit 3). That is deliberate (deny by default, [`action-evidence.md`](../action-evidence.md)). Every record ends with
"What this does not prove": a successful run does not show which tests ran; the evidence is GitHub describing its own run; the record is not signed.
Covers GitHub Actions runs only. MEASURED; the published 1.8.0 was not re-run.

### What an OpenClaw operator can attach TrustShell to

**17. Is there an OpenClaw integration?** A **skill**: yes. [`skills/trustshell`](../../skills/trustshell/SKILL.md) carries OpenClaw
metadata, requires the `trustshell` and `trustshell-mcp` bins, pins `@hyperdag/trustshell@1.8.0`, and shells out to
`verify`, `repid`, `proof --verify` and `status`; it also shows the one-line MCP definition. Whether it was run inside OpenClaw, and whether it
is published on ClawHub, I did not check. A **plugin that uses OpenClaw's tool hooks**: no. The README and
[`PRODUCT.md`](../../PRODUCT.md) say so. NOT BUILT.

**18. Could a plugin be built on OpenClaw's own hooks?** The documented surface says yes, with caveats. OpenClaw's plugin API has
`before_tool_call` (receives the tool name, params, agent id, session and requester; can return `block`, rewritten `params`, or
`requireApproval`) and `after_tool_call` (receives params, result, error and duration). The README's sentence that this is "exactly where a policy
check and a receipt would attach" matches those docs. Caveats from the same docs: the hook catalog is a registration API, not a promise that every runtime
emits every hook, and Codex native tools support blocking and observation but not parameter rewrites. A sketch of what it would do, **not written, not run**:
`before_tool_call` asks the guard whether this agent may spend or call this tool (block or require approval if not); `after_tool_call` writes a receipt
from the params, result and duration. The internal-hook page I read first lists only lifecycle events; that is a different hook system.
Nothing in this repo registers either hook. NOT BUILT.

**19. Can OpenClaw run `trustshell-mcp`?** The server itself works over stdio, measured 2026-10-24 08:04Z with `OFFLINE=1` and
`TRUSTSHELL_LOCAL_ONLY=1`: it answers MCP `initialize` (protocol 2025-06-18, server `trustshell` 1.9.0-dev.0, capability `tools`) and
`tools/list` returns **21 tools**: `verify_output`, `check_claim`, `inspect_run`, `get_repid`, `present_proof`, `verify_proof`, `status`, `my_job`,
`kernel_receipt`, `ground_quote`, `remember`, `recall`, the quarantine and learning tools, `getLeaderboard`, and deprecated aliases (`verify`, `evaluate`, `getRepID`, `repid`).
`inspect_run` is in this tree and not in 1.8.0. OpenClaw documents saved MCP server definitions under `mcp.servers` and says which transports work depends on the
runtime adapter. **I did not run it inside OpenClaw** (not installed here). NOT CHECKED. Even if it runs there: the Guard demo says the MCP server "does not read the policy yet", so an owner policy would not apply over MCP.

**19b. How is this different from `openclaw policy`?** `openclaw policy` checks OpenClaw's own settings against a `policy.jsonc` and reports
drift; its page says it "does not enforce tool calls or rewrite runtime behavior at request time". The runtime gate in OpenClaw is a `before_tool_call` plugin.
TrustShell's Guard is a prototype that decides only for the paths TrustShell mediates (question 21).

**20. Do you scan or sandbox skills?** No, and the site page says so. ClawHub's own audit page says audits are not a
guarantee, and OpenClaw's trust model puts adversarial multi-user setups out of scope. TrustShell's one OpenClaw-relevant
check today is Inspect: what an agent says about a GitHub Actions run, compared with GitHub's record. A different layer.

**21. What does TrustShell assume about the threat model?** The same boundary OpenClaw documents: one operator per
gateway. Guard (a prototype on `main`, in no release) decides only for the paths TrustShell mediates, `trustshell run`
and its own commands. By its own demo's list of limits it stops "a mistaken command, not an agent that can run the CLI
itself"; a command started without TrustShell is not seen at all ([`guard-carry-demo.md`](../guard-carry-demo.md)). It is
not a sandbox and not a security boundary.

**22. Where does your "341 malicious skills" come from?** From a Koi Security audit of 2,857 skills, as reported by The
Hacker News, eSecurityPlanet and DigitalOcean. A different scan reported nearer 900. The `/for/openclaw` footnote currently
cites a Hacker News article that does not contain the number; the correction is proposed, not applied.

## 6. What this page is honest about

- It proves nothing about behaviour of the registries' write paths, the Validation Registry, mainnet, or OpenClaw
  integration. Those are NOT CHECKED, not "fine".
- The evidence that touches us is mostly about us: self-issued ratings, a flat x402 envelope, two registration-file gaps.
- One measuring network had a firewall that blocked two hosts; another network may read them.
- A later block, a later page version or a different network can change any row. The hashes in the ledger are there so you can tell.
