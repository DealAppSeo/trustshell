# STATUS: the stranger path

Branch `claude/bold-turing-icz50x-stranger-path`. Night sprint, 2026-10-12. Maintained by CC1. Nothing here is merged; Sean clicks in the morning.

Outcomes are VERIFIED / NOT_CHECKED / FAILED, each with the command that produced it. A sim not run is not a pass.

## The four things for Sean

1. **The PRs, green.** See "PRs" below. Live state is on the PR, not in this file.
2. **The stranger transcripts, with what failed.** `docs/stranger-sims/`.
3. **The tutorial on the four screens.** The words are in `lib/stranger-path.ts` and print ON the real pages (`components/stranger-rail.tsx`). The screens, in order: `/agents` (name it), `/belts` (pick a belt or skip), `/check` (run one check, read the receipt), `/after-create` (the offer). There is no tour route.
4. **The one flag still off, and why.** `REAL_STAKING` and `HUMAN_AGENT_BIND_ENABLED` were not touched. Staking stays practice-only: a test-network stake credits a figure the spend gate does not honour. The one thing that stays off for a *stranger* is the on-chain ERC-8004 mint: it is key-gated, so the offer says "Not offered yet" instead of hiding it.

## What this branch changes

| # | Item | Outcome | Evidence |
|---|---|---|---|
| 0 | Three recon patches folded in (CLI joins unquoted `verify`/`evaluate`; `/api/agent-leaderboard` frozen-Result 503; `home-stats-walk` retarget; extension README hosts) | VERIFIED | `npx jest tests/cli.test.ts` 24/24; `node tests/e2e/home-stats-walk.mjs` 6/6 |
| 1 | The four screens as one flow, tutorial ON them | VERIFIED (stubbed engine) | `node tests/e2e/stranger-path-walk.mjs` 140/140 at 390px and 1280px |
| 1b | Suggest-a-skill stores a link, does not install | VERIFIED | e2e: refuses `javascript:` and `http:`, stores `https:`, saved link is plain text (no anchor), the browser requested nothing outside app + engine; `tests/skill-links.test.ts` |
| 2 | Faucet screen: points at public faucets, reads the balance back, never dispenses | VERIFIED against a stub; the live balance read is NOT_CHECKED in-browser | e2e: bad address sends nothing, empty wallet reads 0, funded reads back, engine down is "Not checked" and shows no number, a `javascript:` faucet link is dropped, no POST. Live `GET /api/v1/faucet/info` and `/balance` answered from this sandbox with CORS for `trustshell.dev` (curl, 2026-10-12) |
| 3 | Two-field RepID (score + ERC-8004 ID): passport guard, extension popup, CLI, MCP | VERIFIED | `tests/erc8004-display.test.ts`, `tests/extension-agent.test.ts`, `tests/identity.test.ts`; e2e passport pages: a txhash / `pending-mint` / `javascript:` in the engine's data is not printed |
| 4 | Honesty: `/repid` copy, `/hal-receipt` FIXTURE banner, dead `live-trust-scores.tsx` removed | VERIFIED | e2e checks; engine source read at `origin/main` 673edf44 (see below) |
| 5 | Phone + desktop width for the four screens | VERIFIED | same walk, both widths, no sideways scroll on any of the screens |
| 6 | Stale committed `dist/` | VERIFIED | `dist/` rebuilt and committed; `tests/sdk-dist-fresh.test.ts` fails if it ever differs from `tsc` output (negative control run: fails on a stale or missing file) |
| 7 | Coverage where there was none: `depositStake`, the faucet, the passport guard | VERIFIED | `tests/deposit-stake.test.ts`, `tests/faucet.test.ts`, `tests/erc8004-display.test.ts` |
| + | Practice stake only after the agent is bound | VERIFIED (stubbed engine) | e2e: unbound = button held; unreadable bind record = held ("Not checked is not bound"); bound = one deposit sent with no tx hash and no signature |
| + | A cold install without `ethers` refuses in the open | VERIFIED | `tests/kernel-client-no-ethers.test.ts`; the sim shows the refusal now says `npm i ethers@^6` (it said only `MissingDependencyError`) |

## Facts that were checked, and how

- **`/repid` copy.** Read `repid-engine` `origin/main` (673edf44): `getEcosystemNeedWeight` is passed into `scoreChallengeOutcome` and scales a challenge win or loss; it does **not** multiply the fixed deltas or a prediction. The constitutional audit is gated by `CONSTITUTIONAL_AUDIT_ENABLED`, default off, and does not steer the delta. The engine's own CLAUDE.md says the weight is "computed and never applied"; the source has moved since that was measured, and the page now follows the source.
- **PROVISIONAL / SETTLED.** In the engine this label is on the kernel receipt (`src/kernel/receipt.ts`). **NOT_CHECKED:** whether the score pipeline (`updateRepId`) itself reads the label. `/repid` therefore says what the receipt says and that a check made on this site writes nothing to a score, and does not claim the pipeline enforces it.
- **Engine CORS.** `Origin: https://trustshell.dev` is answered for `/faucet/*`, `/passport/*`, `/repid/*`. `Origin: chrome-extension://…` on `/repid/*` is a 500 (the extension only works because `host_permissions` omits the Origin). That is the engine PR.

## Publishing

`main` is not what is on npm. Published `@hyperdag/trustshell@1.6.0` does not have the kernel client, `my_job`, the unquoted-`verify` fix or the `identity` field. **The next `npm publish` needs a version bump** (a version can never be reused). Not done here. <!-- doc-version: historical -->

The extension popup now shows the ERC-8004 ID line. The published Chrome test build (`extension.zip` v1.0.0) does not have it until the extension is re-released.

## CI findings on the way (PR #518)

- **`main`'s own `check` was red before this branch.** #517 bumped `@types/node` 20 to 26, which no longer declares `Array.prototype.at`, so `tests/agents-journey.test.ts` stopped type-checking under `tsconfig.sdk.json` (ES2020). It passed locally only because the shared checkout's `node_modules` still has `@types/node` 20.19.39 while the lockfile has 26.6.4: measuring the wrong toolchain. Fixed here in one line (`STEPS[STEPS.length - 1]`); verified with the lockfile's `@types/node` and `--no-cache`. **A dependabot major got merged that the ignore list was meant to stop; Sean may want to look at that.**
- **gitleaks, 3 findings** (rule `generic-api-key`): the public Base Sepolia USDC contract address, in a faucet stub (`tests/faucet.test.ts` once, `tests/e2e/stranger-path-walk.mjs` twice). Not secrets. The field was unused by the parser, so it was removed from the stubs, and the offending commit was squashed away (own branch, force-push with lease) so no flagged commit stays in the range.
- **CodeQL, 3 high** (`js/incomplete-url-substring-sanitization`, all in `tests/e2e/stranger-path-walk.mjs`): URL substring matches. Replaced by exact membership on a `data-skill-url` attribute and by `new URL(u).hostname ===`.

## Open questions for Sean

- **The extension's default mode is AUTO** (empty storage on a fresh install), which sends on its own. Sean's spec says "nothing sent until the click." Changing a shipped default is a product decision and was **not** changed here. The scrubber work on its own branch removes the danger of a secret leaving in either mode; the default itself is yours.

## Not done

- The engine PR (open-CORS mount for `/repid`, `/proof`, `/passport`, `/faucet/*`, and mint status on `/repid/:id`) is **not this branch's**: the coordinator reassigned it to the engine lane (CC2) on 2026-10-12. This branch only reads those routes. Until it lands, the extension popup works only because `host_permissions` makes Chromium omit the Origin; real Chrome stable stays NOT_CHECKED.
- A stranger-side on-chain ERC-8004 mint: key-gated, GO-gated, not built. The offer says so.
- The data fix for the 11 placeholder ERC-8004 addresses in the engine/database. The web page no longer prints them; the rows are still wrong.

## PRs

- DealAppSeo/trustshell **#518** (draft): this branch.
