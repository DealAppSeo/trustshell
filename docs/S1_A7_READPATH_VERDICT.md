# S1 — A7 read-path verdict

**Lane:** XC2 (`feat/xc2-2026-09-15-s1-readpath`). Draft. Do not merge.
**Date:** 2026-09-15. Synthetic fixtures only. No npm publish. No prod DDL.

`giveFeedback` on ERC-8004 ReputationRegistry is permissionless (XC A7:
`eth_call` from a throwaway wallet on token 6706 succeeded). Anyone can post
`tag1=hyperdag_repid` against our tokens. The engine never reads those rows back
into `current_repid`. The remaining question is whether a **shipped reader**
aggregates a stranger's row.

## Verdict

**Split, not a single label.**

| Path | What it reads | Filter | A7 |
|---|---|---|---|
| npm SDK `getRepID` → `GET /api/v1/repid/:id` | engine DB `current_repid` | n/a (no registry read) | **graffiti** |
| SDK `verifyOutput` → `POST /api/v1/hal/evaluate` | HAL, not registry | n/a | **graffiti** |
| SDK `presentProof` → `GET /api/v1/repid/:id/proof` | engine proof, not registry | n/a | **graffiti** |
| Engine `GET /api/v1/agents/:id/reputation/onchain` | `readHyperDAGFeedback` | writer wallet only | **graffiti** (diagnostic URL) |
| Landing `lib/onchain-repid.ts` `fetchAgentRepID` → `GET /api/agent-leaderboard` | `getClients` then `getSummary(tokenId, [...clients], …)` | **none** | **shipped incident** |

npm `@hyperdag/trustshell` `files[]` ships `dist/` only. The unfiltered call is
**not** in the published tarball. It **is** in the live Next app: `app/api/agent-leaderboard/route.ts`
calls `fetchLeaderboard()` → `fetchAgentRepID()` → unfiltered `getSummary`.

That is the incident this lane filters. A7 cannot move `current_repid`. A7 **can**
move the on-chain leaderboard number a visitor sees.

## Evidence (file:line, origin/main `4b77b2d`)

- **SDK getRepID is HTTP, not RPC** [VERIFIED read]
  `src/lib/trustshell.ts` `getRepID` → `verify` → `GET ${baseUrl}/api/v1/repid/${agentId}` (L761, L663–664).
  No `getSummary` / `readFeedback` / `getClients` in `src/lib/`.
- **Engine on-chain helper is writer-filtered** [VERIFIED read]
  `repid-engine/src/services/erc8004-reputation.ts` L144–158: comment says it filters
  by this writer's wallet; code passes `[hyperdagWallet]` to `getSummary`.
- **Landing call is unfiltered** [VERIFIED read]
  `lib/onchain-repid.ts` L93 `getClients(tokenId)`, L102
  `getSummary(tokenId, [...clients], 'hyperdag_repid', '')`.
  Consumer: `app/api/agent-leaderboard/route.ts` L2, L8.
- **Allowlist (not writer-only)** [VERIFIED T6 draft #158]
  Writer `0xb24268884472E7613aA58D38C8813f7Af1667382` + attestor
  `0xf6eE1768868c3266868edcA78bC41C50309cb22A`. Writer-only would silently drop
  the attestor. Filter keeps both; drops everyone else.

## What this PR does

1. This commit: the verdict + a test that **fails on the unfiltered `getSummary` call**.
2. Next commit: `clientsForHyperDagSummary` keeps writer+attestor, drops a stranger,
   and `fetchAgentRepID` uses it.

Home `/leaderboard` and `LiveTrustScores` already hit the engine, not this helper.
`/api/agent-leaderboard` is the remaining public on-chain aggregator.

XC1 lock (`src/scoring`, `migrations/2026-09-15*`, `scripts/adversarial-harness`,
`entity-caps.json`, branch `feat/xc-2026-09-15-x8-adversarial-harness`) is not touched.
