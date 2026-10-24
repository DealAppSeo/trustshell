# Proof pack

One command that runs the checks behind the headline claims and prints PASS, FAIL or NOT_CHECKED for each, with the receipt in hand.

```bash
npm run proof-pack        # from a clone of DealAppSeo/trustshell; Node 22 or newer; no key, no account
```

Windows PowerShell is the same command. It needs the internet (npm, api.github.com, a public Base Sepolia RPC, and the hosted checkers for step 1b). It installs into a temp directory and deletes it.

| Step | What it runs | Control that must fail |
|---|---|---|
| 1a | `check <runUrl> --claims-file` on a pinned CI run: one true and one false claim, from the packed tarball and from `npx @hyperdag/trustshell@latest`; the two must agree | the true and the false claim must get different results |
| 1b | `check "<sentence>"` through the hosted checkers, packed and published (this one leaves your machine) | a true and a false sentence must get different labels |
| 2 | the receipt (`record.json`) verified offline: digest recomputed here (RFC 8785 + SHA-256) and by the shipped `digestRecord()`; the shipped `inspect` on a chained log. A guard makes any network connect throw | the guard must block a connect |
| 3 | tamper: change one character of the record, or of the log | each verifier must pass the untouched copy and fail the changed one |
| 4 | ERC-8004 on Base Sepolia, read only (`eth_chainId`, `eth_getCode`, `eth_call`) | a one-nibble-wrong address must have no code |
| 5 | `guardedX402Payment` with a `writeReceipt` gate, a throwaway key, a local Hardhat devnet if one is available | a throwing or unwritable receipt must refuse the payment; with no gate the same call signs |

Exit codes: `0` every check PASS, `1` any FAIL, `2` nothing failed but something is NOT_CHECKED, `3` the pack could not start. NOT_CHECKED is never a pass.

The first published call of a run is exactly `npx @hyperdag/trustshell@latest`. On a loaded laptop each re-resolution of `@latest` took 150 to 300 seconds, so the later published calls in the same run pin the version `npm view` just returned and prefer the cache.

A check that cannot run because the network, a quota or a provider failed says so in `cause` (`network`, `quota`, `provider`, `rpc`, `npm`, `devnet`, `timeout`). A model label that is the opposite of the expected one is `quality` and is a FAIL. The report carries the pack's own SHA-256 and the SHA-256 of the claims it asked, so two runs are comparable only when both match.

## Can the pack fail?

A pack that has never failed has not shown it can. Two tests answer that, both included here:

```bash
npm run test:proof-pack-controls   # offline, seconds: a verifier that always says ok, one that always says no, and a tamper that changes nothing are all caught
npm run test:proof-pack-mutants    # needs npm; about a minute per mutant: runs the pack against three deliberately broken copies of this checkout's tarball
```

Measured 2026-10-24: with `inspect` made to ignore a changed line, the pack FAILED step 3 (1 check); with the pay gate made to swallow a receipt failure and sign anyway, step 5 (2 checks); with `digestRecord` made to return a constant, step 2 (8 checks). All three exited 1. `--tarball <file>` is the option that makes this possible, and is also how to run the pack against a build you made yourself.

Options: `--skip hosted,published,erc8004,devnet,gate`, `--tarball <file>`, `--out-dir`, `--stem`, `--runs-log <file>`, `--keep`. The hosted checkers are paced to 2.9 requests a minute, and the pack stops asking after a 429 or after `--hosted-daily-cap` calls (default 60) in a UTC day.

For step 5 on a devnet, set `PROOF_PACK_DEVNET_MODULE` (a `devnet.mjs` exporting `startDevnet({dir})`) and `PROOF_PACK_DEVNET_DIR` (a folder with `hardhat` installed). Without them that part is NOT_CHECKED and the gate checks still run, without a chain.

## What a pass does not prove

- Step 1b is two hosted model checkers agreeing on one sentence: a second opinion, not proof.
- Step 2 shows a record has not changed since it was made. It is unsigned, so it does not show who made it, and `inspect`'s chain has no trusted anchor.
- Step 4 reads two contracts on a test network. It does not show that any agent holds a token or that a reputation is earned.
- Step 5 shows the gate refuses and orders its steps. Nothing is settled on chain, a caller can leave the gate out, and the header is the SDK's flat EIP-3009 envelope, not the x402 v2 payload, so it says nothing about x402 interoperability.
- The packed tarball is built from the committed `dist/`; the pack does not rebuild it.

Dated runs sit beside this file as `proof-pack-<date>.json` and `.md`. Each lists, under "limits", what the pack observed about itself.
