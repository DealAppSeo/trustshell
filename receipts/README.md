# 🧾 Receipts

**Your AI says it ran the tests. Here is the receipt from GitHub itself.**

Receipts reads what a pull request claims ("all tests pass", "build succeeds", "tsc is clean",
"lint passes") and checks each claim against the check runs GitHub holds for that commit:

| Result | Means |
|---|---|
| ✅ VERIFIED | a check that ran that kind of work finished green on this commit |
| ❌ FAILED | one finished red on this commit |
| ⚪ NOT CHECKED | nothing could prove it: nothing ran it, it is still running, or it was skipped |

It never says anyone lied. It says what the evidence shows, and what it does not prove.

### Three levels of evidence, strongest first

A check run is named after its job, and a job is named for how CI is organised — not for what
it does. Matching on the name alone made this very repository unverifiable by its own tool: the
job that runs `tsc --noEmit` and `npx jest` here is called `check`, so every claim read NOT
CHECKED, forever. Widening the word list was the wrong fix, because `check` also matches
`spell-check`, `check-licenses` and `dependency-check` — buying verdicts with false VERIFIEDs.

So Receipts reads the strongest evidence each check offers, and the receipt says which it used:

| Level | What it reads | Why it is stronger |
|---|---|---|
| **command** | the `run:` line of that job, from the workflow file at this commit | the command that executed — evidence, not a label |
| **step** | the step's name and **that step's own result** | `Typecheck` passing while `Unit tests` never ran is now two answers, not one |
| **name** | the check's name | a label someone chose; the receipt says so out loud |

You do not have to name your jobs for this to work. Grant `actions: read` (below) and the steps
are read for you; without it, everything still works at the name level.

## Use it

```yaml
# .github/workflows/receipts.yml
name: receipts
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
permissions:
  contents: read      # read the workflow file at the commit, for command-level evidence
  checks: read
  statuses: read
  actions: read       # read each job's steps and their results; without it, name level only
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
  way to a verdict. Text in double quotes, code blocks, block quotes and HTML comments is ignored on purpose. Text in single quotes is read, because a single quote is also an apostrophe.
- **Never runs PR code.** Keep it on `pull_request`. Do not pair it with
  `pull_request_target` plus a checkout of the PR head.
- **Fork PRs** get a read-only token from GitHub, so the receipt goes to the job summary
  instead of a comment. That is GitHub's safety rule working.
- **A green check proves that check passed.** It does not prove the check tested this change.
  At command level it confirms the job runs a command that normally does this work — not that
  the command asserted anything. A test script that exits 0 without running a test still reads
  as tests.
- **Degrading is never failing.** A third-party check with no job behind it, a missing
  `actions: read`, a job whose work hides inside a composite action, a workflow file the reader
  will not parse: each falls back to weaker evidence. Reading steps may only ever ADD evidence,
  so a broken read costs a stronger verdict and can never invent one.
- **When the steps ARE readable, the job's name is not consulted at all** — including when no
  step matches. A job named `test` whose steps run nothing of the sort reads NOT CHECKED. That
  is deliberate: falling back to the name there would reinstate what the levels replace.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `wait-seconds` | `600` | wait for other checks on the commit before writing the receipt |
| `fail-on-failed` | `false` | fail the job when a claim is contradicted by a failed check |
| `comment-when-empty` | `false` | comment even when the PR makes no claims |
| `self-pattern` | `^receipts?$` | check names ignored as evidence (this job). Anchored, so `receipt-tests` still counts |

Zero dependencies, Node 20. The logic is `core.js` (pure) and `workflow.js` (reads one job's
`run:` commands out of a workflow file, and refuses rather than guessing); `index.js` is the
GitHub I/O. Tested in `tests/receipts-core.test.ts`, `tests/receipts-evidence.test.ts` and
`tests/receipts-workflow.test.ts`.
