<!-- doc-version: historical (a dated record of what one run measured; it names versions as measured, not as current) -->

# Proof pack 2026-10-24: PASS

One command: `npm run proof-pack`. Each check is PASS, FAIL or NOT_CHECKED. NOT_CHECKED is never a pass, and a step that failed because the network, a quota or a provider failed says so (`cause`).

**Ruler:** pack `cbc8e7dc1c86` (this file), claims `60cefdb4cd68`. Packed `@hyperdag/trustshell@1.9.0-dev.0` (tarball `f5333e53f9f8`) from commit `9808dcf62c`; npm `latest` was `1.8.0`. Node v22.17.0, npm 10.9.2, ethers 6.17.0. Started 2026-10-24T09:06:24.612Z, took 503 s.

**Counts:** 70 PASS · 0 FAIL · 0 NOT_CHECKED, of 70 checks.

| Step | Verdict | s | What it ran |
|---|---|---|---|
| 0 | **PASS** | 226.5 | setup: pack this checkout, install it cold, find what npm serves<br>[npm] |
| 1a | **PASS** | 121.5 | check a pinned CI run (run 39619591025): one TRUE and one FALSE claim, packed vs published<br>[cmd] trustshell check <runUrl> --claims-file claims.txt --out <dir>   (api.github.com only) |
| 1b | **PASS** | 124.8 | check one sentence through the hosted checkers: a TRUE and a FALSE one, packed vs published<br>[cmd] trustshell check "<sentence>" --json   (POST /api/v1/classify; paced <= 2.9 requests/minute) |
| 2 | **PASS** | 1.8 | the receipt in hand, verified OFFLINE (no socket may open)<br>[pack] RFC 8785 digest recomputed here · [shipped] digestRecord() · [shipped cmd] trustshell inspect |
| 3 | **PASS** | 4.4 | TAMPER NEGATIVE CONTROL: change one character, the verifiers must FAIL<br>[pack] + [shipped cmd] trustshell inspect |
| 4 | **PASS** | 1.3 | ERC-8004 on Base Sepolia, READ-ONLY (eth_chainId / eth_getCode / eth_call, public RPC)<br>[rpc] eth_call against the IdentityRegistry |
| 5 | **PASS** | 13.1 | pay gate: receipt BEFORE payment (guardedX402Payment + writeReceipt; the SDK's EIP-3009 envelope, not an x402 v2 payload), local devnet only<br>[shipped fn] guardedX402Payment from the packed tarball · [devnet] chain 31337 |

## 0. setup: pack this checkout, install it cold, find what npm serves

- **PASS** npm view @hyperdag/trustshell version (what a stranger gets from @latest) (12357 ms): latest is 1.8.0
- **PASS** npm pack this checkout (15415 ms): @hyperdag/trustshell@1.9.0-dev.0, 135 files, 367082 bytes
- **PASS** install the packed tarball cold into an empty dir (73633 ms): installed 1.9.0-dev.0 in 73630 ms
- **PASS** install the published @hyperdag/trustshell@1.8.0 cold into an empty dir (65230 ms): installed 1.8.0 in 65225 ms
- **PASS** install the packed tarball + ethers (the README: ethers only if you sign x402) (59862 ms): ethers 6.17.0

## 1a. check a pinned CI run (run 39619591025): one TRUE and one FALSE claim, packed vs published

- **PASS** packed: true claim -> exit 0, SUPPORTED (13089 ms): exit 0, 2 claims SUPPORTED
- **PASS** published: true claim -> exit 0, SUPPORTED (45702 ms): exit 0, 2 claims SUPPORTED
- **PASS** packed and published agree on the true claim (exit code and per-claim statuses) (1 ms): same exit code and statuses
- **PASS** packed: false claim -> exit 1, CONTRADICTED (16387 ms): exit 1, 1 CONTRADICTED
- **PASS** published: false claim -> exit 1, CONTRADICTED (37660 ms): exit 1, 1 CONTRADICTED
- **PASS** packed and published agree on the false claim (exit code and per-claim statuses) (0 ms): same exit code and statuses
- **PASS** packed: the check discriminates (true and false claims get different results) (0 ms): exit 0 vs 1
- **PASS** published: the check discriminates (true and false claims get different results) (0 ms): exit 0 vs 1
- **PASS** packed: the TRUE claim in a CRLF+BOM file (what PowerShell 5.1 writes) gives the same record (8668 ms): same statuses as the LF file

## 1b. check one sentence through the hosted checkers: a TRUE and a FALSE one, packed vs published

- **PASS** packed: "The capital of France is Paris." -> pass (13689 ms): pass (exit 0) by votes groq(gpt-oss)=TRUE cerebras(qwen)=TRUE in 178 ms
- **PASS** published: "The capital of France is Paris." -> pass (37024 ms): pass (exit 0) by votes groq(gpt-oss)=TRUE cerebras(qwen)=TRUE in 313 ms
- **PASS** packed and published agree on the true sentence (0 ms): both said pass
- **PASS** packed: "The Eiffel Tower is located in Rome, Italy." -> veto (22680 ms): veto (exit 1) by votes groq(gpt-oss)=FALSE cerebras(qwen)=FALSE in 208 ms
- **PASS** published: "The Eiffel Tower is located in Rome, Italy." -> veto (51447 ms): veto (exit 1) by votes groq(gpt-oss)=FALSE cerebras(qwen)=FALSE in 279 ms
- **PASS** packed and published agree on the false sentence (0 ms): both said veto

## 2. the receipt in hand, verified OFFLINE (no socket may open)

- **PASS** control: the offline guard blocks a connect attempt (439 ms): a fetch from a guarded process threw and was logged
- **PASS** packed/true: record.json digest recomputed offline equals the digest in the file (1 ms): sha-256 4a26d03a6631ed3e… over RFC 8785
- **PASS** packed/true: the digest in card.md's footer equals the record's (1 ms): card footer, record.json and recomputation agree
- **PASS** packed/true: the shipped digestRecord() agrees with this file's own RFC 8785 code (1 ms): two independent implementations, same digest
- **PASS** packed/false: record.json digest recomputed offline equals the digest in the file (1 ms): sha-256 3a8f9b78b45a65fd… over RFC 8785
- **PASS** packed/false: the digest in card.md's footer equals the record's (0 ms): card footer, record.json and recomputation agree
- **PASS** packed/false: the shipped digestRecord() agrees with this file's own RFC 8785 code (1 ms): two independent implementations, same digest
- **PASS** published/true: record.json digest recomputed offline equals the digest in the file (0 ms): sha-256 37ca583304c6a557… over RFC 8785
- **PASS** published/true: the digest in card.md's footer equals the record's (0 ms): card footer, record.json and recomputation agree
- **PASS** published/true: the shipped digestRecord() agrees with this file's own RFC 8785 code (2 ms): two independent implementations, same digest
- **PASS** published/false: record.json digest recomputed offline equals the digest in the file (0 ms): sha-256 d261b41005adf270… over RFC 8785
- **PASS** published/false: the digest in card.md's footer equals the record's (0 ms): card footer, record.json and recomputation agree
- **PASS** published/false: the shipped digestRecord() agrees with this file's own RFC 8785 code (2 ms): two independent implementations, same digest
- **PASS** packed: shipped `inspect` on an untouched 5-entry chained log -> INTACT (positive control) (655 ms): INTACT, exit 0, 653 ms
- **PASS** published: shipped `inspect` on an untouched 5-entry chained log -> INTACT (positive control) (714 ms): INTACT, exit 0, 712 ms
- **PASS** no network connect was attempted by any offline verifier (0 ms): 0 connect attempts logged by the guard

## 3. TAMPER NEGATIVE CONTROL: change one character, the verifiers must FAIL

- **PASS** packed: shipped `inspect` after "flip one hex digit of one output_sha256" -> BROKEN (551 ms): BROKEN, exit 1
- **PASS** packed: shipped `inspect` after "delete one middle line" -> BROKEN (440 ms): BROKEN, exit 1
- **PASS** published: shipped `inspect` after "flip one hex digit of one output_sha256" -> BROKEN (1196 ms): BROKEN, exit 1
- **PASS** published: shipped `inspect` after "delete one middle line" -> BROKEN (2164 ms): BROKEN, exit 1
- **PASS** packed/true: record.json after changing one hex character of observation.head_sha -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** packed/true: record.json after changing one hex digit of digest.value -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** packed/false: record.json after changing one hex character of observation.head_sha -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** packed/false: record.json after changing one hex digit of digest.value -> digest check FAILS (2 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** published/true: record.json after changing one hex character of observation.head_sha -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** published/true: record.json after changing one hex digit of digest.value -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** published/false: record.json after changing one hex character of observation.head_sha -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees
- **PASS** published/false: record.json after changing one hex digit of digest.value -> digest check FAILS (1 ms): digest mismatch; the shipped digestRecord() also disagrees

## 4. ERC-8004 on Base Sepolia, READ-ONLY (eth_chainId / eth_getCode / eth_call, public RPC)

- **PASS** a public RPC answers as Base Sepolia (chain id 84532) (558 ms): sepolia.base.org answered 0x14a34
- **PASS** the IdentityRegistry 0x8004A818BFB912233c491871b3d84c89A494BD9e has contract code, and the README names it (216 ms): 130 bytes of code; README names the address
- **PASS** an ERC-721 read decodes (supportsInterface(0x80ac58cd), name(), symbol()) (267 ms): {"erc721":true,"name":"AgentIdentity","symbol":"AGENT"}
- **PASS** info: ownerOf(6706) on the IdentityRegistry (not scored) (93 ms): owner 0xf6ee1768868c3266868edca78bc41c50309cb22a
- **PASS** the ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713 has contract code (83 ms): 130 bytes of code
- **PASS** control: the same address with its last hex digit changed has NO code (the check can say no) (84 ms): 0x8004A818BFB912233c491871b3d84c89A494BD90 -> 0x
- **PASS** only read methods were sent (0 ms): eth_call, eth_chainId, eth_getCode

## 5. pay gate: receipt BEFORE payment (guardedX402Payment + writeReceipt; the SDK's EIP-3009 envelope, not an x402 v2 payload), local devnet only

- **PASS** the gate is exported by the packed tarball (0 ms): guardedX402Payment is a function
- **PASS** receipt OK -> a payment header is produced, receipt written BEFORE the signature (177 ms): events receipt:write -> sign; 1 audit row; receipt file receipt-e318a87f.json
- **PASS** the signature recovers to the payer under the chain-31337 domain (20 ms): recovered 0x3E9D8B9f… = payer; to = payee
- **PASS** NEGATIVE CONTROL: the receipt writer THROWS -> the payment REFUSES and nothing is signed (15 ms): refused: receipt invalid (injected); events receipt:throw; 0 signatures
- **PASS** NEGATIVE CONTROL: the receipt cannot really be written (ENOTDIR) -> REFUSES, nothing signed (2 ms): refused: ENOTDIR
- **PASS** origin Unknown -> origin_refused, no receipt written, nothing signed (0 ms): refused before any receipt
- **PASS** no policy -> policy_required, no receipt written, nothing signed (0 ms): refused; 1 audit row written first
- **PASS** policy denies -> policy_denied, no receipt written, nothing signed (1 ms): refused before any receipt
- **PASS** amount over the cap -> cap_exceeded, nothing signed (94 ms): refused; events receipt:write
- **PASS** CONTROL: with NO writeReceipt the same payment signs (so the refusals above are caused by the gate) (1 ms): signed without a receipt: the gate is opt-in
- **PASS** a local Hardhat node answers as chain 31337 (devnet.mjs proves it before anything runs) (12737 ms): http://127.0.0.1:62708 up in 12629 ms
- **PASS** devnet run: receipt written, then a header signed for chain 31337 (0 ms): receipt:write -> sign
- **PASS** the authorization is bound to chain 31337: it does NOT recover to the payer under the Base Sepolia (84532) domain (42 ms): recovers under 31337, not under 84532
- **PASS** nothing was sent to the devnet: same block number, payer nonce 0 (26 ms): block 0 before and after; nonce 0
- **PASS** egress during this step: loopback only, no Base Sepolia contact (1 ms): hosts: 127.0.0.1

## What this pack observed about itself (limits, not verdicts)

- **inspect-unkeyed** (observed): an edited log whose later hashes were re-derived verified INTACT (exit 0); inspect's own card says an INTACT chain has no trusted anchor. the tamper control proves inspect catches an edit that leaves later hashes alone, not a log rewritten end to end
- **no-shipped-record-verifier** (observed): searched: the --help text of packed 1.9.0-dev.0 and published 1.8.0. Offline verbs found: {"packed":["verify \"<text>\"            Run <text> through the live HAL cross-provider fact-check","evaluate \"<text>\"          Alias of verify. Same HAL quorum, same exits.","badge <agentIdOrSlug>      Fetch + client-side-verify the proof, then emit a portable,","receipt <receiptId>        Read a policy-kernel receipt back (GET /api/v1/kernel/receipt/:","inspect [<path>]          Verify an append-only tool-call log. Reads a local file and","bundle export <file>       CARRY: one Ed25519-signed file (this install's key, never in th","bundle verify <file> [--signer <fingerprint>]","bundle context <file> [--signer <fingerprint>]","bundle import <file> [--signer <fingerprint>] [--force]","guard sign                 Sign the policy with this install's key (the owner signature a ","traps                      List the ten local fixture HAL claims. Each row is NOT_CHECKED ","2  usage / bad arguments                            · verify: HAL did not decide (NOT_CHEC","verify · repid · proof · badge · status · bind-status   the HyperDAG backend (TRUSTSHELL_A","receipt                          the HyperDAG backend (TRUSTSHELL_API_URL), /api/v1/kernel","inspect                          NOTHING. Reads a local file.","bundle · guard                   NOTHING. Local files only.","REPID_API_KEY        optional API key (verify/repid/proof are keyless; receipt needs it)","trustshell verify \"$(cat CHANGELOG_CLAIM.txt)\" || exit 1"],"published":["verify \"<text>\"            Run <text> through the live HAL cross-provider fact-check","evaluate \"<text>\"          Alias of verify. Same HAL quorum, same exits.","badge <agentIdOrSlug>      Fetch + client-side-verify the proof, then emit a portable,","receipt <receiptId>        Read a policy-kernel receipt back (GET /api/v1/kernel/receipt/:","inspect [<path>]          Verify an append-only tool-call log. Reads a local file and","traps                      List the ten local fixture HAL claims. Each row is NOT_CHECKED ","2  usage / bad arguments                            · verify: HAL did not decide (NOT_CHEC","verify · repid · proof · badge · status · bind-status   the HyperDAG backend (TRUSTSHELL_A","receipt                          the HyperDAG backend (TRUSTSHELL_API_URL), /api/v1/kernel","inspect                          NOTHING. Reads a local file.","REPID_API_KEY        optional API key (verify/repid/proof are keyless; receipt needs it)","trustshell verify \"$(cat CHANGELOG_CLAIM.txt)\" || exit 1"]}. step 2 verifies record.json with this file's own RFC 8785 code and the deep-imported digestRecord(); no `trustshell` command re-checks the digest a card prints NOT searched: the SDK exports other than digestRecord (deep import), the MCP server tools, trustshell.dev/inspect in a browser.
- **envelope-not-x402-spec** (observed): the signed header decodes to a flat object with keys from, to, value, validAfter, validBefore, nonce, signature; the x402 exact/EVM spec payload is nested (x402Version, accepted, payload{signature, authorization}). step 5 shows the TrustShell escrow envelope (EIP-3009). It does not show interoperability with an x402 facilitator (spec: x402-foundation/x402, specs/schemes/exact/scheme_exact_evm.md; first observed by the ERC-8004/x402 lane on 2026-10-24)
- **receipt-written-before-cap-check** (observed): an over-cap spend wrote a receipt (events receipt:write) and was then refused by buildX402Payment. the receipt gate runs before the cap check, so a refused spend can leave a receipt behind
- **receipt-gate-is-opt-in** (observed): with no writeReceipt the same call signed (events sign). the gate exists only for callers that pass writeReceipt; omitting it pays with no receipt
- **devnet-does-not-settle** (observed): the arena devnet is a bare Hardhat node with no contracts, so no EIP-3009 token exists on it. the gate step proves refusal, ordering, signing and chain-binding; it does not settle a transfer on chain 31337

## What a pass here does not prove

- A PASS on step 1b is two hosted model checkers agreeing on one sentence. It is a second opinion, not a proof.
- Step 2 shows a record has not changed since it was made. It is unsigned: it does not show who made it, and `inspect` has no trusted anchor.
- Step 4 reads two contracts on a test network. It does not show any agent holds a token or that its reputation is earned.
- Step 5 shows the gate refuses and orders its steps. Nothing was settled on chain, a caller can omit the gate, and the header is the flat EIP-3009 envelope the TrustShell escrow endpoint reads, not the x402 v2 payload: it shows no interoperability with an x402 facilitator.

Reproduce: `npm run proof-pack` from a clone of DealAppSeo/trustshell, Node >= 22. Exit 0 all PASS, 1 any FAIL, 2 some NOT_CHECKED, 3 setup error.
