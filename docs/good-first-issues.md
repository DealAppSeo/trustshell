# Good first issues: drafts

Five small, scoped tasks for someone new to the repo. **These are drafts, not filed issues.** A maintainer copies each one into a GitHub issue with the label `good first issue` and then deletes it from this file. Each stays inside the credential-free inspector (`trustshell check <runUrl> --claims-file`), and none needs a model, a backend or an account.

Setup for all five is in [CONTRIBUTING.md](../CONTRIBUTING.md). The reference for the record, the templates and the exit codes is [action-evidence.md](action-evidence.md).

---

## 1. Say "rate limited" instead of a raw `GitHub 403`

**Labels:** `good first issue`, `enhancement` · **Size:** small · **Touches:** `src/lib/check.ts`, one test

Anonymous GitHub allows 60 requests an hour per IP, and `check` makes two per run. When the limit is hit, `check` fails with the raw API error, `check failed: GitHub 403: …`, and a first-time tester cannot tell it is a limit they can lift.

**Do:** when GitHub answers 403 or 429 and the header `x-ratelimit-remaining` is `0`, throw a `CheckError` that says it is rate limited, when it resets (the `x-ratelimit-reset` header), and that setting `GITHUB_TOKEN` raises the limit (it is used for that and nothing else). `gh()` in `src/lib/check.ts` currently returns only `{ ok, status, body }`, so it has to return the headers too.

**Done when:** a stubbed-`fetch` test (see how `tests/action-evidence.test.ts` replays recorded responses) shows the new message for a 403 with `x-ratelimit-remaining: 0`, and shows that an ordinary 403 without it keeps the old message. The exit code stays `3`.

## 2. `--claims-file -` reads the claims from stdin

**Labels:** `good first issue`, `enhancement` · **Size:** small · **Touches:** `src/cli/index.ts`, `tests/cli-check-claims.test.ts`, `docs/action-evidence.md`

Today the only way to hand `check` a file of claims is a path. That makes `gh pr view 12 --json body -q .body | trustshell check <runUrl> --claims-file -` impossible, so people save a temp file first.

**Do:** treat the path `-` as standard input in `readClaimsFile`, under the **same 256 KiB limit** and the same plain-line rules. Keep `--claims` text-only: never read a file from it (an earlier draft did, and it let a PR author name `../../.env`; the history is in the comment above `readClaimsFile`).

**Done when:** a test pipes claims through stdin and gets the same record as the file form, an over-limit input is refused, and `docs/action-evidence.md` lists the `-` form in its option table.

## 3. A copy-paste GitHub Actions example: check the run that just finished

**Labels:** `good first issue`, `documentation` · **Size:** small, docs and one YAML file, no code · **Touches:** new `docs/check-in-ci.md`

Show how to run `trustshell check` from a `workflow_run`-triggered workflow on the run that just finished, and write the card to `$GITHUB_STEP_SUMMARY` so it appears on the run page.

**Do:** one example workflow and a short page around it. The page must say that claim text taken from a pull request description is **attacker-controlled input**: pass it to `--claims-file` through a file or an environment variable, never interpolated into the shell command, and that Markdown is not read (the whole text comes back NOT_CHECKED, exit `3`). Say which exit codes should fail the job.

**Done when:** you have run the example in your own repository on a real run, linked that run in the pull request, and `npm run check:doc-version` still passes.

## 4. Tell the reader which line stopped the whole text from being checked

**Labels:** `good first issue`, `enhancement` · **Size:** small to medium · **Touches:** `src/lib/evidence-card.ts`, `tests/action-evidence.test.ts`

The checker is deny-by-default: one line it cannot read in full (Markdown, a question, words no template reads) blocks every verdict in the text. That is deliberate, but the card then opens with `Claims: 0 supported · 0 contradicted · N not checked` and the reason is repeated inside each entry. A tester who wrote six sentences has to dig to learn that **line 3** was the cause.

**Do:** when nothing was decided because of a blocking line, print one sentence under the `Claims:` heading that names the first blocking line and why. The sentence already exists: it is the `reason` ("Not every line of this text is a plain claim … (line 3: …), so nothing in the text is decided.") that every blocked entry repeats, so take it from the record rather than recomputing it in the card. Change nothing about what is SUPPORTED, CONTRADICTED or NOT_CHECKED, and nothing in the record's schema or digest.

**Done when:** a card test for a text with one bad line shows the new sentence, a card for a fully readable text is byte-for-byte unchanged, and the HTML card gets the same sentence, entity-escaped like every other string from the text.

## 5. Make the test suite pass on a Windows clone

**Labels:** `good first issue`, `help wanted` · **Size:** small per suite, six suites · **Touches:** `tests/` only

On a Windows clone with `core.autocrlf=true`, `npm run verify` fails six suites that pass on Linux CI. Four read a workflow or schema file and expect `\n`: `tests/kernel-client.test.ts`, `tests/measure-home-samples.test.ts`, `tests/publish-trusted-publishing.test.ts` and `tests/receipts-workflow.test.ts`. `tests/stranger-rail.test.ts` builds a path with `ROOT + '/'` that Windows backslashes break. `tests/scrub-battery.test.ts` runs a script that spawns `C:\Program Files\nodejs\node.exe` without a shell, and the space in the path stops it.

**Do:** normalise line endings where those tests read files (`.replace(/\r\n/g, '\n')`, as `tests/readme-truth.test.ts` already does), join the paths with `path`, and make the spawn tolerate a path with a space. Change the tests, not the files they check.

**Done when:** `npm run verify` is green on a Windows clone with `core.autocrlf=true` and still green on Linux. Say which suites you could run on which OS in the pull request.
