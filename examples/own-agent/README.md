# Test your own agent

Two ways to check an agent. They are different things and prove different things.

| | Path 1: check what it said | Path 2: run a task through TrustShell |
|---|---|---|
| **What you need** | A public GitHub Actions run and what the agent said about it | Your agent starts commands with `trustshell run` |
| **Access to the agent** | None. No API key, no change to it | You opt in, one command at a time |
| **What you learn** | Whether GitHub's record matches the claim | What was asked, what the policy decided, how each command ended |
| **What you cannot learn** | Whether the code is right | Anything the agent did without `trustshell run`: direct edits, its own network calls, other terminals |

Every command below is the same in bash, zsh and Windows PowerShell. The quotes around `'--'` matter: PowerShell drops a bare `--`.

Install the release (Node 22.13 or later):

```bash
npm i -g @hyperdag/trustshell@1.9.1
```

## Path 1: check what it said

Put your agent's words in a file, one claim per paragraph, each citing the run:

```text
The check workflow succeeded, run 42502305639.
```

```bash
trustshell check https://github.com/DealAppSeo/trustshell/actions/runs/42502305639 --claims-file said.txt --out evidence
```

That run really failed, so the claim is **CONTRADICTED** and the exit code is 1. Only `api.github.com` is contacted, and your claim text is never sent. A claim the run cannot decide is **NOT_CHECKED**, which is not a pass.

## Path 2: run a task through TrustShell

Use a fresh folder for each test, so the report holds only this task.

In bash:

```bash
export TRUSTSHELL_HOME="$PWD/.trust-run"
```

In PowerShell:

```powershell
$env:TRUSTSHELL_HOME = "$PWD\.trust-run"
```

Write the policy. Anything not listed is refused:

```bash
trustshell guard init
```

```bash
trustshell guard allow tool:node --script test.js
```

Tell your agent to start its commands this way, and to expect exit code 5 when one is refused:

```bash
trustshell run --tool node '--' node test.js
```

A refused command never starts. On Windows, `.cmd` shims such as `npm` cannot be started directly: start the script they wrap, pinned the same way.

## Get the report

Pair each claim with the command that decides it, and add any Path 1 evidence:

```bash
trustshell trust-report --out report --record evidence/record.json --bind "test.js=All tests pass"
```

Open `report/trust-report.html`. It has what to do next, each claim and how it was decided, every command with the policy's decision and its exit code, and what the report cannot see. The evidence files are beside it in `report/evidence/`.

A claim paired with a command that exited 0 reads **COMMAND_PASSED**. That is all an exit code can show: a test run that selected nothing also exits 0, so read the command as well as the word.

Exit codes: `0` nothing contradicted and nothing left unchecked, `1` a claim contradicted or a record broken, `3` anything not checked.

Anyone you send the folder to can check it, using the key printed when the report was made:

```bash
trustshell trust-report verify report --root 0x<key>
```

Exit `0` verified, `1` changed or sealed by another key, `2` not checked (no key given). `MANIFEST.sha256` also works with plain `sha256sum -c`. The key shows who sealed the report. It does not show that the commands test what the claims say.

## Try the whole thing

This packs the release, installs it into an empty folder with no keys, and runs every step above, including a refused command, a test that really fails, and altered reports:

```bash
npm run test:release-e2e
```
