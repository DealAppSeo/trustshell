# Changelog

All notable changes to the `@hyperdag/trustshell` package.

## Unreleased

- **A miss never reads as a pass.** HAL can answer without deciding: it abstains, returns no
  decision, or falls back to a mode that asked no provider. Until now `verify`, the MCP `verify`
  tools and `verifyOutput()` reported every one of those as `PASS`, "trust 100/100", exit 0, and
  `wrapExecute` released the output even with `onUnavailable: 'withhold'`. They are now a fourth
  verdict, `NOT_CHECKED`:
  - `verify` exits **2**, the same code `check "<sentence>"` uses for not-checked, so a CI gate
    written as `trustshell verify … || exit 1` fails on it instead of passing.
  - `verifyOutput().ok` is `false`, and `trustScore` is 0: no trust was earned.
  - `wrapExecute` treats it as HAL not deciding, so `onUnavailable` chooses.
  - "You have a receipt." prints only when a receipt was actually written.
  - The opt-in Laya lane (`TRUSTSHELL_LAYA`) exits 2 for its "not checked" line, not 0.
- **A veto nobody voted for is not a veto.** When HAL lists its providers' answers and not one
  said TRUE or FALSE (all UNCERTAIN or errored), the result is `NOT_CHECKED`, whatever `decision`
  says. The server's default score mode reports `vetoed` for an all-UNCERTAIN answer (it scores
  0.5, which meets the 0.5 threshold), so `verify` printed VETO 50/100 for a claim nobody judged
  false. The extension's verify path applies the same rule. One real TRUE or FALSE vote leaves the
  server's decision unchanged.
- An accuracy figure cited in `wrap-execute.ts` and the reference agent ("82.6%, 95/115
  TruthEval") is removed: no stored run reproduces it.
- **Releases publish through npm trusted publishing.** CI publishes with a short-lived token that
  GitHub's OIDC identity earns for this one package, not a stored npm token. npm also attaches a
  provenance attestation linking each version to the workflow run that built it. `package.json`
  now names the repository, which that check requires. The CLI and MCP tools are unchanged.
- **One scrubber on every door, and it catches more.** Before anything leaves the machine, the
  scrubber removes known secret and personal-data formats. It used to catch ten token shapes and
  miss AWS and Google keys, Stripe `sk_live_` keys, private keys (64-hex and PEM), most database
  URLs, labelled passwords, webhook URLs, and every personal-data shape. It now catches all of
  them, plus emails, phone numbers written with separators, dashed US SSNs, card numbers (only when
  Luhn-valid) and IBANs (only when the checksum holds), so ordinary numbers in a claim are kept.
  - The Chrome extension now scrubs too. Its stamp and verify calls used to send the raw reply.
    Each now sends only scrubbed text, and sends **nothing** if the scrubber failed to load.
    `extension/scrub.js` ports `src/memory/redact.ts`, and `tests/scrub-parity.test.ts` fails if
    the two disagree on any input in the corpus.
  - `check "<sentence>"`, the MCP `check_claim` tool and trustshell.dev/check now say when
    something was removed (`scrubbed: true` in JSON), because the label is then about what was
    sent. A sentence that is nothing but a key is refused locally, and nothing is sent.
  - `remember` refuses the same credential shapes, so a key is never written to the plain-text
    memory file. Notes holding an email or a phone number are still stored: memory is local.
  - It removes formats, not meaning. A name, an address or a health detail written in prose is
    not caught.
- **Every answer says what produced it.** When the classify endpoint reports its path (`by`:
  arithmetic, votes, skipped or deadline, and `voters` for votes), `check "<sentence>"`, the MCP
  `check_claim` tool, trustshell.dev/check and the extension stamp show one line:
  - "Decided by exact calculation. No model was asked."
  - "Groq and Cerebras both said false."
  - "No checker was asked."
  An endpoint that does not report it gets no line; nothing is guessed. The extension's chatgpt
  and grok scripts used to rebuild each answer and drop every field but the label, so they could
  never have shown it. `tests/claim-path-parity.test.ts` keeps the CLI and extension wording identical.
- **The privacy table is enforced for more commands.** `check:egress` now runs `remember`,
  `recall` and `redact` with the network stubbed (`remember` with encryption on), and runs
  `check "<sentence>"`: it fails unless the sentence form reaches only the backend's
  `/api/v1/classify`, once, with a pasted email removed from what was sent. The three memory
  commands are now rows in the egress table in the README and the API reference.
- The npm page now links the site and the issue tracker (`homepage`, `bugs`).
- **The right-click check speaks the stamp's words.** "Check with TrustShell" on selected text
  used to show a bare `pass`, `veto` or `not-checked`. It now shows Checks out / Caught / Not
  checked plus the line saying what produced it, with the machine label in the tooltip. The
  words come from the same file as the stamp, so the two cannot disagree.
- **One clarifying question, when the checkers ask it.** When the classify endpoint returns a
  `question` (repid-engine `CLASSIFY_QUESTIONS`, off until it is switched on), `check
  "<sentence>"` prints it and the MCP `check_claim` result carries it. On trustshell.dev/check a box
  appears: the person's answer is added to the claim ("… Assume: <answer>.") and checked again, on
  their click only. A question appears only on a not-checked from the votes. The client refuses
  links, emails, markup and anything outside 10–160 characters ending in "?".
- **`TRUSTSHELL_MEMORY_ENCRYPT=on` now encrypts.** The setting existed and nothing read it, so
  every note went to disk in plain text while the setting said otherwise. `remember`, `recall` and
  the MCP `remember` / `recall` tools now seal notes and values with AES-256-GCM under
  `TRUSTSHELL_MEMORY_KEY` (scrypt, with a random salt per memory file). With the flag on and no
  key, `remember` writes nothing. Without the key, `recall` shows a placeholder, never ciphertext.
  See `docs/api-reference.md`.

## 1.5.0 — 2026-10-04

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
