# Contributing to TrustShell

The part of TrustShell we most want help testing is the **credential-free GitHub Actions inspector**: `trustshell check <runUrl> --claims-file <file>`. It compares what an AI agent *said* with what a public GitHub Actions run *reports*, using fixed templates, no model and no account. Its one job is to never claim more than the evidence proves.

## The one rule

**A false SUPPORTED is the worst bug this tool can have.** If the card marks a claim SUPPORTED and the run does not back it, open an issue using the ["wrong verdict" template](https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml), with the run URL and your claim file. Reproducible ones are fixed first.

The opposite is true of NOT_CHECKED: it is the honest answer when the evidence cannot decide, never a failure to hide. A change that turns a NOT_CHECKED into a SUPPORTED needs a test that shows the run's own data backs it. NOT_CHECKED never exits `0`.

## Try it first (about two minutes)

Follow "Check your own CI run" at the top of the [README](README.md). You need Node.js (tested on 22) and a public GitHub Actions run URL. No token, no account.

## Build and test from a clone

```bash
git clone https://github.com/DealAppSeo/trustshell.git
cd trustshell
npm ci
npm run sdk:build
node dist/cli/index.js check https://github.com/OWNER/REPO/actions/runs/1234567890 --claims-file claims.txt
```

`npm ci` installs the whole tree (the website too), so it takes a few minutes. The CLI is built into `dist/`, which is committed; if you change `src/`, rebuild it and commit the result.

The tests for this feature:

```bash
npx jest tests/action-evidence.test.ts tests/cli-check-claims.test.ts tests/jcs.test.ts tests/readme-first-screen.test.ts
```

Before you push, run the same two commands CI runs:

```bash
npm run verify
```

(`tsc --noEmit`, then jest without `tests/e2e/`, which needs a live backend.) The recorded GitHub answers the tests replay are in `tests/fixtures/action-evidence/`; no test touches the network.

**On Windows**, six suites fail on a clean clone: four read workflow or schema files and expect LF line endings, and two build paths Windows rejects. They pass on Linux CI, so do not chase them from a change that does not touch them; fixing them is a [good first issue](docs/good-first-issues.md).

## What reads well in a pull request

- **Say what the tool now does NOT claim, or newly can.** `docs/action-evidence.md` is the reference for the record, the templates and the exit codes; keep it true.
- **A test that fails before and passes after.** For a verdict change, use a recorded run from `tests/fixtures/action-evidence/` or derive one from it and say it is derived.
- **No secrets, ever.** Tokens and keys go in environment variables. `GITHUB_TOKEN` is optional and only raises GitHub's rate limit.
- **Small and on one topic.** The templates are deliberately narrow; a pull request that widens one is a larger conversation, so open an issue first.
- Changes under `tests/` and `.github/` are reviewed by a code owner, and a security-review bot (Strix) reads pull requests once they are marked ready for review (it skips drafts).

## Where to start

[docs/good-first-issues.md](docs/good-first-issues.md) lists small, scoped tasks. Not part of what is being tested now: the hosted `verify` / `check "<sentence>"` commands, the MCP server and anything on-chain. Issues about them are welcome, but they are not the current focus.

Licensed under Apache-2.0 ([LICENSE](LICENSE)); by contributing you agree your work is too. Security issues: see [SECURITY.md](SECURITY.md), not a public issue.
