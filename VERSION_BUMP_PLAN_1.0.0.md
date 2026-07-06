# @hyperdag/trustshell — 1.0.0 Version-Bump Plan (STAGED — do NOT publish here)

Status: **staged for Sean**. This branch (`feat/cc-2026-07-06-trustshell-1.0`) does NOT
bump the version and does NOT publish. Sean publishes.

## The reconciliation this bump encodes

`package.json` on `main` says **0.4.1**. npm `latest` is **0.6.1** (published 2026-05-24).
They are **not** a simple lag — they are two divergent lineages:

| | npm 0.6.1 (published) | local `main` / this branch (SDK) |
|---|---|---|
| Surface | CLI-first: `bin: trustshell`, `commander`, `x402/`, `reputation.*` | SDK class in `src/lib/trustshell.ts` |
| Methods | `evaluate` / `report` / `getLLMTrustScore` / `payAndEscrow` / `getReputationHistory` / `getAttestation` | `init` / `verifyOutput` / `score` / `getRepID` / `verify` / `presentProof` / `executeA2A` / `audit` |
| Deps | `commander`, `ethers` | `@hyperdag/proof-verifier`, `ethers` (dependency diet) |
| Tarball | 59 files | **6 files** (dist SDK output only) |

The V1 roadmap + the LOOP B spec reference the **SDK surface** (`init`/`verifyOutput`/…),
so that is the canonical v1.0 API. The published 0.6.1 CLI surface is the older line.
We therefore bump **past** 0.6.1 to **1.0.0** (a major, which correctly signals the API
change) rather than syncing `main` down to the 0.6.1 CLI design.

## What changes 0.6.1 → 1.0.0

**Breaking (why it's a major):**
- Primary API is the `TrustShell` **class** with `init()`/`verifyOutput()`/`getRepID()`/
  `presentProof()`/`executeA2A()` — replaces 0.6.1's `evaluate`/`report`/`payAndEscrow`/
  `getReputationHistory`/`getAttestation`.
- The standalone CLI (`bin: trustshell`, `commander`) and the `x402/` + `reputation`
  client exports from 0.6.1 are **not** in this line. If any consumer depends on the
  0.6.1 CLI, that is a breaking removal (hence major, not minor).

**Fixed in this branch:**
- `exports` map now includes `import`/`default` (was `require`+`types` only) → ESM
  `import { TrustShell }` resolves. This was a hard blocker for ESM consumers.
- `dist/` reconciled to the actual `src/lib` SDK output — removed orphaned
  `dist/cli`, `dist/x402`, `dist/reputation.*`, `dist/types.*` that had no source and
  would have shipped as dead JS under `files:["dist/"]`.
- `sdk:build` is self-cleaning (`sdk:clean` rm -rf dist first) so the drift can't recur.

**Added:**
- `examples/quickstart/` (verified ≤60s: ~14s install-to-first-verified-call live).
- `examples/reference-agent/` (a trust-wrapped agent gating output via `verifyOutput`).
- `tests/e2e/wrapper-readiness.test.ts` live harness + `test:wrapper-readiness` script.

## Exact steps for Sean to publish 1.0.0 (in order)

1. **Review + merge** this branch (`feat/cc-2026-07-06-trustshell-1.0`) into `main`.
2. **Decide the API story vs 0.6.1.** Either (a) accept the SDK surface as 1.0 and
   treat the 0.6.1 CLI as deprecated, or (b) if the CLI must survive, plan to re-add it
   under `bin` in a later minor. (Recommendation: ship SDK as 1.0; CLI can return in 1.1.)
3. **Bump the version:** in `package.json` set `"version": "1.0.0"`. (Do NOT `npm version`
   with a git tag until step 6 unless you want the tag now.)
4. **Update README + add CHANGELOG.md**: README currently references `X402Client` /
   `getReputationHistory` (0.6.1 surface) in a couple of places — align the API section
   to the SDK surface (`init`/`verifyOutput`/`getRepID`/`presentProof`). Add a
   `CHANGELOG.md` 1.0.0 entry summarizing the breaking change above.
5. **Clean build + pack check:**
   ```bash
   npm run sdk:build          # self-cleans dist; must exit 0
   npm pack                    # confirm the tarball is the 6-file SDK set
   tar -tzf hyperdag-trustshell-1.0.0.tgz   # sanity: no cli/ x402/ reputation.* orphans
   ```
6. **Pre-publish gauntlet (fresh clone/sandbox):** run `examples/quickstart/quickstart.mjs`
   against the published-to-staging (or the local tarball) to confirm ESM import + the
   live `init()`→`verifyOutput()` path from a clean `node_modules`.
7. **Publish:** `npm publish --access public` (Sean's npm auth; `publishConfig.access`
   is already `public`). Tag `latest`.
8. **Post-publish smoke:** in a throwaway dir, `npm install @hyperdag/trustshell@1.0.0`
   and re-run the quickstart to prove the published artifact works.

## Known non-blocking follow-ups (not required for 1.0, flag for Sean)
- README API section still shows a few 0.6.1-lineage symbols (`X402Client`) — cosmetic,
  fix in step 4.
- The default export (`import TrustShell from`) binds to the module namespace under
  Node's CJS→ESM interop; the **named** import is the documented path. If you want a
  clean default too, publish the SDK as ESM (`"type":"module"` + `module` build target)
  in a future minor — out of scope for 1.0.
- Live HAL rolled-up `verdict` under-calls VETO when the provider quorum is degraded
  (backend provider-key/rate-limit issue, not the SDK). The SDK surfaces raw `halScore`
  + `evidence` correctly. Tracked in engine state, not a trustshell blocker.
