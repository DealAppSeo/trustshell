# Good first issues: drafts

Ten small, scoped tasks for someone new to the repo. **These are drafts, not filed issues.** A maintainer copies each one into a GitHub issue with the label `good first issue` and then deletes it from this file. Most stay inside the credential-free inspector (`trustshell check <runUrl> --claims-file`); 7 and 10 are specifications with a test harness. None needs a model, a backend or an account.

Setup for all of them is in [CONTRIBUTING.md](../CONTRIBUTING.md). The reference for the record, the templates and the exit codes is [action-evidence.md](action-evidence.md).

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

## 6. Prove the Bash and PowerShell forms of the challenge give the same card

**Labels:** `good first issue`, `testing` · **Size:** small · **Touches:** `tests/fixtures/action-evidence/`, one new test

The challenge ([challenge.md](challenge.md)) and trustshell.dev/build give two ways to write `claims.txt`: `printf` in Bash, and `Set-Content` in Windows PowerShell 5.1, which ends each line with a carriage return and a line feed (CRLF). Both are measured by hand to give the same result. Nothing stops a change to the claims reader from making them differ.

**Do:** record the pinned run's two GitHub responses (run `39619591025` and its jobs) into a new fixture in the same shape as `green-run.json`. Write the two claims files byte for byte as each shell writes them (LF with a blank line between the claims; CRLF with an empty middle line). Run both through `run()` with the recorded `fetch`, as `tests/cli-check-claims.test.ts` does.

**Done when:** both files produce the same record digest, the card says `Claims: 3 supported · 1 contradicted · 1 not checked`, the contradicted claim is `commit 5d1c5e3f57e1`, and the exit code is `1` for both. Change one claim in only one file and the test fails.

## 7. The OpenClaw hook adapter: a spec and a harness

**Labels:** `good first issue`, `design` · **Size:** medium, a spec and one test file, no OpenClaw needed · **Touches:** new `docs/openclaw-adapter.md`, new `tests/openclaw-adapter-spec.test.ts`

OpenClaw gives plugins `before_tool_call`, which can rewrite a call's parameters, block it or require approval, and `after_tool_call`, which sees each result, error and duration ([hook reference](https://docs.openclaw.ai/plugins/hooks/reference)). A TrustShell plugin would check each call against the owner's policy there and keep a receipt of what ran. It does not exist; `src/lib/init.ts` says the plugin seam is not implemented. The skill in `skills/trustshell/` runs the CLI, which is a different thing.

**Do:** write the spec. Say what `before_tool_call` decides for each policy outcome (allow, block, require approval), what an `after_tool_call` receipt line holds (tool name, a hash of the parameters, outcome, duration, time), and what the adapter must never do (log parameter values, call the network, treat the model's own say-so as permission). Then write a harness that feeds fake hook events to a stub policy function and checks those rules. The owner policy itself is still a prototype (#593), so the stub stands in for it.

**Done when:** the harness shows a denied call is blocked before it runs, an allowed call produces exactly one receipt line, and a receipt line never contains a parameter value. The spec names every rule the harness checks, and nothing in it is described as built.

## 8. A claim template for one named job: `gha.job_succeeded`

**Labels:** `good first issue`, `enhancement` · **Size:** medium · **Touches:** `src/lib/action-evidence.ts`, `tests/action-evidence.test.ts`, `docs/action-evidence.md`

The record already holds every job of the run (`/observation/jobs/items`: name, status, conclusion, commit, attempt), but no template reads one job by name. "The check job passed, run 39619591025." comes back NOT_CHECKED today.

**Do:** add `gha.job_succeeded`. It reads a sentence that names a job and cites the inspected run. Find the named job and support the claim only if every job with that name concluded `success` on the run's commit and attempt. Write the scope the way the existing templates do ("Whether the job named X in run N concluded success. Not which steps it ran, not any other job."). Add a refusal case: if no job has that name, the claim is NOT_CHECKED with a reason saying so, never CONTRADICTED and never SUPPORTED.

**Done when:** tests on the recorded fixtures show a supported case, a contradicted case (the job failed in `failed-run.json`), the no-such-job refusal, and a sentence that names a job but no run, which stays NOT_CHECKED. `docs/action-evidence.md` lists the template with its scope, and the existing templates' results are unchanged.

## 9. Inspect over MCP: an `inspect_run` tool

**Labels:** `good first issue`, `enhancement` · **Size:** medium · **Touches:** `src/mcp/index.ts`, one new test, `docs/recipes/README.md`, the README's MCP tool list

Inspect, the check of a claim against a GitHub Actions run, is a CLI command only. The MCP server's `check_claim` is a different check: model-based and hosted. So LangGraph, smolagents, Cursor and Claude users ([recipes](recipes/README.md)) cannot reach the headline feature from their agent.

**Do:** register an MCP tool `inspect_run` that takes a run URL and the claims as **text** and returns the same record `check <runUrl> --claims` builds, plus a status that maps the CLI exit codes (all supported, contradicted, not checked). Never read a file path from tool input: the caller is a model, and `--claims` is text-only for the same reason (see the comment above `readClaimsFile`). It talks to api.github.com only and needs no key; `GITHUB_TOKEN`, when set, only raises the rate limit.

**Done when:** a test with the pinned run (`39619591025`, recorded responses as in task 6) gets the same digest from the tool as from the CLI, and the status is "contradicted" for the challenge's two claims; a tool-input test proves a path is treated as claim text, not opened. The recipes README lists the tool, and `docs/recipes/langgraph/recipe.py` can call it (say in the pull request whether you ran it).

## 10. x402: a payment that waits for a SUPPORTED card, a spec and a harness

**Labels:** `good first issue`, `design` · **Size:** medium, a spec and one test file, no wallet or key · **Touches:** new `docs/pay-on-evidence.md`, new `tests/pay-on-evidence-spec.test.ts`

`guardedX402Payment` refuses before signing when the call has no policy, no cap, an origin that may not pay, or an amount over the cap. It does not wait for evidence that the paid-for work happened: paying only for work that checked out is not available through TrustShell yet.

**Do:** write the spec for a gate that signs only after an evidence record for the delivery comes back with every claim SUPPORTED, and refuses before signing on CONTRADICTED or NOT_CHECKED, on a record whose digest does not match its contents, or on a record about a different run than the one the payment names. Say what the gate does not prove (SUPPORTED is scoped to the platform record, not to the work being good). Then write a harness with a stub signer and the recorded fixtures (`green-run.json`, `failed-run.json`).

**Done when:** the harness shows the stub signer is called once for an all-SUPPORTED record and never for the other cases, each refusal names its reason, and the spec describes nothing as built.
