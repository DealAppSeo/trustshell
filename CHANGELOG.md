# Changelog

All notable changes to the `@hyperdag/trustshell` package.

## 1.5.0 — unreleased (it publishes when the `v1.5.0` tag is pushed)

**Why 1.5.0 and not 1.4.1.** This release adds commands and MCP tools, which makes it a minor
release. The list below is MEASURED, not read from the git log: npm's 1.4.0 was cut on 2026-09-23
from a tree that is not in git, so on 2026-10-04 the published 1.4.0 tarball was compared with
`npm run sdk:build` of main.

### Fixes for a stranger installing 1.4.0 today

Both are legs of the cold-install gate (`tests/e2e/harness-acceptance.mjs`), and both FAIL on
npm 1.4.0 and pass on this tree packed as a publish would.

- **`trustshell check "<sentence>"`** gives pass / veto / not-checked (exit 0 / 1 / 2). It uses the
  same classify route as the Chrome extension and trustshell.dev/check. On 1.4.0 the command
  answers with the run-URL usage error. `check <runUrl>` is unchanged. (`claim.check`)
- **`trustshell repid <id> --json`** reads the live `{score, tier}` shape. A missing score is now
  an error, not "RepID undefined" (#429). (`repid.read`)

### New CLI commands (not in 1.4.0)

- `remember`, `recall`, `redact`: a local note store at `~/.trustshell/memory.sqlite`. There are no
  network calls, and secret-shaped values are refused. It uses Node's built-in `node:sqlite`, so it
  adds no native dependency. On Node versions without it, these commands answer NOT_CHECKED.
- `status`, `bind-status`: what this agent can do, read from the engine. Anything unread is
  NOT_CHECKED, and `can_stake` is shown as shadow, never live.
- `traps`: the fixture claims used to test a checker.

### New MCP tools (1.4.0 had `evaluate`, `present_proof`, `verify`)

`check_claim`, `get_repid`, `repid`, `verify_proof`, `verify_output`, `remember`, `recall`,
`redact`, `status`.

### Secret handling

Outbound escalate packs and the local store now refuse or strip more token shapes:
- GitHub `ghp_`/`ghu_`/`ghr_`;
- GitLab `glpat-`/`gloas-`;
- Slack `xoxr-`;
- npm `npm_`;
- Hugging Face `hf_`;
- `Bearer` tokens and `sk-` keys.

These landed in #329 through #393.

### Receipt

`docs/receipts/2026-10-04/acceptance.1.5.0-candidate.json` is this tree built with `sdk:build`,
packed with `npm pack`, installed cold and run through the gate.

## 1.4.0 — 2026-09-23

### Security / x402 spend guards — published surface

**What npm users on the currently published build are missing, stated plainly:** the published
package exports `buildX402Payment` and `executeA2A` **only**. The spend guards
— `guardedX402Payment`, `assertOriginCanPay`, `auditThenAct`, and `TrustShell#getAllowance` —
were added after that release was cut and exist only on `main`. So anyone installing the published
version and wiring `buildX402Payment` directly gets the **raw payment builder with no origin check,
no audit hook, and no spend cap**: an unstamped/`Unknown` turn can pay, a spend with no policy can
sign, and nothing records the intent before the signature.

- **Guarded is the default.** `guardedX402Payment` is the documented spend entry: the turn `origin`
  must be pay-capable (`Unknown`/undefined **refuses**), a `policy` must allow the spend (its absence
  **refuses**), the intent is audited **before** the signature (a receipt-write failure **refuses**),
  and only then does `buildX402Payment` sign the EIP-3009 x402 header (which still enforces the cap).
  `buildX402Payment` remains available as the **explicit, lower-level opt-out**, not the default.
- **The four guards are pinned to the built package entry** by `tests/sdk-import-contract.mjs` (§5),
  so a future publish cannot ship the unguarded surface again.
- Refusal behaviour is covered by `tests/guarded-payment.test.ts` (Unknown-origin refused; missing
  policy refused with the intent row recorded first; audit-before-act holds even if the allowance
  reader throws), `tests/origin.test.ts`, and `tests/x402-cap.test.ts` (over-cap refused).

**This release IS that publish.** The guards above were previously on `main` only, so every npm
user was installing the unguarded surface. 1.4.0 closes that gap: `guardedX402Payment`,
`assertOriginCanPay`, `auditThenAct` and `TrustShell#getAllowance` are now in the published
package, pinned to the built entry by `tests/sdk-import-contract.mjs` (§5).

Also newly reachable for npm users: the `check`, `init`, `inspect` and `report` CLI commands, which
answered `error: unknown command` on 1.3.0 because the build predated them.
