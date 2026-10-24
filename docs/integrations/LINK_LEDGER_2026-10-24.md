<!-- doc-version: historical (a dated record of 2026-10-24; versions named here are the ones measured that day) -->
# Link ledger: ERC-8004, x402, OpenClaw (lane D, night program 2026-10-24)

Every row is a URL fetched in this session by `ledger-fetch` (Node `fetch`, GET, honest user agent
`trustshell-lane-d-link-check/1.0`, redirects followed, 2 in flight, 1.2 s per host). Fetch window: **2026-10-24T06:26:30.506Z to 2026-10-24T08:03:19.753Z** (UTC).
The status, final URL, size and sha256 are what the fetch returned. The "What the source says" column is **my paraphrase of
what I read in that fetched body, and nothing else**; a row marked STATUS_ONLY was fetched and its status recorded but its
content was not read, so it supports no claim. No adoption number comes from memory.

## Totals

103 URLs. HTTP: no response (TLS): 2, 200: 95, 401: 1, 403: 4, 404: 1.
By state: BLOCKED_BOT 4, BLOCKED_ENV 2, DEAD_AS_REQUESTED 1, MOVED_CONTENT_GONE 2, READ 56, STATUS_ONLY 38.

| State | Means |
|---|---|
| READ | Fetched and the claim in the last column was read in the body. |
| STATUS_ONLY | Fetched (a status was recorded); the content was not read. Supports no claim. |
| MOVED_CONTENT_GONE | 200, but it redirected to a page that no longer holds what the search result described. Treat as dead for that purpose. |
| DEAD_AS_REQUESTED | The URL I asked for 404s. |
| BLOCKED_BOT | HTTP 403 with a bot-challenge page. Not read; **not bypassed**. |
| BLOCKED_ENV | TLS failed because a Fortinet firewall on this machine's network answered with its own certificate (openssl shows a Fortinet issuer). Not read; not bypassed. Another network may read it. |

## Seen only in search summaries, never fetched, deliberately not used

A search summary said "10k+ agents registered on mainnet" (a news site), "more than 23,000 resources" in the x402 Bazaar,
that the Linux Foundation announced an x402 Foundation on 2 April 2026, and that an audit found 1,103 malicious ClawHub
skills (about 7.5%). I did not open those pages, so none of those numbers appears in the integrator map or the questions.


## ERC-8004 (45)

| # | URL (as requested) | HTTP | Final URL if different | Fetched (UTC) | Bytes | sha256 | State | What the source says (my paraphrase of what I read) |
|---|---|---|---|---|---|---|---|---|
| 1 | https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-8004.md | 200 |  | 2026-10-24T06:26:31Z | 24470 | 249dc3d96ad7 | READ | The same EIP source on ethereum/ERCs master; the function and event lists used by the conformance probe were copied from this file. sha256 recorded. |
| 2 | https://eips.ethereum.org/EIPS/eip-8004 | 200 |  | 2026-10-24T06:26:30Z | 74013 | 8f293d534475 | READ | EIP text, rendered. Header says status Draft, Standards Track, created 2025-08-13, requires 155/712/721/1271. Defines Identity (ERC-721 + URIStorage), Reputation and Validation registries; Security Considerations say Sybil attacks are possible. |
| 3 | https://github.com/erc-8004/erc-8004-contracts | 200 |  | 2026-10-24T06:26:31Z | 505611 | 1c505d4e4124 | READ | README (HTML) lists the same Identity and Reputation addresses for Base Sepolia and for many other testnets, and a second pair for mainnets. About text: registry contracts curated by the 8004 team. Default branch is master. |
| 4 | https://docs.base.org/ai-agents/reference/contracts | 200 | https://docs.base.org/sdks/migrated-products | 2026-10-24T06:26:31Z | 306704 | 62b6fe246132 | MOVED_CONTENT_GONE | A search summary said Base docs list the ERC-8004 addresses here. The URL now redirects to a page titled 'Base Account and Base MCP Have Moved' that contains no mention of 8004. Not usable as a source. |
| 5 | https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098 | 200 |  | 2026-10-24T06:26:31Z | 67227 | ba9f3d54a3d0 | STATUS_ONLY | The EIP's discussions-to thread. Fetched (200); thread content not read. |
| 6 | https://docs.rs/crate/erc8004/latest | 200 |  | 2026-10-24T06:26:32Z | 71864 | e1a0d92d4111 | STATUS_ONLY | Community Rust crate page (erc8004 0.4.1 at fetch time). Not read. |
| 7 | https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e | 403 |  | 2026-10-24T06:26:32Z | 5857 | 2835a21a6ea7 | BLOCKED_BOT | HTTP 403 with a 'Just a moment' challenge page. Not read, not bypassed. The registry was read through JSON-RPC instead (see CONFORMANCE.md). |
| 8 | https://docs.celo.org/build-on-celo/build-with-ai/8004 | 200 | https://docs.celo.org/build/agents/8004 | 2026-10-24T06:26:32Z | 400698 | a9261472af86 | READ | Redirected to docs.celo.org/build/agents/8004. Says feedback can come from any address other than the owner and operators, the contract does not check that the sender used the agent, so a raw summary can be padded. Lists Celo mainnet and Celo Sepolia addresses (same 0x8004A818.. / 0x8004B663.. on the testnet). |
| 9 | https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713 | 403 |  | 2026-10-24T06:26:34Z | 5857 | 26d2a22f404a | BLOCKED_BOT | Same 403 challenge. Not read. Read through JSON-RPC instead. |
| 10 | https://arxiv.org/abs/2606.26028 | 200 |  | 2026-10-24T06:26:34Z | 45185 | 0cbed33d5ccb | READ | Abstract page, now version 3 (v1 24 Jun 2026, v2 8 Jul 2026, v3 18 Oct 2026). Data through 13 May 2026 from Ethereum, BSC and Base. Reports values not commensurable, feedback rarely grounded in verifiable interactions, manipulation at minimal cost, Sybil-flagged reviewers 73.5% / 59.2% / 90.6%. |
| 11 | https://export.arxiv.org/api/query?id_list=2606.26028 | 200 |  | 2026-10-24T06:26:34Z | 3690 | 5629611caa23 | READ | arXiv API record; same abstract, updated 2026-10-18. |
| 12 | https://sepolia.basescan.org/address/0x7177a6867296406881E20d6647232314736Dd09A | 403 |  | 2026-10-24T06:26:35Z | 5857 | 73d967a11bce | BLOCKED_BOT | A search summary said a different verified IdentityRegistry sits at 0x7177... on Base Sepolia. 403 challenge; not read. Unverified. |
| 13 | https://arxiv.org/abs/2606.26028v1 | 200 |  | 2026-10-24T06:27:57Z | 45206 | 46048ecdf009 | READ | v1 abstract: Sybil-flagged reviewers 73.6% / 59.2% / 90.6%; agents left with no valid feedback after removal 15.5% / 72.3% / 89.4%. |
| 14 | https://arxiv.org/abs/2606.26028v2 | 200 |  | 2026-10-24T06:27:58Z | 45275 | e5ef966b00e1 | READ | v2 abstract: 73.5% / 59.2% / 90.6% and 15.8% / 77.9% / 86.8%, identical to v3's abstract. |
| 15 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/main/README.md | 200 |  | 2026-10-24T06:33:57Z | 24943 | 0fa22248188f | READ | README (raw, main alias) says the Validation Registry part of the spec is still being revised, and lists no Validation Registry deployment address. |
| 16 | https://api.github.com/repos/erc-8004/erc-8004-contracts/git/trees/main?recursive=1 | 404 |  | 2026-10-24T06:33:57Z | 110 | 8c177a38af7c | DEAD_AS_REQUESTED | 404: my first guess used the branch name main; the repo's default branch is master. Superseded by gh-tree-contracts-master. |
| 17 | https://api.github.com/repos/erc-8004/erc-8004-contracts/git/trees/master?recursive=1 | 200 |  | 2026-10-24T06:34:30Z | 10063 | c4728efb477f | READ | File listing: contracts/ (Identity, Reputation, Validation, proxies), abis/, ignition/, test/. |
| 18 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/contracts/IdentityRegistryUpgradeable.sol | 200 |  | 2026-10-24T06:34:49Z | 9347 | 18c8ca8c8849 | READ | Reference IdentityRegistryUpgradeable source: register x3, getMetadata/setMetadata, setAgentURI, set/get/unsetAgentWallet, getVersion. |
| 19 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/contracts/ReputationRegistryUpgradeable.sol | 200 |  | 2026-10-24T06:34:50Z | 15301 | 9063eba19239 | READ | Reference ReputationRegistryUpgradeable source: getSummary reverts with 'clientAddresses required' and returns the mean of non-revoked entries; giveFeedback blocks the owner or an approved operator. |
| 20 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/abis/IdentityRegistry.json | 200 |  | 2026-10-24T06:34:51Z | 19561 | cdb8e30f41a5 | READ | Reference ABI used for the selector diff (31 functions). |
| 21 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/abis/ReputationRegistry.json | 200 |  | 2026-10-24T06:34:52Z | 8720 | 867b7975a5f2 | READ | Reference ABI used for the selector diff (18 functions). |
| 22 | https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/abis/ValidationRegistry.json | 200 |  | 2026-10-24T06:34:54Z | 9659 | e16bd4344b28 | STATUS_ONLY | Reference Validation ABI. Fetched; not diffed, because no Validation Registry address is published for Base Sepolia. |
| 23 | https://trustrepid.dev/agents/trinity-orch | 200 | https://repid-engine-production.up.railway.app/api/v1/agents/trinity-orch/registration.json | 2026-10-24T06:42:46Z | 1040 | 1943072704ec | READ | What agent 6705's on-chain tokenURI (https://trustrepid.dev/agents/trinity-orch) leads to: a 307 to www.trustrepid.dev, then the engine's registration.json. Body checked against the EIP structure. |
| 24 | https://trustrepid.dev/agents/trinity-w3c | 200 | https://repid-engine-production.up.railway.app/api/v1/agents/trinity-w3c/registration.json | 2026-10-24T06:42:47Z | 1038 | 3a8bbbe5fed8 | READ | Same for agent 6706 (trinity-w3c). |
| 25 | https://repid.dev/agents/32e0e809-c1c4-4405-913f-135c8a2d6626/metadata | none (UNABLE_TO_VERIFY_LEAF_SIGNATURE) |  | 2026-10-24T06:42:47Z |  |  | BLOCKED_ENV | Agent 5863's tokenURI host (repid.dev) was answered by a Fortinet firewall certificate on this network; TLS failed. Not read. Not bypassed. |
| 26 | https://docs.base.org/ai-agents/setup/agent-registration | 200 | https://docs.base.org/sdks/migrated-products | 2026-10-24T06:46:36Z | 306704 | 62b6fe246132 | MOVED_CONTENT_GONE | Redirects to the same 'have moved' page; no mention of 8004. Not usable as a source. |
| 27 | https://www.8004scan.io/ | 200 | https://8004scan.io/ | 2026-10-24T06:46:37Z | 293078 | b26770164108 | READ | Explorer home page, self-reported counters at fetch time: 1,532,032 registered agents, 803,622 feedback submitted, 29 networks. These are the site's own figures, not checked; compare the arXiv paper's finding that most registrations are placeholders. |
| 28 | https://github.com/sudeepb02/awesome-erc8004 | 200 |  | 2026-10-24T06:46:37Z | 677964 | 86e5263fa06b | READ | Community list. Used only as a pointer to the rows below it; each linked project was not verified. |
| 29 | https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc8004 | 200 |  | 2026-10-24T06:46:37Z | 41292 | 3d231b048e11 | READ | States 0G's ERC-8004 deployment is listed in the erc-8004-contracts repository and that the agentId space is one global counter on the Identity Registry. |
| 30 | https://registry.npmjs.org/@chaoschain/sdk | 200 |  | 2026-10-24T06:46:38Z | 88613 | 05ee835abff2 | READ | npm record: @chaoschain/sdk latest 0.3.3 (modified 2026-03-27), MIT. |
| 31 | https://www.8004.org/build | 200 |  | 2026-10-24T06:52:22Z | 1885 | d4abecbe1f8f | STATUS_ONLY | Developer hub per the awesome-list. Title only. |
| 32 | https://8004.org/ | 200 | https://www.8004.org/ | 2026-10-24T06:52:21Z | 1885 | d4abecbe1f8f | STATUS_ONLY | 'ERC-8004 Official Website' per the awesome-list. Title only. |
| 33 | https://github.com/erc-8004/best-practices | 200 |  | 2026-10-24T06:52:22Z | 236444 | ae97dd9b21c2 | READ | Repo exists with Registration.md and Reputation.md (file names only; contents not read). |
| 34 | https://sdk.ag0.xyz/ | none (UNABLE_TO_VERIFY_LEAF_SIGNATURE) |  | 2026-10-24T06:52:23Z |  |  | BLOCKED_ENV | TLS verification failed in Node; the certificate chain was issued by a Fortinet firewall on this machine's network (openssl shows a Fortinet issuer). Not read. Not bypassed. |
| 35 | https://github.com/ChaosChain/trustless-agents-erc-ri | 200 |  | 2026-10-24T06:52:24Z | 427869 | 2fe774092ee1 | STATUS_ONLY | Listed on the awesome-list as a reference implementation. Title only. |
| 36 | https://erc-8004.quicknode.com/ | 200 |  | 2026-10-24T06:52:25Z | 2250 | ef129b5b201f | STATUS_ONLY | Explorer per the awesome-list. 200; not read. |
| 37 | https://github.com/agent0lab/subgraph | 200 |  | 2026-10-24T06:52:25Z | 482094 | 358e9d4f604b | STATUS_ONLY | Listed as a subgraph for indexing ERC-8004. Title only. |
| 38 | https://agentscan.info/ | 200 |  | 2026-10-24T06:52:25Z | 69039 | b12b36a892b8 | STATUS_ONLY | Explorer per the awesome-list. Title only. |
| 39 | https://rnwy.com/scanner | 200 |  | 2026-10-24T06:52:26Z | 25646 | 48b56ed3f749 | STATUS_ONLY | A 'Sybil X-Ray Scanner' per its title. Not read; its method is unchecked. |
| 40 | https://github.com/erc-8004/erc-8004-contracts/issues/72 | 200 |  | 2026-10-24T06:52:26Z | 293801 | d68d05ade602 | STATUS_ONLY | Issue titled as an agent experience report on multi-chain registration. Not read. |
| 41 | https://repid-engine-production.up.railway.app/.well-known/agent-registration.json | 401 |  | 2026-10-24T07:15:52Z | 42 | 2f87557c2f97 | READ | The EIP's optional endpoint-domain proof path on the engine host answers HTTP 401. So the optional proof is not published there. |
| 42 | https://trustshell.dev/for/erc | 200 | https://www.trustshell.dev/for/erc | 2026-10-24T07:20:41Z | 36263 | c9f32bde8d33 | READ | Deployed /for/erc page (after PR #631). Its sentences and footnotes equal lib/audiences.ts on main. |
| 43 | https://repid-engine-production.up.railway.app/api/v1/agents/84f2d7de-5bb9-4f3b-92ca-aecc7c498271/reputation/feedback/1647.json | 200 |  | 2026-10-24T07:30:02Z | 656 | feeb51ea040c | READ | The off-chain feedback file for 6705 feedback #17 (value 1969, written 2026-10-19). 656 bytes; keccak256 of the bytes equals the on-chain feedbackHash 0x196293cd.... Has the EIP's required fields and a proofOfPayment object (see CONFORMANCE.md). |
| 44 | https://registry.npmjs.org/@hyperdag/trustshell | 200 |  | 2026-10-24T07:30:50Z | 123171 | f0cddbfc8253 | READ | npm record: @hyperdag/trustshell dist-tag latest = 1.8.0, published 2026-10-23 (next = 1.8.0-rc.0), engines node >=22.13.0. The registry record carries no file list; this tree's package.json `files` has dist/, README, CHANGELOG, LICENSE and a few scripts and bins, not examples/, so the ERC-8004 example runs from a clone, not from the npm package. |
| 45 | https://api.github.com/repos/DealAppSeo/repid-engine | 200 |  | 2026-10-24T07:34:10Z | 5494 | 5b650f13f803 | READ | GitHub API: repid-engine private=false, license Apache-2.0, default branch main, last push 2026-10-23. |

## x402 (21)

| # | URL (as requested) | HTTP | Final URL if different | Fetched (UTC) | Bytes | sha256 | State | What the source says (my paraphrase of what I read) |
|---|---|---|---|---|---|---|---|---|
| 1 | https://www.x402.org/ | 200 | https://x402.org/ | 2026-10-24T06:26:34Z | 42525 | 61e7aa534c01 | STATUS_ONLY | x402 home. Title empty; not read. |
| 2 | https://docs.x402.org/faq.md | 200 |  | 2026-10-24T06:26:35Z | 8269 | 9d2b6ba41387 | STATUS_ONLY | Docs FAQ. Not read. |
| 3 | https://github.com/x402-foundation/x402 | 200 |  | 2026-10-24T06:26:35Z | 355517 | ab76cdd3113c | READ | README: Apache-2.0; 'open standard'; reference SDK packages under @x402/*; payment schemes exact, upto, batch-settlement; specs under specs/. |
| 4 | https://github.com/x402-foundation/x402/tree/main/specs | 200 |  | 2026-10-24T06:26:36Z | 235371 | 9a543752409d | STATUS_ONLY | specs/ directory page. The file list came from gh-tree-x402. |
| 5 | https://docs.cdp.coinbase.com/x402/support/faq.md | 200 |  | 2026-10-24T06:26:37Z | 29669 | 0ddb1ed66dfb | STATUS_ONLY | CDP x402 FAQ. Not read. |
| 6 | https://github.com/coinbase/x402 | 200 |  | 2026-10-24T06:26:37Z | 354858 | 201c754395ba | STATUS_ONLY | coinbase/x402 repo page. A search summary called it a fork of the foundation repo; I did not read enough to say. |
| 7 | https://docs.cdp.coinbase.com/x402/welcome | 200 |  | 2026-10-24T06:26:38Z | 638375 | 6315fa557236 | STATUS_ONLY | CDP x402 docs landing. Title only. |
| 8 | https://registry.npmjs.org/@x402/core | 200 |  | 2026-10-24T06:26:38Z | 129916 | e4d547a143d7 | READ | npm record: @x402/core latest 2.28.0 (modified 2026-09-29), Apache-2.0. |
| 9 | https://developers.fireblocks.com/docs/x402-ecosystem.md | 200 |  | 2026-10-24T06:26:38Z | 4878 | 1a6076eb1af4 | STATUS_ONLY | Third-party ecosystem page. Not read. |
| 10 | https://x402.org/facilitator/supported | 200 |  | 2026-10-24T06:26:38Z | 1801 | ff310d048728 | READ | Live JSON from the x402.org testnet facilitator at fetch time: v2 exact, upto and batch-settlement on eip155:84532 (Base Sepolia) plus several non-EVM networks; a v1 entry for base-sepolia. |
| 11 | https://docs.cdp.coinbase.com/x402/seller/get-discovered | 200 |  | 2026-10-24T06:46:38Z | 770741 | d4a4d7bc1f5c | STATUS_ONLY | CDP Bazaar listing docs. A search summary quoted a resource count; I did not read it, so I do not repeat it. |
| 12 | https://docs.x402.org/llms.txt | 200 |  | 2026-10-24T06:46:38Z | 6316 | 75cd2b80c00c | READ | Docs index: lists Facilitator, Facilitators, Bazaar, third-party extensions, gas-sponsoring extensions, quickstarts. |
| 13 | https://www.cloudflare.com/press-releases/2025/cloudflare-and-coinbase-will-launch-x402-foundation/ | 200 | https://www.cloudflare.com/press/press-releases/2025/cloudflare-and-coinbase-will-launch-x402-foundation/ | 2026-10-24T06:46:39Z | 285433 | 2f096eb561b6 | STATUS_ONLY | Press release titled 'Cloudflare and Coinbase Will Launch x402 Foundation' (the URL carries 2025). Title only. |
| 14 | https://docs.cdp.coinbase.com/x402/bazaar.md | 200 | https://docs.cdp.coinbase.com/x402/buyer/discover-services.md | 2026-10-24T06:46:39Z | 6165 | 46c0756d3c78 | STATUS_ONLY | Redirects to the CDP discover-services page. Not read. |
| 15 | https://api.github.com/repos/x402-foundation/x402/git/trees/main?recursive=1 | 200 |  | 2026-10-24T06:46:39Z | 1139749 | 17841a05b0e0 | READ | specs/ lists schemes (exact, upto, batch-settlement, auth-capture) and extensions including offer-and-receipt, payment_identifier, bazaar, sign-in-with-x. |
| 16 | https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/extension-offer-and-receipt.md | 200 |  | 2026-10-24T06:52:26Z | 41408 | 51151bd2b7dd | READ | Optional extension: servers sign offers and, after delivery, signed receipts; lists dispute evidence and 'verifiable proof of commercial interactions for reputation systems' as uses. Says the wire shape is not stable, the behavioural rules are. |
| 17 | https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/payment_identifier.md | 200 |  | 2026-10-24T06:52:28Z | 3427 | a48b79d0c1fc | STATUS_ONLY | payment_identifier extension. Fetched; not read. |
| 18 | https://docs.x402.org/dev-tools/facilitators.md | 200 |  | 2026-10-24T06:52:28Z | 4901 | d0dbec596260 | READ | Lists selected production facilitators (Stellar, CDP, Celo, Corbits, Dexter, Fireblocks, others) and says the list is not exhaustive; says the public x402.org facilitator is for development/testnet and not intended as the mainnet default. |
| 19 | https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/exact/scheme_exact_evm.md | 200 |  | 2026-10-24T06:52:29Z | 21131 | 186111e25a5b | READ | Exact scheme on EVM. Example PaymentPayload: x402Version 2, resource, accepted{scheme, network eip155:84532, amount, asset, payTo, extra}, payload{signature, authorization{from,to,value,validAfter,validBefore,nonce}} in a PAYMENT-SIGNATURE header; validAfter/validBefore shown as strings. |
| 20 | https://docs.x402.org/core-concepts/facilitator.md | 200 |  | 2026-10-24T06:52:29Z | 10421 | 55532931f011 | READ | Flow uses PAYMENT-REQUIRED, PAYMENT-SIGNATURE and PAYMENT-RESPONSE headers (v2). |
| 21 | https://docs.x402.org/getting-started/quickstart-for-buyers.md | 200 |  | 2026-10-24T06:52:30Z | 27492 | 9c55a1eb4df2 | STATUS_ONLY | Buyer quickstart. Fetched; only skimmed for header and version words. |

## OpenClaw, and the incident reports the pages cite (37)

| # | URL (as requested) | HTTP | Final URL if different | Fetched (UTC) | Bytes | sha256 | State | What the source says (my paraphrase of what I read) |
|---|---|---|---|---|---|---|---|---|
| 1 | https://docs.openclaw.ai/ | 200 |  | 2026-10-24T06:26:38Z | 10605 | 469edde080c6 | STATUS_ONLY | Docs root. The index is openclaw-llms. |
| 2 | https://github.com/openclaw/openclaw | 200 |  | 2026-10-24T06:26:38Z | 979307 | 592188b2075c | STATUS_ONLY | OpenClaw repo page; MIT license shown. |
| 3 | https://github.com/openclaw/openclaw/issues/16052 | 200 |  | 2026-10-24T06:26:40Z | 287820 | af512ee59dee | READ | A user-filed issue, closed as not planned, reporting a malicious skill on a third-party directory (openclawdir.com) and citing CVE-2026-25253. Not an official advisory. |
| 4 | https://clawhub.ai/ | 200 |  | 2026-10-24T06:26:39Z | 141603 | baef5e9308ef | STATUS_ONLY | ClawHub site. Title only. |
| 5 | https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html | 200 |  | 2026-10-24T06:26:40Z | 175950 | 2bb808aeaafc | READ | States a Koi Security audit of 2,857 ClawHub skills found 341 malicious. |
| 6 | https://thehackernews.com/2026/02/openclaw-integrates-virustotal-scanning.html | 200 |  | 2026-10-24T06:26:42Z | 183527 | 1bec40f248e9 | READ | Cited on /for/openclaw as the source of '341'. The article (8 Feb 2026) reports OpenClaw adding VirusTotal scanning and mentions 'hundreds of malicious skills'; the number 341 does not appear in it. |
| 7 | https://www.digitalocean.com/resources/articles/openclaw-security-challenges | 200 |  | 2026-10-24T06:26:41Z | 274311 | f9f0edf1592f | READ | Published 27 Feb 2026. Says Koi found 341 of 2,857 skills malicious; Bitdefender's separate scan put it near 900; SecurityScorecard's STRIKE team found over 30,000 internet-exposed instances, tied to early defaults that trusted localhost behind a reverse proxy; a Moltbook database exposure. |
| 8 | https://esecurityplanet.com/threats/hundreds-of-malicious-skills-found-in-openclaws-clawhub | 200 | https://www.esecurityplanet.com/threats/hundreds-of-malicious-skills-found-in-openclaws-clawhub/ | 2026-10-24T06:26:42Z | 433704 | 489dab8dfac0 | READ | Koi: 341 malicious of 2,857, 335 from one campaign tracked as ClawHavoc. |
| 9 | https://oecd.ai/en/incidents/2025-07-19-1eb1 | 200 |  | 2026-10-24T06:26:42Z | 409516 | dca987c74af7 | READ | OECD AI Incident Monitor page (summary labelled AI generated): coding assistant used by SaaStr's founder deleted a live production database and fabricated data to cover the error. The words 'tests passed' / 'unit test' do not appear on it. |
| 10 | https://infosecurity-magazine.com/news/moltbook-exposes-user-data-api | 200 | https://www.infosecurity-magazine.com/news/moltbook-exposes-user-data-api/ | 2026-10-24T06:26:44Z | 104449 | 941afb6aa8c4 | READ | 3 Feb 2026: Wiz found a Supabase API key in client-side JavaScript with no row-level security; 1.5 million API tokens, 30,000 email addresses and private messages accessible; 17,000 human owners behind the agents. |
| 11 | https://oecd.ai/en/incidents/2026-05-04-4a73 | 200 |  | 2026-10-24T06:26:43Z | 151564 | df9445e11230 | READ | OECD AI Incident Monitor page (summary labelled AI generated): Morse code prompt via X led Grok and Bankrbot to transfer 3 billion DRB tokens worth $150,000-$200,000 on Base; its own analysis text says $155K-$180K. |
| 12 | https://incidentdatabase.ai/cite/1152 | 200 |  | 2026-10-24T06:31:17Z | 412276 | 1d7b81196cbb | READ | AI Incident Database entry: reportedly deleted a production database during a code freeze, produced fabricated test results and fake data. |
| 13 | https://www.fastcompany.com/91372483/replit-ceo-what-really-happened-when-ai-agent-wiped-jason-lemkins-database-exclusive | 403 |  | 2026-10-24T06:31:18Z | 775 | fbb0969b22e4 | BLOCKED_BOT | HTTP 403 to automated fetch. Not read, not bypassed. |
| 14 | https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident | 200 | https://www.theregister.com/software/2025/07/21/vibe-coding-service-replit-deleted-production-database/719783 | 2026-10-24T06:31:17Z | 183822 | 8214e5c2f46a | READ | The Register, 21 Jul 2025: quotes the owner saying the tool was 'lying about our unit test', creating fake data and fake reports. |
| 15 | https://docs.openclaw.ai/llms.txt | 200 |  | 2026-10-24T06:46:40Z | 219268 | 7c3695b3761c | READ | OpenClaw docs index (1,417 lines); used to find the security, plugin, hook and MCP pages below. |
| 16 | https://docs.openclaw.ai/skills.md | 200 |  | 2026-10-24T06:46:41Z | 48053 | 3b390fd640f6 | STATUS_ONLY | Skills docs. Fetched; not read beyond status. |
| 17 | https://www.techradar.com/pro/what-are-openclaw-skills-a-detailed-guide | 200 |  | 2026-10-24T06:46:41Z | 1979304 | 6f5a4f5a2bf7 | STATUS_ONLY | Secondary article. Not read. |
| 18 | https://docs.openclaw.ai/gateway/security/trust-model.md | 200 |  | 2026-10-24T06:52:29Z | 10479 | 7db123be60dc | READ | OpenClaw's own trust model: one trust boundary per gateway (not for mutually untrusted users); prompt-injection-only chains with no policy, auth or sandbox bypass are listed as not vulnerabilities by design. |
| 19 | https://docs.openclaw.ai/gateway/security.md | 200 |  | 2026-10-24T06:52:31Z | 14456 | 996758a2b5c8 | STATUS_ONLY | Gateway security overview. Fetched; not read. |
| 20 | https://docs.openclaw.ai/clawhub/security-audits.md | 200 |  | 2026-10-24T06:52:32Z | 18304 | 3e4463898ba0 | READ | Says ClawHub audits are strong safety signals but not a guarantee that a release is risk-free. |
| 21 | https://docs.openclaw.ai/help/faq/security-and-access-control.md | 200 |  | 2026-10-24T06:52:33Z | 7464 | e150435fd7cd | STATUS_ONLY | FAQ page. Fetched; not read. |
| 22 | https://docs.openclaw.ai/plugins/building-plugins.md | 200 |  | 2026-10-24T06:52:34Z | 19807 | af61a05cd3ff | STATUS_ONLY | Plugin building guide. Fetched; not read. |
| 23 | https://docs.openclaw.ai/automation/hooks/event-types.md | 200 |  | 2026-10-24T06:52:35Z | 10758 | cac73ab2db18 | READ | Documented INTERNAL hook events: command:new/reset/stop, session:auto-reset/compact/patch, agent:bootstrap, gateway:startup/shutdown/pre-restart, message:received/transcribed/preprocessed/sent. This page lists no per-tool-call event; tool hooks belong to the separate plugin-hook system (see openclaw-gh-tool-policy-hook). |
| 24 | https://docs.openclaw.ai/cli/security.md | 200 |  | 2026-10-24T06:52:37Z | 9838 | c3cb79949929 | STATUS_ONLY | `openclaw security` CLI page. Fetched; not read. |
| 25 | https://docs.openclaw.ai/cli/mcp/registry.md | 200 |  | 2026-10-24T07:15:51Z | 15726 | fd7fab77977f | READ | OpenClaw saves MCP server definitions under mcp.servers; the page says runtime adapters decide which transport shapes they support at execution time. |
| 26 | https://docs.openclaw.ai/gateway/config-extensions.md | 200 |  | 2026-10-24T07:15:52Z | 23128 | 486211a92a83 | READ | Extension config surfaces: mcp.*, skills.*, plugins.*, canvas.*. |
| 27 | https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-25253 | 200 |  | 2026-10-24T07:18:17Z | 2941 | f01f8c5a3da4 | READ | NVD (status Analyzed): OpenClaw before 2026.1.29 takes a gatewayUrl from the query string and opens a WebSocket without prompting, sending a token. CVSS 8.8 (secondary source). This is not a malicious-skill CVE, whatever the blog and the issue imply. |
| 28 | https://trustshell.dev/for/openclaw | 200 | https://www.trustshell.dev/for/openclaw | 2026-10-24T07:20:42Z | 41104 | 8d7da2e03cee | READ | Deployed /for/openclaw page (after PR #631). Footnote 3 cites the VirusTotal article for the 341 figure; fear 1 says tests had passed. See DRIFT_CHECK.md. |
| 29 | https://docs.openclaw.ai/plugins/architecture-internals.md | 200 |  | 2026-10-24T08:02:03Z | 8045 | 6cfa0fafa553 | STATUS_ONLY | Plugin internals page. Fetched; searched for a tool-call hook name (none found); not read. |
| 30 | https://docs.openclaw.ai/plugins/architecture.md | 200 |  | 2026-10-24T08:02:04Z | 88079 | 81cae33f9006 | STATUS_ONLY | Plugin capability model page. Fetched; searched for a tool-call hook name (none found); not read. |
| 31 | https://docs.openclaw.ai/plugins/sdk-entrypoints/tool-policy-and-sandbox.md | 200 |  | 2026-10-24T08:02:05Z | 5587 | cc33fb33fb61 | STATUS_ONLY | Plugin SDK tool-policy and sandbox helpers. Fetched; searched for a tool-call hook name (none found); not read. |
| 32 | https://docs.openclaw.ai/cli/policy.md | 200 |  | 2026-10-24T08:02:07Z | 4782 | 8e3b30f7ea45 | READ | The bundled Policy plugin is an enterprise conformance layer over existing OpenClaw settings, authored in policy.jsonc and reported through doctor --lint; the page says it does not enforce tool calls or rewrite runtime behavior at request time. |
| 33 | https://docs.openclaw.ai/cli/policy/rules.md | 200 |  | 2026-10-24T08:02:08Z | 20819 | 169748ad7c59 | STATUS_ONLY | Policy rule reference. Fetched; not read. |
| 34 | https://docs.openclaw.ai/gateway/security/tool-permissions.md | 200 |  | 2026-10-24T08:02:09Z | 15084 | abaaa528d157 | STATUS_ONLY | Tool and agent permissions page. Fetched; searched for a tool-call hook name (none found); not read. |
| 35 | https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/hooks/tool-policy.md | 200 |  | 2026-10-24T08:03:17Z | 15416 | 4004d167826d | READ | OpenClaw repo docs (found by a GitHub code search of openclaw/openclaw for before_tool_call; none of the docs.openclaw.ai pages I fetched named it). before_tool_call receives tool name, params, agent id, session and requester and can return block, rewritten params or requireApproval; after_tool_call receives params, result, error and duration. Codex native tools support blocking and observation but not rewrites. |
| 36 | https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/hooks.md | 200 |  | 2026-10-24T08:03:18Z | 19259 | 286d2db2db33 | READ | OpenClaw repo docs: plugin hooks overview. Three hook systems; a task-to-hook table (before_tool_call: block a tool or request approval); states the catalog is the registration API, not a promise that every runtime emits every hook. |
| 37 | https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/sdk-overview/events-and-hooks.md | 200 |  | 2026-10-24T08:03:19Z | 4534 | dc1990dc160e | STATUS_ONLY | Plugin SDK events and hooks page in the OpenClaw repo. Fetched; not read. |

## How to reproduce a row

```powershell
# status and a hash, the way the ledger took them (PowerShell 5.1)
(Invoke-WebRequest -UseBasicParsing -Uri 'https://eips.ethereum.org/EIPS/eip-8004' -Headers @{ 'User-Agent' = 'trustshell-lane-d-link-check/1.0' }).StatusCode
```

Pages change; a sha256 that differs from this ledger's is expected for live pages and is the point of recording it.
The raw bodies are in the lane's scratch folder, outside the repo, and are not committed.
