# TrustShell MVP status — LOOP SPRINTS Sprint 1

Date: 2026-09-09
Sprint: 1 of 6 (Sprint 0 STATUS written from `ad507d6`; this section is the leftover check).
Cap 6 sprints / 4 hours. Unattended from here.
No merge. No publish. No x402 spend. No live infra.

## Branch

`feat/mvp-five` @ `ad507d6` (this file is the Sprint 0 rewrite on top of that tip).
Parent: `2915d59` — `feat/check-egress-2026-09-08` HEAD. Same tree as `cc0faeb` (#117 on main).
MVP commits are **not** on `feat/check-egress-2026-09-08`.

Commits on this branch after `2915d59`:

| SHA | Message |
|---|---|
| `d824455` | feat: close in-tree MVP five — example, CI claim, live-vs-paused table |
| `67af614` | docs: pin STATUS.md to 7507eb2 |
| `ad507d6` | docs: do not tell a stranger to npx an unpublished version |

package.json: 1.4.0 unpublished. npm latest: 1.3.0. This session used this tree's `dist/`, not npm.

## AGENTS.md LOOP SPRINTS

Appended after the existing text (heading `## LOOP SPRINTS`). Present. CLAUDE.md still `@AGENTS.md`.

## 18/18

```
npx jest tests/doc-version.test.ts tests/mvp-example.test.ts tests/ci-readme-claim.test.ts tests/readme-honesty.test.ts --no-coverage
```

Exit: **0**. 4 suites, **18 passed**, 0 failed. Measured after rebase onto `2915d59`.

## Three-state README table

`README.md` `### Live vs paused` — states **live** | **live-degraded** | **paused/blocked**.

HAL `verifyOutput()` / `trustshell verify` is **live-degraded**, not live.
Quorum 2026-09-09: **2/6** providers funded (groq TRUE, openrouter TRUE; gemini credits, mistral rate-limit, zai balance, cerebras model 404 — CC-ASSESS). Partial quorum. Backend funding, not a trustshell code bug.

## Unpublished npx pin

No markdown documents `npx` of unpublished `@hyperdag/trustshell` at 1.4.0.
Enforced by `tests/doc-version.test.ts` (`unpublished 1.4.0 is not an npx command`).
`docs/MORNING.md` uses `node dist/cli/index.js check` from this tree.

## CI uses this tree's dist

`.github/workflows/readme-claim.yml` — `on: pull_request` only.
Steps: `npm ci` → `npm run sdk:build` → `node dist/cli/index.js verify "The capital of France is Paris."`
Does not call the published 1.3.0 package.

## Shipped on this branch (already measured)

| Surface | Command | Exit |
|---|---|---|
| Fresh-clone example | `node examples/quickstart/quickstart.mjs` | 0 — init ok; Paris PASS 100; Rome VETO 0; getRepID trinity-shofet 2150 ESTABLISHED; import `../../dist/lib/index.js` |
| CLI PASS | `node dist/cli/index.js verify "The capital of France is Paris."` | 0 |
| CLI VETO | `node dist/cli/index.js verify "The Eiffel Tower is located in Rome, Italy."` | 1 |
| MCP verify_output Paris | TrustShell MCP | PASS 100, partial quorum |
| MCP get_repid trinity-shofet | TrustShell MCP | 2150 ESTABLISHED |

README REAL: Paris claim only (HAL PASS). Other table rows NARRATIVE.

## Limits (do not paper over)

- Publish 1.4.0 is out of scope. Strangers still get npm 1.3.0.
- HAL live-degraded 2/6. Next: inventory in repid-engine, not a trustshell patch.
- Local `npm run verify` hit stale `.next/dev` types (ENV). `check.yml` is a clean checkout.
- HAL VETO (UNCERTAIN/UNCERTAIN) on x402/Base Sepolia wording. That row stays NARRATIVE.
- `readme-claim.yml` exists; required-check status NOT CHECKABLE this session.

## CC leftover on feat/mvp-five (Sprint 1 input)

CC-ASSESS remaining flags: (1) publish 1.4.0 — **forbidden this loop**. (2) `sdk:test` publish-gate pattern — publish path, not this loop. (3) README live-degraded row — **done**. No in-scope leftover must-fix on this repo.

---

PROMOTE: (what I may merge later) feat/mvp-five in-tree five criteria + LOOP SPRINTS block + unpublished-npx guard. Human merge only. Not this session.

HOLD: feat/mvp-five — do not merge

KILL: nothing unless you found a lie

PULL-NEXT: none (queue done; see loop recap at bottom)

---

## Sprint 1 — leftover must-fix on feat/mvp-five

CC-ASSESS flags that remain:

| Flag | In this loop? |
|---|---|
| Publish 1.4.0 | No — forbidden |
| `sdk:test` publish-gate pattern | No — publish path |
| README HAL live-degraded | Already done on this branch |

No in-scope leftover must-fix. Did not start a second trustshell issue.

---

## Loop recap (sprints 0–4). Cap not hit. Queue exhausted.

| Sprint | Repo | Branch | Result |
|---|---|---|---|
| 0 | trustshell | feat/mvp-five | STATUS from shipped `ad507d6`. 18/18. |
| 1 | trustshell | feat/mvp-five | CC leftover = publish only. Skipped. |
| 2 | repid-engine | feat/hyp-5-egress-inventory @ `5a3c9f0a` | HYP-5 inventory. CALLSITES=12 pinned hosts. Guard 8/8. No live egress change. |
| 3 | repid-engine | feat/hyp-5-egress-inventory @ `90a12586` | HAL 6-provider inventory. 2-of-3 = `quorum:partial` not `degraded`. fact-check 23/23. No keys. |
| 4 | trustmarket | feat/shadow-hal-verify-claim @ `ca8caa4` | Shadow verify-a-claim stub. `buy:false`. NOT_CHECKED. node:test 2/2. No buy. |

No merge. No publish. No x402. No live infra. No new product folders. No TrustMedical. Linear HYP-5 was reachable.

---

PROMOTE: (what I may merge later) feat/mvp-five in-tree MVP close; optionally hyp-5 inventory tests and trustmarket shadow stub after review.

HOLD: feat/mvp-five — do not merge

KILL: nothing unless you found a lie

PULL-NEXT: none
