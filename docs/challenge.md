# Try Inspect: the five-minute challenge

Your AI says the job is done. TrustShell checks the evidence. Catch an AI's false claim about a CI run, see exactly which evidence decided it, then try to break the checker.

No account, no API key, no TrustShell server: once installed, the only network call is to `api.github.com`. Everyone checks the same pinned run, so everyone should get the same verdicts. (The record's digest differs from run to run, because the record includes when it was fetched.) If your verdicts differ, that is a finding.

Inspect runs as `trustshell check <run-url> --claims-file <file>`. (`trustshell inspect` is a different command: it verifies a local session log.)

## 1. Install

Node 22.13 or newer.

bash or zsh:

```bash
mkdir ts-challenge && cd ts-challenge && npm init -y
npm install @hyperdag/trustshell@latest
npx @hyperdag/trustshell@latest --version
```

Windows PowerShell:

```powershell
mkdir ts-challenge; cd ts-challenge; npm init -y
npm install @hyperdag/trustshell@latest
npx @hyperdag/trustshell@latest --version
```

`--version` should print 1.8.0 or later. `--claims` and `--claims-file` are new in 1.8.0; 1.7.0 and older do not have them.

## 2. Check two claims against a pinned run

The pinned run is TrustShell's own CI: the `check` workflow on `main`, run 39619591025, commit `392797a69b6a`. It passed.

An AI agent wrote two sentences about it. One is true. The other cites that real, green run as proof for a different commit, the previous one on `main`.

bash or zsh:

```bash
RUN=https://github.com/DealAppSeo/trustshell/actions/runs/39619591025
printf 'The check workflow succeeded, run 39619591025.\n\nThe check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.\n' > claims.txt
npx @hyperdag/trustshell@latest check "$RUN" --claims-file claims.txt --out card; echo "exit $?"
```

Windows PowerShell:

```powershell
$run = "https://github.com/DealAppSeo/trustshell/actions/runs/39619591025"
"The check workflow succeeded, run 39619591025.", "", "The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025." | Set-Content claims.txt
npx @hyperdag/trustshell@latest check $run --claims-file claims.txt --out card; "exit $LASTEXITCODE"
```

What you should see, abridged (measured on 1.8.0 from npm, in bash and in Windows PowerShell, 2026-10-23):

```
### Claims: 3 supported · 1 contradicted · 1 not checked
- **CONTRADICTED** `commit 5d1c5e3f57e1`
  - **Why** The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.
- **SUPPORTED** `The check workflow succeeded`
- **SUPPORTED** `run 39619591025`
exit 1
```

The first sentence is supported. In the second, the commit is contradicted, and "succeeded" is left not checked because the line cites something that does not match the run. Exit 1 means a claim was contradicted; 0 means every claim was supported on a passing run; 3 means something could not be checked. Not checked never exits 0.

## 3. Follow the card to the evidence

`--out card` writes `card.md`, `card.html` and `record.json`.

- Open the run on GitHub: [run 39619591025](https://github.com/DealAppSeo/trustshell/actions/runs/39619591025). Its commit is `392797a`, not `5d1c5e3`.
- In `record.json`, `observation` is what GitHub reported: `url`, `head_sha`, `conclusion`, `jobs`, `fetchedAt`.
- Each entry in `claims` names its `template`, `status`, `reason`, `scope` (what was compared, and what was not) and `evidence_fields`: pointers to the exact `observation` fields that decided it.
- `does_not_prove` and `assurance` say what the check does not establish: it is GitHub describing its own run, nothing was re-run, the record is unsigned, and one green run never proves that all tests pass.
- `digest` is a SHA-256 over the record's canonical JSON (RFC 8785). It shows whether the record changed after it was made, not who made it.

## 4. Break it, and tell us

Find one of these and report it:

- a claim that comes back SUPPORTED when GitHub's record does not back it (the worst bug this tool can have),
- a true claim it refuses to read, or a result you found confusing,
- a way to make the card print something misleading.

Open an issue on [DealAppSeo/trustshell](https://github.com/DealAppSeo/trustshell/issues/new/choose) with the run URL, your claims file verbatim and the exit code. Public runs only; never paste a secret. A bug we accept and fix gets a regression test in the repository's own test suite, so the next release has to survive it.

Our own attacks, with the setup beside every number, are on [the red-team results page](https://github.com/DealAppSeo/trustshell/blob/main/docs/red-team.md). It says what ran, what was never checked, and what it does not show.

## Known limits

- Anonymous GitHub allows 60 requests an hour per IP, and a check makes two, so about 30 checks an hour from one network. Set `GITHUB_TOKEN` to raise it; it is used for nothing else.
- Only GitHub Actions runs are read.
- We will not re-run or delete the pinned run. If it ever disappears, every claim about it comes back not checked, which is the honest answer.
- Policies that refuse an action, and a signed bundle that carries your settings to another model, are being built and attacked now. They are not part of this challenge until their tests and the red-team battery pass.

## Building on ERC-8004, x402 or OpenClaw?

See [what runs today, what is not built yet, and what to build with us](https://trustshell.dev/build).
