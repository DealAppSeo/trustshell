# OVERNIGHT 2026-11-01 — the plan Grok and Chat agree on

Written 2026-11-01 01:10 PT by Claude (cloud session) at Sean's request: "consider Chat's
recommendations fully before Grok's alone, then loop all night on what they agree on."
Every scheduled run tonight reads this file first. The run log is `OVERNIGHT_RUN_LEDGER.md`
on the same branch (`overnight/2026-11-01`).

## 1. Where Grok and Chat agree (work these, in this order)

Order follows Chat's sequence (L0 → L1 → L2 → L3) where it differs from Grok's list.

| # | Item | Grok said | Chat said | Already on main? |
|---|---|---|---|---|
| 0 | Free-token circuit breaker (docs + stub) | #5, "required before any long loop" | "Build first", no paid fallback | Unchecked |
| 1 | Truthful baseline: `SECURITY_GAP_MATRIX.md`, `CONTAINMENT_MATRIX.md` | #1 | Loop 0 (+ THREAT_MODEL, ledger) | No |
| 2 | Settlement: actor from key, evidence pays once, no self/sibling rating | #2 | Loop 1 | **Mostly yes: repid-engine #1470** (merged 2026-10-31). Tonight = find what #1470 left untested, do not rebuild |
| 3 | Thin default-deny policy kernel, signed owner policy, attenuation | #4 | Loop 2 | No (Guard is cooperative-only, CHANGELOG) |
| 4 | Claim-honesty sweep + shared conformance tests | #3 | Loop 3 (first half) | Partly (#657, #1469 wording) |

### Chat's correction to the kernel, adopted
Stake is **not** an authority ceiling. Authority = min(owner grant, domain RepID eligibility,
safety floor). RepID qualifies an agent inside the owner's ceiling; it never raises it.
Money is a **separate** cap (posted stake, budget, velocity). A missing or invalid input
returns DENY or NOT_CHECKED, never allow. Child capabilities ⊆ parent capabilities.

### Item 2: what #1470 already proves vs what to check tonight
Proved by #1470's tests: parallel ratings pay once; retry after success pays nothing; failed
claim pays nothing; self / same-owner / unknown-owner verifier refused; revoked key refused.
Still open from Chat's Loop 1 list (verify each; add a test only where it is missing):
two agents reuse one proof · same owner, different wallets · reused event across chains ·
repeated transfers in one transaction · missing RPC data · related-party refund cycle ·
ownership transfer mid-settlement · whether uniqueness is a DB constraint (not only an app check).
If a fix needs production DDL: write the migration + nonprod test, label it HIGH, do not apply.

## 2. Deferred (one side only, or both say later)
Typed signed receipt event, airlock/memory classes, T12 adversarial sim (Grok: not until
items 1-4 are on main; Chat gates it on prerequisites too), staging E2E, earned-autonomy
scoring, MicroVMs, TEEs, full CaMeL, ZK circuits, real staking.

## 3. Merge rule for tonight (Sean, 2026-11-01 01:04 PT)
Sean authorized merging LOW and MEDIUM PRs tonight so he does not wake to a stale pile.
This overrides `MERGE_POLICY.md`'s "nobody merges their own PR" **for tonight only**, and
only when ALL of these hold on the PR's **current head commit**:

1. `check` green and GitHub shows no conflict.
2. Strix verdict posted for that head with no unresolved finding (mark ready first; after a
   fix push, comment `@strix-security` and wait again).
3. A **captured Grok review of that head** that approves. Grok's output must exist as a
   real artifact (PR comment from the Grok app/bot, or a dispatch transcript under
   `reports/`). No captured Grok output = NOT_CHECKED = **do not merge**. Claude may not
   stand in for Grok.
4. Risk computed from changed files, not declared:
   - LOW: docs, tests only, wording.
   - MEDIUM: non-money, non-reputation-write code; policy kernel in shadow/opt-in.
   - HIGH (never merge tonight): any migration, settlement or RepID write path, payments,
     keys, auth, CI permissions, branch rules, `package.json` version, label contract.
5. Nothing on MERGE_POLICY's never-list: no `REAL_STAKING`, token move, key, prod DDL,
   Railway env, `npm publish`, "launched" language.

Squash-merge, then record the PR, head SHA, Strix link and Grok link in the ledger.
Anything that fails a condition stays open and goes in the morning list.

## 4. Each run (hourly, 6 runs max)
1. Read this file, `OVERNIGHT_RUN_LEDGER.md`, repid-engine `LESSONS.md`.
2. If the ledger shows a run started < 50 minutes ago and not finished, exit (no overlap).
3. Write "run N started" to the ledger and push.
4. First, sweep open PRs from earlier runs: apply §3; merge what qualifies.
5. Take the lowest-numbered unfinished item in §1. One item per run.
   Inspect → write failing test → smallest fix → full `npm run verify` (trustshell) or the
   repo's CI command → PR (ready, not draft) → request Grok review via the existing cloud
   dispatch (`dispatch-agent-cloud.yml`, agent `xc`) if no Grok review arrives on its own.
6. Same test fails twice → record BLOCKED with the reason, move to the next item.
7. Write the ledger: item, PR link, head SHA, tests run/failed/skipped, Strix, Grok, merged?
8. Push notification to Sean only when a decision is his (HIGH PR, blocker, Grok unavailable).

## 5. Circuit breaker for tonight's runs
These runs use Claude, not free open-source tokens; the free-token breaker in item 0 is for
future T12 loops. Tonight's caps: 6 runs, one item each, stop at 07:30 PT, stop early when
§1 is done. Stop all consequential writes on a security-invariant failure, an unexpected
skip, or a secret in output; record it and notify Sean.

## 6. Never tonight
npm publish, prod DDL, mainnet, Railway env/restart, key rotation, real stake, weakening a
check or branch rule, "MVP launched", turning NOT_CHECKED into PASS.
