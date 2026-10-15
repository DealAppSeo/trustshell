# Changelog

All notable changes to the `@hyperdag/trustshell` package.

## 1.7.0 — 2026-10-16

New commands, exports and MCP tools, so this is a minor release. One existing behaviour changes on
purpose: local memory quarantines notes it cannot vouch for. Each line names the code or test that
makes it true.

- **BEHAVIOR CHANGE: local memory quarantines untrusted notes (immune system v0).**
  - Every note carries a taint label, `provenance` (`trusted` | `untrusted` | `grounded` |
    `verified`), and a `source` (`src/memory/local-store.ts`).
  - `trustshell remember "<text>"` stores the note **untrusted and quarantined**. `recall` leaves it
    out and prints `quarantined COUNT N`. **If you wrote it yourself, add `--trusted`.**
    (`src/cli/index.ts` remember parse; tests/quarantine.test.ts "CLI remember is UNTRUSTED by
    default".)
  - A note written through the MCP `remember` tool is always untrusted (`src/mcp/memory.ts`;
    tests/mcp-memory.test.ts).
  - Notes saved by 1.6.1 or older are quarantined as `legacy` the first time 1.7.0 opens the file
    (`src/memory/local-store.ts` ensureSchema; tests/quarantine.test.ts "a pre-v0 memory file").
  - A held note is released only by one of three:
    - **ground:** the note is found in the source document recorded with it (`remember
      --source-file`, or MCP `source_text`; only its sha256 is kept). No recorded document, or a
      different one, is `NOT_CHECKED`. Whoever stored the note also supplied the document, so the
      note becomes `grounded`, never `verified`. (`releaseByGround` in `src/memory/quarantine.ts`;
      tests/quarantine.test.ts "ground release", "(a) the SDK cannot self-ground".)
    - **hal:** `--check hal` on the default endpoint. It needs a `pass` by votes, from two named
      deciders of two model families that both said TRUE. A custom endpoint is not asked. The SDK's
      `releaseByHal(id, { timeoutMs })` takes no transport, so a caller cannot supply the answer.
      The note becomes `verified`. (`src/memory/quarantine-hal.ts`; tests/quarantine.test.ts "hal
      release", "(b) the public releaseByHal ignores an injected fetch".)
    - **operator:** `quarantine release <id> --trusted`, recorded as the operator's word and not a
      check. CLI only. (`releaseByOperator`; tests/quarantine.test.ts "--trusted releases".)
  - Injection-looking text, matched by the fixed patterns in `src/lib/ingest.ts`, is never printed
    and never released. That includes `remember --trusted`, which vouches for who wrote a note,
    not for what it says. (`heldAsInjection`, `rememberNote`; tests/quarantine.test.ts
    "injection-looking text stays held", "(c) remember --trusted still runs the injection screen".)
  - New commands, tools and exports:
    - `trustshell quarantine list | explain | release`;
    - the MCP tools `quarantine_list` and `quarantine_explain`. There is no release over MCP;
    - the SDK exports `rememberUntrusted`, `listQuarantined`, `explainQuarantine`,
      `releaseByGround`, `releaseByHal`, `releaseExitCode` and `sourceDigest`.

    (tests/mcp.test.ts tool list; tests/quarantine.test.ts "the SDK exports".)
  - It holds text in this package's local memory and nothing else. It runs nothing in isolation,
    and its screen is a fixed pattern list.
- **`trustshell ground`: is a quote really in the document it cites?** It checks a quoted claim
  against a source file with no model and no network.
  - It checks that the quote is on the cited page, and with `--kind number|date` that the value is
    in the quote.
  - Exits: `VERIFIED` 0, `VETO` 1, and `NOT_CHECKED` 2, which is never a pass.
  - Pages split on form feed (`pdftotext` output).
  - `--echo` marks template text, so a quote that only repeats it is `NOT_CHECKED template_echo`.
  - In code: `groundQuote`, `groundClaims`, `splitPages` and `LIMITATIONS`. Every receipt carries
    `LIMITATIONS`, `observed: null` and `anchor_status: 'none'`.
  - `VERIFIED` says the text is on the page. It does not say the quote supports the claim.
  - For agents it is the MCP tool `ground_quote`, with the source passed as text.

  (`src/lib/ground.ts`; tests/ground.test.ts, ground-cli.test.ts.)
- **Number and date edges from the red team are closed before release.** These cases no longer
  verify:
  - a number glued to letters (`1.5k`);
  - `1,250` inside `1,250.50`, or `250` inside `-250`;
  - integers past 2^53;
  - two-digit years;
  - a date that reads two ways (`03/04/1970`);
  - an MCP call with a value but no kind.

  (tests/ground-xc1.test.ts, ground.test.ts "03/04/1970".)
- **`trustshell receipt <receiptId>`: read a policy-kernel receipt back and check it here.**
  - It calls `GET /api/v1/kernel/receipt/:id`, which needs `REPID_API_KEY`.
  - It recomputes the receipt's keccak256 hash **locally** and prints the receipt only if the hash
    matches.
  - It then prints the **six claims** one by one, never as one rollup badge.
  - Exits: 0 when the hash matches; 1 when the receipt does not match its own hash; 3 for no key, or
    when the engine refused.
  - New in code: `kernelReceipt()` and the six-claim exports (`SIX_CLAIM_KEYS`, `SixClaim`,
    `SixClaimStatement`). `kernelReceiptHash()` was already exported in 1.6.1.
  - For agents it is the MCP tool `kernel_receipt`.

  (`src/lib/kernel-client.ts`; tests/cli-receipt.test.ts, kernel-client.test.ts.)
- **`check "<sentence>"` keeps the engine's approximate-arithmetic answer.** The engine can decide a
  one-equation sentence by approximate (floating-point) calculation. `check` and the MCP
  `check_claim` now keep that pass or veto and say `Decided by approximate calculation, not exact.
  No model was asked.` Before, that answer read not-checked. A not-checked that claims this path
  stays not-checked, and an unlisted path is still never a pass. (`CLAIM_PATHS` and `pathLine` in
  `src/lib/claim.ts`; tests/claim-arith-approx.test.ts.)
- The Chrome extension is not in this package. Its scrubbed-send line and its approximate-arithmetic
  line now match the CLI word for word (tests/claim-path-parity.test.ts).
- **Docs match the package.** Every surface that 1.6.1 lacks is labelled "since 1.7.0" at its
  block. Each label says what 1.6.1 does instead, and that was run on a clean 1.6.1 install
  (`npm run check:doc-version`; the stranger gate in this release's PR).
- **Package size.** The tarball has 105 files: 1.6.1's 99, plus `dist/lib/ground`,
  `dist/memory/quarantine` and `dist/memory/quarantine-hal` (`.js` and `.d.ts` each).
  - Runtime dependencies are unchanged: `@hyperdag/proof-verifier`, `@modelcontextprotocol/sdk` and
    `zod`, with `ethers` still an optional peer (`package.json`; `npm pack --dry-run`).

## 1.6.1 — 2026-10-12

- **One call where there used to be two for a minted passport.** The SDK now reads the engine's
  folded-in `passport.onchain` object from the single `GET /api/v1/passport/:id`, and no longer makes
  the second `GET /api/v1/agents/:id/onchain` for a record the engine already marked MINTED. When that
  field is absent — an older engine that has not folded it in — the SDK still makes the second call.
  Correct either way: one round trip against a current engine, the same answer as before against an
  older one.
- **Honesty is unchanged, and that is the point of the patch.** MINTED is never collapsed into
  verified. A non-canonical registry never reads as verified: the client judges `onchain.registry`
  against its own canonical IdentityRegistry constant, not the engine's `verified` word. A
  NOT_CHECKED read is never a pass. `verified_at` is surfaced on the passport page.
- This is a patch: no API changes, no new commands or tools.

## 1.6.0 — 2026-10-05

- **BEHAVIOR CHANGE: `ethers` is an optional peer dependency.** Measured on the published 1.5.0 it
  was 23 of the 50 MB every install pulled, yet only two SDK functions use it: signing an x402
  payment (`buildX402Payment` / `guardedX402Payment`) and the on-chain read behind `verifySigner`.
  `verify`, `check`, `repid`, `proof`, `badge` and the MCP server never load it. A clean install of
  the package now measures 27 MB and 4.2 s, against 50 MB and 5.2 s, with every keyless command
  working. **If you sign payments, install it next to trustshell: `npm i ethers@^6`.** Without
  it those two functions throw `MissingDependencyError`, which says exactly that, instead of a
  module-resolution stack trace.
- **`TrustShell.init()` no longer waits forever.** Its `/health` probe had no deadline, so a
  backend that accepted the connection and never answered hung `init()` for good. It now gives up
  after 3 s (`HEALTH_TIMEOUT_MS`; set `healthTimeoutMs` to change it) and reports
  `health.ok: false` with the reason. The probe also cost 0.71 s before the first real call
  (measured on 1.5.0; the call itself took 0.18 s): pass `healthCheck: false` to skip it, and
  `health` then reads `{ ok: false, checked: false }`, i.e. not checked. `health.checked` is new.
- **Deprecated, still working until 2.0:**
  - The seven bare global commands `remember`, `recall`, `redact`, `verify`, `repid`, `proof` and
    `status`. Each is the same as `trustshell <command>`, and a bare global name can collide with
    another package's (npm will not install over a bin it does not own). On a terminal they print
    one line to stderr saying so; piped or in CI they print nothing new.
  - The MCP aliases `verify` and `evaluate` (use `verify_output`) and `getRepID` and `repid` (use
    `get_repid`). Their descriptions now say so, so an agent choosing by description picks the
    canonical tool. The server lists the same 14 tools.
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
