# TrustShell MVP status

Date: 2026-09-09
Tree: feat/mvp-five @ 7507eb2
package.json: 1.4.0 (not published).
Published npm latest: 1.3.0 — not used below.
Global CLI, if invoked, is 1.3.0 — not used below.

LOOP SPRINTS: 3 of 6 used. Docs below are NARRATIVE until a named HAL PASS.
No merge to main. No publish.

## Verdict: HOLD

In-tree five criteria are met on this branch. LOOP SPRINTS does not get the production switch. The stranger path still installs 1.3.0; that gap is out of scope and is a limit, not a workaround. Human decides whether to merge.

Not KILL: the three gaps closed, live example ran, CLI exit 0/1 matched the contract, MCP dogfood returned real values.

Not PROMOTE: no merge, no publish, HAL on the x402/Base Sepolia wording was VETO (providers UNCERTAIN), local `npm run verify` did not finish because of stale `.next/dev` types.

---

## 1. Fresh-clone example

Command: `node examples/quickstart/quickstart.mjs`
Exit: 0
init: backend healthy (status=ok)
verifyOutput Paris: PASS trustScore=100 halScore=0.000
  evidence: groq:TRUE | openrouter:TRUE (partial quorum)
verifyOutput Rome: VETO trustScore=0 halScore=0.998
  evidence: groq:FALSE | openrouter:FALSE
getRepID trinity-shofet: repid=2150 tier=ESTABLISHED
Wall-clock: 6.0s from init through two verdicts + getRepID

Import: `../../dist/lib/index.js` (this tree). Not the published package.

## 2. CLI gate (in-repo dist, 1.4.0)

Command: `node dist/cli/index.js verify "The capital of France is Paris."`
Exit: 0
Output: PASS trust 100/100 — hal_score 0 via fact-check (partial quorum)
  groq:TRUE, openrouter:TRUE

Command: `node dist/cli/index.js verify "The Eiffel Tower is located in Rome, Italy."`
Exit: 1
Output: VETO trust 0/100 — hal_score 0.9975 via fact-check (partial quorum)
  groq:FALSE, openrouter:FALSE

CI: `.github/workflows/readme-claim.yml` added, `on: pull_request` only, runs `node dist/cli/index.js verify` after `npm run sdk:build`. Not observed as a GitHub Actions run this session (github MCP not used). NARRATIVE as a required check.

## 3. MCP dogfood (project-scoped TrustShell MCP)

`verify_output` "The capital of France is Paris."
→ verdict PASS, trustScore 100, sdkOk true
→ decisionReason: PASS — hal_score 0 via fact-check (partial quorum)
→ evidence: groq:TRUE (Paris is the capital of France.) | openrouter:TRUE (Paris is the capital of France.)
→ HAL PASS. This is the README claim.

`get_repid` trinity-shofet
→ agentId trinity-shofet, repid 2150, tier ESTABLISHED, lastAnchorTx null, latestProofHash null

Not called: buy_service. No x402 spend.

## 4. README

Live-vs-paused table present. Three states: live | live-degraded | paused/blocked.
HAL `verifyOutput` row is live-degraded (2/6 providers), not live.
Deny-list test: pass (unit).

README REAL: only the Paris claim has HAL PASS. Other table rows stay NARRATIVE.
Auxiliary HAL of "x402 … Base Sepolia, not Ethereum mainnet": VETO, trustScore 50, groq UNCERTAIN, openrouter UNCERTAIN. Do not treat that row as REAL.

## 5. Agent files

AGENTS.md: LOOP SPRINTS block appended; one launch-invite line rewritten so it does not tell a stranger to npx an unpublished version. CLAUDE.md unchanged, still `@AGENTS.md`.

## Unit tests (this ticket)

```
npx jest tests/mvp-example.test.ts tests/ci-readme-claim.test.ts tests/readme-honesty.test.ts tests/docs.test.ts --no-coverage
```
Exit: 0 — 4 suites, 52 tests.

```
npx jest --testPathIgnorePatterns /node_modules/ tests/e2e/ --passWithNoTests
```
Exit: 0 — 24 suites, 299 tests.

## Limits

1. **1.3.0 vs 1.4.0 (publish).** Out of scope. Strangers running `npx` / `npm i` get 1.3.0. This session used `node dist/cli/index.js` and `../../dist/lib/index.js`. Do not publish from here.

2. **HAL live-degraded.** Partial quorum: 2 providers (groq, openrouter). README table says live-degraded. Backend funding, not a trustshell code bug.

3. **`npm run verify` locally exit 1.** `tsc --noEmit` → TS2307 `.next/dev/types/validator.ts` cannot find `app/harness/page.js`. ENV/CONFIG: stale Next generated types on this machine. `check.yml` does a clean checkout without `.next/dev`. Jest half not reached because of `&&`. `node scripts/check-doc-version.cjs` → VERIFIED (exit 0) after handoff lines were split so "npm latest is 1.3.0" is not read as "this package is 1.3.0". `npx jest tests/doc-version.test.ts` plus the three MVP suites: 17/17 pass.

4. **HAL VETO on x402/Base Sepolia wording.** Providers UNCERTAIN. Stopped marking that sentence REAL. Did not change product copy to satisfy HAL. Did not spend x402 to "prove" it.

5. **readme-claim.yml** is not observed as a GitHub required check. File exists. Whether GitHub requires it: NOT CHECKABLE — github MCP not used.

6. **No markdown documents npx of unpublished 1.4.0.** Test-enforced. `docs/MORNING.md` now runs `node dist/cli/index.js check` from this tree.

## Branch

MVP commits live on `feat/mvp-five` only. `feat/check-egress-2026-09-08` is not the commit target. `feat/mvp-five` is replayed onto that branch's HEAD (`2915d59`, same tree as `cc0faeb`) so it is off that HEAD without landing MVP on the egress branch.

## Files touched

- tests/mvp-example.test.ts (create)
- tests/ci-readme-claim.test.ts (create)
- tests/readme-honesty.test.ts (create)
- examples/quickstart/quickstart.mjs
- examples/quickstart/QUICKSTART.md
- .github/workflows/readme-claim.yml (create)
- README.md (table only)
- AGENTS.md (LOOP SPRINTS append; unpublished npx line removed)
- docs/MORNING.md (check via this tree's dist CLI)
- tests/doc-version.test.ts (no unpublished npx command in markdown)
- docs/handoff/PLAN.md
- docs/handoff/STATUS.md
- docs/handoff/CC-ASSESS.md (rephrase only so the version walker does not treat "npm latest is 1.3.0" as "this package is 1.3.0")

Not touched: src/cli, src/lib, src/mcp, CLAUDE.md, examples/ci-gate, package.json.
