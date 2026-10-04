# MVP E2E receipts, 2026-10-04

Every file here was produced by a test run, not written by hand. Each JSON names the code it
tested (`git_sha`, or the npm version that installed), the engine it talked to, the time, and a
verdict per check. **Three outcomes, never two:** VERIFIED / MEASURED, NOT_CHECKED, FAILED.

All runs were against production (`repid-engine-production.up.railway.app`) unless marked
stubbed. The code under test was trustshell `2571858`.

## NORTH milestone 1, door by door

| Door | Receipt | Result | What it proves | What it does not |
|---|---|---|---|---|
| **Phone**, trustshell.dev/check | `check-walk.live.json` | **VERIFIED 8/8** | At a 390px phone viewport, real Groq + Cerebras votes return pass for a true sentence, veto for a false one and not-checked for an opinion. | `transport: relayed-by-runner`: in this agent sandbox the page's exact request was replayed to production with curl, because the browser's own hop through the sandbox relay took 7.9 s against a 6 s timeout. CI runners call production directly. The page is not deployed until trustshell #441 merges. |
| **Phone**, from a CI runner | e2e-honesty run [37212063038](https://github.com/DealAppSeo/trustshell/actions/runs/37212063038), artifact `receipts-browser` | **VERIFIED 8/8**, `transport: browser-direct` | The same live walk with the browser calling production itself, about 0.8 s per answer. This closes the relay caveat in the row above. Stubbed 13/13 in the same run. | The deployed page. That is `--deployed`, which runs daily once the follow-up to #441 merges. |
| **Phone**, every answer shape | `check-walk.stubbed.json` | **VERIFIED 13/13** | A 500, a hang past the timeout and an off-contract label all read not-checked, never pass. The request is the shared contract. A pasted `sb_secret_` is scrubbed before it leaves. Showing not-checked as pass turns 4 checks red. | That production returns those shapes. |
| **Terminal**, npm `latest` | `acceptance.npm-latest.json` | **FAILED** on `claim.check` and `repid.read` | npm still serves **1.4.0**. It has no `check "<sentence>"`: it answers with the run-URL usage error, exit 2. Its `repid --json` has no score. | — |
| **Terminal**, main packed as a publish would | `acceptance.packed-main.json` | **MEASURED** `claim.check` and `repid.read` | Built with `sdk:build`, as `prepublishOnly` does: `check` gives pass/0 and veto/1, and `repid` reads trinity-sophia = 1334. | That it is on npm. **1.5.0 has to be published (Sean)** for a stranger to get it. |
| **RepID + proof**, main packed | `e2e-mvp.packed-main.txt` | **7/7 OK** | verify PASS/VETO; getRepID; `proof --verify`; the CLI and MCP serve the same proof hash. | — |
| **Proof freshness** | both `acceptance.*.json` | **FAILED** `zkrepid.freshness` | The served proof is 10 days old. The proof pipeline works (a real proof lands seconds after a score event); trinity-sophia has not scored since 2026-09-24, and the product rule is 7 days. | Fixed only when idle agents are re-proved. CC1 is building that, behind a flag Sean switches. |

## Legs already accepted in the baseline (unchanged)

These are listed in `tests/e2e/acceptance-baseline.mjs`, each with its reason:

- `zkrepid.privacy` and `zkrepid.expiry_binding` (circuit work);
- `erc8004.identity_for_new_user` (keyless register never mints, by design);
- `x402.settlement` (not run: it moves testnet USDC).

`chain.reachable` and `erc8004.registry` are NOT_CHECKED here because this sandbox has no Base
Sepolia egress. The daily CI job runs them.

## Re-run

```bash
npm run test:check-walk                               # stubbed
npm run test:check-walk -- --live                     # production
RECEIPT_DIR=receipts node tests/e2e/harness-acceptance.mjs           # npm latest
npm run sdk:build && npm pack && node tests/e2e/harness-acceptance.mjs --version file:<tgz>
npm run e2e:mvp
npm run test:check-walk -- --deployed                 # the page trustshell.dev serves
```

`.github/workflows/e2e-honesty.yml` runs the gate and both phone-door modes every day and keeps
the receipts as run artifacts.
