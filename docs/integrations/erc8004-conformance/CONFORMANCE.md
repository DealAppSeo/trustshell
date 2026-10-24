<!-- doc-version: historical (a dated record of 2026-10-24; versions named here are the ones measured that day) -->
# ERC-8004 on Base Sepolia: what the deployed registries expose, and what our agents put in them

Measured 2026-10-24 (lane D of the night program). Read-only throughout: JSON-RPC `eth_chainId`, `eth_blockNumber`,
`eth_getCode`, `eth_getStorageAt`, `eth_call` on view functions, `eth_getLogs`, and plain HTTPS GETs. No transaction, no
simulated write, no key. Reproduce the registry rows with [`probe.mjs`](./probe.mjs); its raw output for this run is
[`raw-2026-10-24.json`](./raw-2026-10-24.json).

## The answer in five lines

1. **The registry at `0x8004A818…` is not ours.** It is the shared testnet singleton listed in
   [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) for Base Sepolia and many other
   testnets. Asking "does your IdentityRegistry match the EIP" asks about a contract we did not deploy.
2. **Its callable surface matches the EIP text.** All 9 ERC-8004 identity functions, the 13 ERC-721 and ERC-165
   functions, and the 3 identity events are compiled in; all 10 reputation functions and 3 events are too. Nothing in
   the reference repo's ABI is missing from the deployed code. ERC-165 answers true for 165, 721 and 721Metadata.
3. **The deployed code is upgradeable** (EIP-1967 proxies, `owner()` = `0x5472…2603` for both). Not ours either.
4. **What falls short is on our side, and it is specific:** an empty `image`, a stub `description`, an extra
   `hyperdag` object, a two-hop redirect between the on-chain URI and the file, no published domain proof, and
   **every rating on our three tokens comes from our own two addresses.**
5. **What was NOT checked is the larger part of the EIP:** how any write path behaves, the Validation Registry,
   event emission, who controls the proxy owner, and whether the deployed bytecode is the reference source. Listed row by
   row in the last column below.

## The ruler

| | |
|---|---|
| Chain | Base Sepolia, chain id **84532** |
| Block at probe | **49,521,727** (probe started 2026-10-24T07:16:52Z), RPC `https://sepolia.base.org`; logs and transactions through `https://base-sepolia-rpc.publicnode.com` (the first caps `eth_getLogs` at 200 blocks) |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e`, EIP-1967 proxy, implementation `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` (14,474 bytes, keccak `0xa5f9624e…c16f`) |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713`, proxy, implementation `0x16e0FA7f7C56B9a767E34B192B51f921BE31dA34` (10,491 bytes, keccak `0x38602de9…d00b`) |
| Spec | EIP-8004 text as fetched 2026-10-24T06:26Z from `ethereum/ERCs` master (24,470 bytes, sha256 `249dc3d9…`). **Status: Draft.** The lists in `probe.mjs` were copied from this fetch. |
| Reference code | `erc-8004/erc-8004-contracts`, default branch `master`, files fetched 2026-10-24T06:34Z (ABIs sha256 `cdb8e30f…`, `867b7975…`) |
| Our tree | `DealAppSeo/trustshell` at `1b004b06`, package `1.9.0-dev.0`; npm `latest` is **1.8.0** (published 2026-10-23) |
| Agents sampled | 6705 and 6706 (this repo's agents; token URIs on `trustrepid.dev`), 5863 (token URI on `repid.dev`), and 1 and 2 (not ours, as outsiders for comparison) |

## 1. The two registries against the EIP text

| # | Item | EIP text says | Observed | Result | NOT_CHECKED |
|---|---|---|---|---|---|
| 1 | Chain | n/a | `eth_chainId` = 84532 | INFO | |
| 2 | Deployment shape | silent on upgradeability | Both addresses hold the same 130-byte EIP-1967 proxy (code keccak `0xd0e45b1d…2b41`); admin slot empty; `owner()` of both = `0x547289319C3e6aedB179C0b8e8aF0B5ACd062603`. The reference source has UUPS `_authorizeUpgrade` restricted to `onlyOwner`. | INFO | Who controls that owner address. Whether the implementation bytecode is the compiled reference source (no `solc` here, so I compared function sets, not bytecode). |
| 3 | ERC-721 + URIStorage | Identity Registry is ERC-721 with URIStorage | All 13 ERC-721 and ERC-165 selectors present. `name()` = "AgentIdentity", `symbol()` = "AGENT". | MATCHES | Transfer semantics (no `eth_call` can show them). |
| 4 | ERC-165 | not specified for the EIP itself | `supportsInterface`: `0x01ffc9a7` true, `0x80ac58cd` (721) true, `0x5b5e139f` (721Metadata) true, `0x780e9d63` (Enumerable) false, `0xffffffff` false (as ERC-165 requires). The Reputation Registry has no `supportsInterface` (the call reverts); the EIP does not ask for one. | MATCHES | |
| 5 | Identity functions | `register` x3, `setAgentURI`, `getMetadata`, `setMetadata`, `setAgentWallet`, `getAgentWallet`, `unsetAgentWallet` | All 9 selectors present in the implementation. (`getAgentWallet`'s selector starts with a zero byte, so solc emits it as `PUSH3`; found, and `getAgentWallet(6705)` answers live.) | MATCHES | What each write does. Not simulated, not sent. |
| 6 | Identity events | `Registered`, `URIUpdated`, `MetadataSet` | All 3 topics present | MATCHES (compiled in) | That they are emitted with these fields. No logs read for them. |
| 7 | Reputation functions | `getIdentityRegistry`, `giveFeedback`, `revokeFeedback`, `appendResponse`, `getSummary`, `readFeedback`, `readAllFeedback`, `getResponseCount`, `getClients`, `getLastIndex` | All present. `giveFeedback` has the `int128 value, uint8 valueDecimals` shape; the older `uint8 score` + `feedbackAuth` shape is **absent**. | MATCHES | What each write does. |
| 8 | Reputation events | `NewFeedback`, `FeedbackRevoked`, `ResponseAppended` | All 3 topics present; `NewFeedback` logs for 6705 were read (see section 4) | MATCHES | `FeedbackRevoked` and `ResponseAppended` emission. |
| 9 | Registry link | `getIdentityRegistry()` returns the identity registry | Returns `0x8004A818…` | MATCHES | |
| 10 | Non-empty client list | "`clientAddresses` MUST be provided (non-empty)" | `getSummary(agentId, [], '', '')` reverts with "clientAddresses required" | MATCHES | |
| 11 | What `getSummary` returns | `(count, summaryValue, summaryValueDecimals)`; aggregation unspecified | Reference source: the **mean** of non-revoked entries, at the most common `valueDecimals`. Checked: 6705 has 17 entries, mean 1664.76, on-chain 1664 (truncated); agent 1 has 111 entries and 37 revoked, on-chain count 74. | INFO | |
| 12 | Never-minted id | ERC-721 semantics | `ownerOf(2^200)` reverts with `0x7e273289` (OpenZeppelin's `ERC721NonexistentToken`) | MATCHES | |
| 13 | `agentWallet` | initially the owner's address; cleared on transfer | `getAgentWallet` = owner for 5863, 6705, 6706, and `getMetadata(id, "agentWallet")` returns the same bytes. Agents 1 and 2 show the zero address (unset). | MATCHES for 3 of 5 | Why 1 and 2 are unset (transfer? older registration?). Signature checks in `setAgentWallet`. |
| 14 | Self-feedback ban | "submitter MUST NOT be the agent owner or an approved operator" | Reference source has the check ("Self-feedback not allowed"). On our three tokens no rater is the owner. | NOT PROVEN on the deployed code | Whether the deployed implementation enforces it: needs a simulated `giveFeedback` from an owner address, which I did not run. |
| 15 | Validation Registry | `validationRequest`, `validationResponse`, 4 reads | The reference README lists **no** Validation Registry address for Base Sepolia and says that part of the spec is still being revised. Not probed. | NOT CHECKED | All of it. |
| 16 | `getVersion()` | not in the EIP | Both return "2.0.0" | INFO | |

Extras the deployed code has beyond the EIP's list (all UUPS/Ownable plumbing plus `getVersion` and `eip712Domain`):
identity 9, reputation 8, listed in `raw-2026-10-24.json` under `*VsReferenceAbi`. Nothing in the reference ABI is
missing from the deployed code, and nothing in the EIP's list is missing from the reference ABI.

## 2. The registration files our agents point at, against the EIP's structure

Read with `examples/erc8004-read-only/read-agent.mjs` (same checks) and by hand.

| # | Item | EIP text says | 6705 (trinity-orch) and 6706 (trinity-w3c) | Result | NOT_CHECKED |
|---|---|---|---|---|---|
| 1 | Getting to the file | `agentURI` MUST resolve to the file | On-chain `tokenURI` is `https://trustrepid.dev/agents/trinity-orch`. It answers **307** to `www.trustrepid.dev`, which leads on to `https://repid-engine-production.up.railway.app/api/v1/agents/trinity-orch/registration.json` (at least two redirects). A client that does not follow redirects stops at the 307. | RESOLVES, through redirects | Whether the hop through `trustrepid.dev` is intended to stay. |
| 2 | `type` | exact string `https://eips.ethereum.org/EIPS/eip-8004#registration-v1` | equal | MATCHES | |
| 3 | `name`, `description` | present | `name` = "trinity-orch"; `description` = "HyperDAG-anchored AI agent trinity-orch" (a generic line, not a description of what it does) | MATCHES the shape; weak content | |
| 4 | `image` | SHOULD be present for ERC-721 apps | `""` (empty string) | **SHORT** | |
| 5 | `services` | name + endpoint, free-form | 3 entries (`agent-card`, `repid-proof-verify`, `reputation-feedback`), none of the EIP's example names | MATCHES (names are free-form) | Whether the endpoints answer. Not called. |
| 6 | `x402Support`, `active` | booleans in the example structure | both booleans; `x402Support` is **false** | MATCHES | |
| 7 | `registrations` | entries with `agentId` and `agentRegistry` = `{namespace}:{chainId}:{identityRegistry}` | `[{agentId: 6705, agentRegistry: "eip155:84532:0x8004A818…"}]`; equals what the chain says | MATCHES (points back) | |
| 8 | `supportedTrust` | optional | `["reputation"]` | MATCHES | |
| 9 | Extra top-level key | not mentioned | a `hyperdag` object: `current_repid` (1969 / 1891), `tier`, `verifier_package: "@hyperdag/proof-verifier@^0.1.0"` (this repo depends on `^0.2.0`), and a `proof_endpoint` that still contains the literal `:job_id` | INFO | How other EIP-8004 clients treat unknown keys. |
| 10 | Stability | https URIs are allowed | The file holds a number that changes (`current_repid`), so its hash changes; the example prints the sha256 so a reader can see a change. | INFO | |
| 11 | Domain proof | optional `/.well-known/agent-registration.json` on the endpoint domain | `GET https://repid-engine-production.up.railway.app/.well-known/agent-registration.json` answers **HTTP 401** | NOT PUBLISHED | The same path on any other host an endpoint names. |
| 12 | Agent 5863 | | Its URI is `https://repid.dev/agents/32e0e809-…/metadata`. From the machine that took these measurements a Fortinet firewall answers for `repid.dev` with its own certificate, so TLS failed. | NOT CHECKED (ENV) | The whole file, from a network that does not intercept it. |

## 3. Who rates our agents

All read with `readAllFeedback(agentId, clients, '', '', true)` at block 49,521,727.

| Token | Owner | Agent wallet | Clients (raters) | Entries | Revoked | Tags | First, last value | Mean | `getSummary` |
|---|---|---|---|---|---|---|---|---|---|
| 6705 | `0xf6eE…cb22A` | same | **1**: `0xb242…7382` (our writer) | 17 | 0 | `hyperdag_repid` / `tier:ESTABLISHED` | 1330, **1969** | 1664.76 | (17, 1664, 0) |
| 6706 | `0xf6eE…cb22A` | same | **1**: `0xb242…7382` (our writer) | 9 | 0 | same | 1025, **1891** | 1703.11 | (9, 1703, 0) |
| 5863 | `0xdf6b…271d` | same | **2**: our writer and our attestor (`0xf6eE…cb22A`) | 30 | 0 | same | 2675, 2276 | 2419.47 | (30, 2419, 0) |
| 1 (not ours) | `0x21fd…e235` | unset | 12 | 111 | 37 | 16 different `tag1` values (quality, reliability, trustScore, tradingYield, payment, ...) | 85, 97 | 3124.11 | (74, 4963, 2) |

- On our three tokens **every rating is ours**. `current_repid` in each registration file equals the latest entry (1969,
  1891), so the file and the chain agree; the registry's own `getSummary` is the mean of the history, not the latest.
- Agent 1 shows the paper's "values are not commensurable" point on this registry: one `getSummary` with no tag filter
  averages feedback of 16 kinds into a single number.
- The two raters on our tokens match the signer list in [`docs/SIGNER_VERIFICATION.md`](../../SIGNER_VERIFICATION.md).
  **Not checked:** how many other tokens each address rates, and who the other 12 raters of agent 1 are.

## 4. One feedback entry, followed all the way

Feedback #17 for token 6705, found by scanning `NewFeedback` logs backwards (the registry's logs for this token in the
window were read in 49,000-block steps; entries 1 to 16 were **not** read as events).

| | |
|---|---|
| Block / time | 48,321,550, **2026-10-19T12:03:08Z** (head at the time of the check: 2026-10-24T07:26Z) |
| Written by | `0xb24268884472E7613aA58D38C8813f7Af1667382` (our writer), tx `0x01fac464…44de8`; the token's owner is a different address |
| `value` / tags | 1969, 0 decimals; `hyperdag_repid`, `tier:ESTABLISHED` |
| `feedbackURI` = `endpoint` | `https://repid-engine-production.up.railway.app/api/v1/agents/84f2d7de-…/reputation/feedback/1647.json` |
| **`feedbackHash`** | `0x196293cd…eef6f`. **keccak256 of the 656 bytes the URI returned on 2026-10-24 equals it.** The hash commits to the file. |
| The file | Has all six fields the EIP marks required (`agentRegistry`, `agentId`, `clientAddress` in `eip155:84532:0x…` form, `createdAt`, `value`, `valueDecimals`) plus `tag1`, `tag2`, `endpoint` and a `proofOfPayment` object. |
| `proofOfPayment` | `{fromAddress 0xdf6b…271d, toAddress 0x28Ee…c9E8, chainId 84532, txHash 0xfc5d9923…5aa46}` |
| That transaction | **Real**: status 1, block 48,321,520 (2026-10-19T12:02:08Z, 30 blocks before the feedback), sent by `0xd407e409…f1bf` to the USDC contract `0x036CbD…`, an EIP-3009 `transferWithAuthorization` (selector `0xe3ee160e`, the v/r/s form) moving **1.000000 USDC** from `0xdf6b…` to `0x28Ee…`. `0xd407…f1bf` is the signer address the **x402.org testnet facilitator** reported in `/facilitator/supported` on 2026-10-24. |
| Who is `0x28Ee…`? | In the repid-engine checkout on this machine (`scripts/mint-t12-correct.js`) it is listed as the wallet of `trinity-orch`. It is **not** `getAgentWallet(6705)` (`0xf6eE…cb22A`). `0xdf6b…` is the owner of token 5863, a different agent. |

What this does and does not show. A rating from our writer cites a real, settled, facilitator-broadcast 1 USDC
payment made a minute earlier, and the integrity hash matches. It does **not** show that the payment bought the work
being rated: the payee is an engine-recorded wallet, not the token's on-chain agent wallet; the payer owns a different
agent; and nothing in the file says what was delivered or who checked it. Binding that is exactly what
[trustshell #589](https://github.com/DealAppSeo/trustshell/issues/589) is for, and it is **not built**.
**Not checked:** the other 16 feedback entries of 6705 (their files and hashes), and any other token's.

## 5. The earlier audit, item by item

`ERC8004_X402_CONFORMANCE_AUDIT.md` (2026-07-06, kept with the maintainers' reports, not in this repo), a read of
repid-engine, trustshell and hyperdag-protocol. (Its verdict words are CONFORMANT, DEVIATES and THEATER. I did not find
an audit that labels the registry's interface "Partial"; the only "Partial" near ERC-8004 is a May 2026 status note about
`trusttrader`.) What I could re-measure tonight:

| Audit item | Then | Now, and the tree it was read in | Not checked |
|---|---|---|---|
| F4: `feedbackHash` is not the hash of the `feedbackURI` content | DEVIATES | **Fixed for feedback #17 of token 6705** (hash equals keccak of the file), read on chain and over HTTPS | Entries 1-16 and other tokens |
| F3: self-review ban could revert live writes | latent | Not violated on our three tokens: no rater is the token's owner (section 3) | Whether the deployed contract enforces the ban (row 14 above) |
| F8: `x402Version: 1` hard-coded | DEVIATES | In the **local repid-engine checkout** (branch `XC3/t12-one-task`, commit `9f02312a`, 2026-10-02, **not fetched, not main**) `X402_VERSION = 2` and `maxTimeoutSeconds` exists | What production runs; engine `main` |
| F9: `maxTimeoutSeconds` missing | DEVIATES | same local checkout: present | same |
| F2: a second, non-canonical reputation registry address in a writer | DEVIATES | same local checkout mentions it only in a comment | Whether any live path still writes to it |
| F10: the SDK's x402 payload is a flat shape, not the nested spec shape | minor | **Still flat** in this tree: `buildX402Payment` returns base64 of `{from,to,value,validAfter,validBefore,nonce,signature}` with no `x402Version`, `accepted` or `payload` wrapper, and `validAfter`/`validBefore` as numbers where the spec's example uses strings (measured 2026-10-24 with a throwaway in-process key, tree `1b004b06`). Same signed EIP-3009 content; different envelope. | Whether the engine converts it before the facilitator; whether npm 1.8.0 differs |

## 6. What this report cannot tell you

- Anything a write does, on either registry: `register`, `setAgentURI`, `setMetadata`, `setAgentWallet`, `giveFeedback`,
  `revokeFeedback`, `appendResponse`. I read selectors and views only. No `eth_call` simulation of a write was made.
- The Validation Registry, at all.
- Event emission for `Registered`, `URIUpdated`, `MetadataSet`, `FeedbackRevoked`, `ResponseAppended`.
- Whether the implementation bytecode is the reference source's compiled output.
- Who controls `0x5472…2603`, the proxy owner for both registries.
- The registration file of 5863 (a firewall on the measuring network intercepts its host).
- Mainnet. Nothing here touches Ethereum, Base or any mainnet; the findings are about Base Sepolia and say nothing about
  the mainnet singletons at `0x8004A169…` and `0x8004BAa1…`.
- This is a point-in-time read at one block. A later block can differ.

Reproduce (needs `ethers` v6, which this repo has as an optional dependency):

```powershell
node docs/integrations/erc8004-conformance/probe.mjs --out raw.json --ids 1,2,5863,6705,6706
```

Repeatability: the probe was run again at block 49,533,268 (2026-10-24T07:55Z) for ids 6705 and 6706. Same
implementation hashes, same `getSummary` values and entry counts as at block 49,521,727. The reference-ABI diff in the
first run's raw file lists the file names and sha256 where the probe first wrote local paths; those two fields were edited
after the run, and no measured value was touched.
