# Changelog

All notable changes to the `@hyperdag/trustshell` package.

## Unreleased (on main, in no npm release)

`package.json` on main is `1.9.0-dev.0`: main is ahead of the published 1.8.0, and nothing below is in any npm release.

- **Guard + Carry, experimental (#593).** `trustshell guard` and `trustshell run` add a local owner policy enforced only on the paths they mediate. `trustshell bundle` adds a signed (not encrypted) bundle that carries a profile, a policy and selected notes to another host. These are local guardrails for cooperative agents, not a tamper-resistant boundary: anyone who can run the CLI as the owner can change the policy, and MCP and OS commands are not mediated.
- **The two-host demonstration (#607, #609):** `node demo/guard-carry/run.mjs` (docs/guard-carry-demo.md). Its no-network assurance now fails if the egress blocker is not live.
- **A policy names its signer only when the signature verifies (#608).** A hand-edited policy no longer reads as owner-signed.
- **"Owner-signed" means this install's key (#611).** The `trustshell run` card called a policy owner-signed when its signature verified under any key, and the bundle summary did the same for a key other than the bundle author's. Both now name the key and say it is NOT this install's (or NOT the author's).
- **Autonomy levels for Guard, SHADOW (off until `guard level shadow`).** L0 observe, L1 read-only, L2 workspace, L3 broader. An agent rises one level after N Inspect records SUPPORTED in full (one per commit; NOT_CHECKED never counts) and falls on a CONTRADICTED record, an out-of-lane refusal, or revocation (`guard level revoke`, `guard kill`). In shadow Guard allows exactly what the policy allows; the level and what it would have refused are recorded in `autonomy.jsonl`, for measuring whether earned autonomy reduces harmful actions. `guard level enforce` is an explicit owner opt-in that only narrows the policy. Local guardrails for cooperative agents, not a security boundary. docs/autonomy-levels.md.
- **Fix: `OFFLINE=1` now stops the MCP `verify_output` (and `verify`, `evaluate`) and the SDK `verifyOutput`/`evaluate` too.** They sent the text to HAL under `OFFLINE=1`; only `TRUSTSHELL_LOCAL_ONLY=1` stopped them. Now they answer `NOT_CHECKED` with `seenBy: []` and no request leaves. The CLI `verify` and `check`, `check_claim` and `inspect_run` already did this. (`TrustShell.score` in `src/lib/trustshell.ts`; tests/mcp-offline-sends-nothing.test.ts.)
- **`inspect_run` over MCP (#610).** Inspect for agents: a run URL and the claims as text in; the same record, digest and card that `trustshell check <runUrl> --claims` produces out, from api.github.com only. 1.8.0's MCP server lists 20 tools, and this is not one of them.

## 1.8.0 — 2026-10-22

1.8.0 is 1.8.0-rc.0 (the section below) promoted to npm `latest`, plus one fix, #596. A plain
`npm install` now gives what that section lists. Between the candidate and this release the only
change to package code (`src/`, `dist/`, `bin/`, `scripts/init-pai.mjs`, `scripts/value-events.mjs`
and `lib/interview.js`) is `src/cli/classify.ts` and its build, `dist/cli/classify.js`.

- **Fix: the local Laya lane no longer takes quadratic time on a long run of trailing `.` or `!`
  (#596).** `trustshell verify` with `TRUSTSHELL_LAYA=local` classifies the claim locally first, and
  that classifier dropped trailing `.` and `!` with `/[.!]+$/`. CodeQL flagged it
  (js/polynomial-redos): 20,000 `!` then a letter took 2.2 s, and 40,000 took 9 s. It now drops them
  with a backwards scan and returns the same lane as before. (`classify` in `src/cli/classify.ts`;
  tests/laya-classify.test.ts "drops trailing . and ! exactly as before, in linear time (CodeQL
  polynomial-redos)", which pins `OK!!!`, `thank you.`, `yes.!.!`, `ok!x` and `!!!`, and runs
  40,000 `!` and 40,000 `.` in under 500 ms.)
- **In 1.8.0-rc.0 too, and not in its notes: `package.json` declares `engines` `node >=22.13.0`.**
  The memory commands load `node:sqlite`. 1.7.0 declared no engines.
- **Package size.** 123 files, the same count as 1.8.0-rc.0 (`dist.fileCount` from `npm view`;
  `npm pack --dry-run` on this release). That is 1.7.0's 107 plus `dist/cli/profile`,
  `dist/learn/cli`, `dist/learn/report`, `dist/learn/store`, `dist/lib/action-evidence`,
  `dist/lib/evidence-card`, `dist/lib/jcs` and `dist/lib/local-only` (`.js` and `.d.ts` each).
  Runtime dependencies are unchanged.

## 1.8.0-rc.0 — 2026-10-21 (release candidate, npm dist-tag `next`)

A release candidate for outside testers. **`latest` stays 1.7.0**: nobody gets this from a plain
`npm install`; ask for it with `npm i -g @hyperdag/trustshell@next`.

**What this candidate is for: the credential-free GitHub Actions inspector.** `trustshell check <runUrl>`
and the new `--claims` / `--claims-file` evidence card talk to api.github.com and nothing else: no
account, no key, no TrustShell backend, and `GITHUB_TOKEN` is optional (it only raises the rate limit).
The first bullet below is that. The rest rode along from main since 1.7.0 was cut (it was re-cut on
`51897d4c`, #575) and are not what this candidate asks testers to try.

- **`check <runUrl> --claims … --guided` (EXPERIMENTAL): "All checks pass." against every check on
  the commit.**
  - A claim line that cites nothing is read as being about the named run, but only when nothing in
    the text points elsewhere.
  - Every check on the run's commit is read: latest and earlier attempts, statuses, suites, the
    base branch's required checks, and whether the change edits its own workflows.
  - SUPPORTED only when all of them passed. CONTRADICTED when any failed. Otherwise NOT_CHECKED,
    with the reason.
  - "All required checks pass." is a separate template (`ci.required_checks_pass`): only the base
    branch's required checks, pinned to their apps. It is never decided without `--guided`.
  - Off by default. Without the flag, output is byte-identical.
  - Still only api.github.com, with more requests; `OFFLINE=1` sends nothing.
  - Files: `src/lib/commit-checks.ts`, guided mode in `src/lib/action-evidence.ts`, tests in
    `tests/action-evidence-guided.test.ts`, and a guided run in `scripts/check-egress.cjs`.
    Reference: `docs/action-evidence.md`.
- **`trustshell check <runUrl> --claims "<text>"` / `--claims-file <path>` (draft): what an agent
  said, against what the run reports.** Claims are split into atomic parts, each SUPPORTED,
  CONTRADICTED or NOT_CHECKED by a fixed template. Deny by default: only plain claim lines
  (printable ASCII, no Markdown or HTML, one sentence, each its own paragraph) are read, and any line that is not plain or
  not read end to end blocks every verdict in the text; Markdown is not rendered. A green run supports only "this workflow run succeeded", and only for a sentence
  that cites that run's id; "all tests pass" and "all checks pass" are never SUPPORTED by one run.
  Commit, run and attempt citations are compared, and a commit SHA supports only at 12 or more hex
  characters; security,
  readiness, "done" and the like are named and NOT_CHECKED. Output is a `dev.trustshell.action-evidence/0.1-draft` record with an RFC 8785 SHA-256,
  and a Markdown/HTML card drawn from the record alone. api.github.com only, the same two requests as
  `check <runUrl>`. The observation is labelled PLATFORM_REPORTED; cryptographic integrity is
  NOT_CHECKED. `src/lib/action-evidence.ts`, `src/lib/evidence-card.ts`, `src/lib/jcs.ts`; tests
  `tests/action-evidence.test.ts`, `tests/jcs.test.ts`, `tests/cli-check-claims.test.ts`, and the
  `--claims` runs in `scripts/check-egress.cjs`. Reference: `docs/action-evidence.md`. `check --json`
  gains two additive fields, `run` and `jobs`.
- **`trustshell learn`: the learning loop v1, local.** Jobs you create; checks you register, whose
  exit code is the only outcome the rulers read; your corrections, stored verbatim as an eval case and
  then a lesson that stays quarantined until you accept it; `learn inject` (and MCP
  `learn_lessons_for`) prints this job's accepted lessons, at most 5 and 400 tokens, counted as
  `loop_tokens`; learn and co-work modes; unaided probes; spaced review; `learn report`, which
  prints `not measured` until a ruler has its data. MCP `learn_record` stores the agent's outcome
  where no ruler reads it. No network. Example hook: `examples/learn-hook/user-prompt-submit.mjs`.
- The local memory file gains two kinds, `lesson` and `learn`. A file made before this is rebuilt
  once, in one transaction, keeping every row and id, and only by a `learn` command. Before the
  rebuild the file is copied to `<file>.bak-<UTC time>` (0600); if the copy fails, nothing is
  rebuilt. `recall` and `quarantine` still read notes only.
- Lesson scope applies to both ends: `inject` shows a lesson only on episodes frozen on its check (or
  any episode, when it is job-wide), and a failed check retires only the injected lessons scoped to it
  or to no check. `learn accept` refuses a retired lesson; `learn reaccept <id>` brings one back only
  at an interactive terminal with the id typed back, with receipts. `learn correct --credit <label>`
  records who prompted a correction; `--derived-from-untrusted <label>` (formerly `--source`, which
  still works and warns) marks text that is not yours. `inject` records `--model` / `--family`, and
  `examples/learn-hook/stop.mjs` fills in each turn's model, family and tokens.

- **Also in this build, not part of what testers are asked to try: the local-only switch (#576, SEC F2),
  default unchanged.** `localOnly: true` or `TRUSTSHELL_LOCAL_ONLY=1` makes every send of your text
  answer NOT_CHECKED before any fetch, and a HAL result carries `seenBy`. `src/lib/local-only.ts`;
  `tests/local-only.test.ts`.
- **Also in this build: `trustshell profile` gains optional personal sections (#579).** Values, people
  helped, style, constraints and model priorities, all empty and unrendered until you write one;
  `share_personal` defaults to false, so `report` leaves them out. `src/cli/profile.ts`,
  `src/lib/profile.ts`; `tests/profile-personal.test.ts`.

## 1.7.0 — 2026-10-16

New commands, exports and MCP tools, so this is a minor release. Some existing behaviour changes on
purpose, each marked BEHAVIOR CHANGE below:
- local memory quarantines notes it cannot vouch for;
- MCP tools that read the network answer `{untrusted_data, screening}`, and the MCP `redact` tool
  is gone;
- `OFFLINE=1` sends nothing;
- `TRUSTSHELL_API_URL` must be https.

Each line names the code or test that makes it true.

- **BEHAVIOR CHANGE for MCP consumers: network-read tool results are enveloped untrusted data
  (#573).**
  - These tools now answer `{untrusted_data, screening}` instead of the bare result:
    `verify_output`, `get_repid`, `getLeaderboard`, `present_proof`, `status`, `check_claim`,
    `my_job` and `kernel_receipt`, plus the aliases `verify`, `evaluate`, `repid` and `getRepID`.
  - **An agent that read `verdict` must now read `untrusted_data.verdict`.** Every other field
    moves under `untrusted_data` the same way.
  - Every string in `untrusted_data` is run through `ingest()`. A string that reads as instructions
    is replaced by `[withheld: ...]` and its path is listed in `screening.withheld`;
    `screening.ingest` is `clean` or `veto`. Error messages carrying a remote body are screened the
    same way. `ingest()` is a fixed keyword screen with a known ceiling; the envelope tells the
    agent the whole payload is data, never instructions.
  - Local tools are unchanged: `remember`, `recall`, `quarantine_list`, `quarantine_explain`,
    `ground_quote` and `verify_proof`.

  (`screenRemote` in `src/mcp/index.ts`; tests/mcp-untrusted-data.test.ts "screenRemote withholds
  a smuggled instruction and names where it was", "get_repid wraps clean data too".)
- **BEHAVIOR CHANGE: the MCP `redact` tool is removed (#573).** Any connected agent could use it to
  delete the operator's keyed rows. `trustshell redact <key>` at the CLI is unchanged.
  (tests/mcp-untrusted-data.test.ts "the tool is gone, and an operator key row survives everything
  an MCP caller can reach".)
- **BEHAVIOR CHANGE: `OFFLINE=1` sends nothing (#572).**
  - `verify`, `check "<sentence>"`, `check <run url>`, the MCP `check_claim` and `quarantine release
    --check hal` print `NOT_CHECKED` (or `not-checked`) and exit 2 before any network call.
  - In 1.6.1, `OFFLINE=1 verify` still sent the claim to HAL and exited 0, and `check` still sent
    the text.

  (`OFFLINE_REASON` and `classifyClaim` in `src/lib/claim.ts`; tests/offline-sends-nothing.test.ts;
  `npm run check:egress`.)
- **BEHAVIOR CHANGE: `TRUSTSHELL_API_URL` (and the SDK's `apiUrl`) must be https (#574).**
  - Plain `http://` is allowed only for localhost, 127.0.0.1 or [::1]. Any other plain-http origin
    is refused before anything is sent.
  - `REPID_API_KEY` is sent only to an https origin, never to plain http, not even to localhost.
  - A non-default origin prints one `WARNING:` line on stderr per process.
  - Every reader of the override goes through one resolver: the SDK, the kernel receipt, `check`,
    MCP `check_claim`, `my_job`, `status`, `bind-status` and `verify`'s engine lane.

  (`resolveApiBase` and `ApiUrlError` in `src/lib/api-url.ts`; tests/api-url-https-only.test.ts.)
- **The local memory file is private to you (#575).**
  - On first use the memory folder is created 0700. The file is created 0600 and set back to 0600
    every time it is opened, so a world-readable file left by 1.6.1 is tightened.
  - On Windows, a folder it creates gets an ACL for the current user only (best effort).
  - An existing folder keeps its mode.

  (`openDb` in `src/memory/local-store.ts`; tests/memory-perms.test.ts.)
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
- **Number and date edges from the red team are closed before release.** None of these verifies
  any more:
  - a number glued to letters (`1.5k`) is not checked (tests/ground-xc1.test.ts:65-80);
  - `1,250` inside `1,250.50`, or `250` inside `-250`, is not found: VETO (:21-55);
  - a JavaScript number past 2^53 is not checked. The same digits passed as a string still verify,
    and a different digit string is a VETO even when the two are the same double (:81-107);
  - a two-digit year is never verified (:56-64);
  - a date that reads two ways (`03/04/1970`) is not checked (tests/ground.test.ts:322);
  - an MCP `ground_quote` call with a value but no kind is refused (:109-131).
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
- **Extension only, not in the npm tarball: a fresh install sends nothing until the person opts in
  (#571).** With no stored settings, every chat site is off and ask-first. At install, the Options
  page opens and says what is sent and where. Stored settings are kept as they were.
  (`extension/settings.js`, `extension/background.js`; tests/extension-first-run.test.ts.)
- **Site and docs only, not in the npm tarball: UX quick wins (#577).** These add a privacy link and
  a footer, fix contrast, put the /check box first, make evidence links honest, and spell HAL
  "Hallucination Assessment Layer" in the docs. (tests/ux-quick-wins.test.ts.)
- **`check` no longer has display names for NVIDIA NIM and Z.ai.** Neither is in the engine's voter
  pool, and neither is on the privacy page's list. An id with no display name still prints as the
  engine sent it. (`VOTER_NAMES` in `src/lib/claim.ts`; tests/claim-path-parity.test.ts "the ids
  both doors can name are exactly the hosts in the engine pool".)
- **Docs match the package.** Every surface that 1.6.1 lacks is labelled "since 1.7.0" at its
  block. Each label says what 1.6.1 does instead, and that was run on a clean 1.6.1 install
  (`npm run check:doc-version`; the stranger gate in this release's PR).
- **Package size.** The tarball has 107 files: 1.6.1's 99, plus `dist/lib/ground`, `dist/lib/api-url`,
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
