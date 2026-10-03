# 🧾 Receipts

**Your AI says it ran the tests. Here is the receipt from GitHub itself.**

Receipts reads what a pull request claims ("all tests pass", "build succeeds", "tsc is clean",
"lint passes") and checks each claim against the check runs GitHub holds for that commit:

| Result | Means |
|---|---|
| ✅ VERIFIED | a check named for that kind of claim finished green on this commit |
| ❌ FAILED | a check named for it finished red on this commit |
| ⚪ NOT CHECKED | nothing could prove it: no such check ran, it is still running, or it was skipped |

It never says anyone lied. It says what the evidence shows, and what it does not prove.

## Use it

```yaml
# .github/workflows/receipts.yml
name: receipts
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
permissions:
  contents: read
  checks: read
  statuses: read
  pull-requests: write
jobs:
  receipt:
    runs-on: ubuntu-latest
    steps:
      - uses: DealAppSeo/trustshell/receipts@main   # pin a commit SHA for production
```

That is the whole setup: no key, no account, no install.

## What it can and cannot see

- **Reads** the PR description, its commit messages, and the check runs and statuses on the
  head commit. **Writes** one comment, updated in place. **Talks to** the GitHub API only.
- **No model reads your PR.** Claims are found by plain patterns, so PR text cannot argue its
  way to a verdict. Quoted text, code blocks and HTML comments are ignored on purpose.
- **Never runs PR code.** Keep it on `pull_request`. Do not pair it with
  `pull_request_target` plus a checkout of the PR head.
- **Fork PRs** get a read-only token from GitHub, so the receipt goes to the job summary
  instead of a comment. That is GitHub's safety rule working.
- **A green check proves that check passed.** It does not prove the check tested this change.
  Checks are matched to claims by name, so name your jobs for what they run.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `wait-seconds` | `600` | wait for other checks on the commit before writing the receipt |
| `fail-on-failed` | `false` | fail the job when a claim is contradicted by a failed check |
| `comment-when-empty` | `false` | comment even when the PR makes no claims |
| `self-pattern` | `^receipts?$` | check names ignored as evidence (this job). Anchored, so `receipt-tests` still counts |

Zero dependencies, Node 20. The logic is `core.js` (pure, tested in `tests/receipts-core.test.ts`);
`index.js` is the GitHub I/O.
