# Draft — GitHub Release `v1.4.0`

**Do not `gh release create`.** Sean cuts the GitHub Release the same hour as F-PUBLISH (`npm publish @hyperdag/trustshell@1.4.0`). This file is the draft only.

npm `latest` today is **1.3.0**. Publishing 1.4.0 is a Sean gate.

## Notes (from CHANGELOG + #161)

### Spend guards (were missing on npm 1.3.0)
`guardedX402Payment` is the default spend entry: origin must be pay-capable, a policy must allow, audit before sign, then cap. `buildX402Payment` is the lower-level opt-out. Pinned by `tests/sdk-import-contract.mjs`.

### Honest returns
`verifyOutput` / `evaluate` carry measured `providersUsed` (not a constant 6). Live quorum: **2 answering / 8 configured**. `getRepID` mint/signer are null-with-reason when the endpoint does not expose them.

### A7 read-path
Landing `getSummary` filters to writer + attestor. Strangers posting `tag1=hyperdag_repid` do not enter the aggregate.

### Signer allowlist
`verifySigner` / `classifySigners` — unknowns returned and flagged, never dropped.

### CLI / MCP
`trustshell evaluate` is an alias of `verify`. CLI `proof --verify` and MCP `present_proof` share the same proof hash. `latestProofHash` is filled from `/proof` when `/repid` omits it.

### Site
Dead JWT (`eyJ…`) is refused as a browser Supabase key. Engine footer shows live `/health` `deployed_commit` or an honest unavailable.

### Not in this release
- Mainnet
- Grounding enforce (shadow only)
- Launch announcement language

## Install after F-PUBLISH

```bash
npm install @hyperdag/trustshell@1.4.0
```

Until then: `npm install @hyperdag/trustshell` → 1.3.0, or `github:DealAppSeo/trustshell` for main.
