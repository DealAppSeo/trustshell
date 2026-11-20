# Wrap an agent you did not write

This example puts `wrapExecute`, from the published `@hyperdag/trustshell` 1.9.3, around an agent
this project did not write, and runs it on your machine only. No API key, no account, and no
request to any TrustShell or HyperDAG server.

**The agent** is ELIZA, from the npm package [`eliza-as-promised`](https://www.npmjs.com/package/eliza-as-promised)
0.0.2 (MIT, no dependencies, source at https://github.com/natelewis/eliza-as-promised). You give it
a sentence and it returns a promise of a reply. It is a rule-based conversational agent: no model,
no tools, no network. It is used here because it is small, it is someone else's code, and with its
random choice switched off the same input always gives the same reply.

## What `wrapExecute` does, and what it does not

`wrapExecute(checker, fn, options)` runs `fn` first, then sends the text `fn` returned to
`checker.score(text)`, and gives you back the output together with the checker's verdict.

- **It observes. By default it does not enforce.** With no `blockAtOrAbove` option, the output is
  handed to you whatever the verdict is.
- **It runs after the agent.** If the agent sent an email or wrote a file, that already happened.
  "Withheld" means the *output* is not returned to you. Nothing is undone.
- **It verifies nothing itself.** The verdict is whatever the checker said. With the default
  `TrustShell` client the checker is the hosted HAL service, which gets the agent's text over the
  network. In this example the checker is a stub on your own machine (`stub-hal.mjs`) that says
  PASS to everything, so a PASS here shows the wiring works and says nothing about whether the
  reply is true.
- **It keeps no record unless you ask.** It returns a result object, and passes a record of the
  call to your `onRecord` callback. This example appends that record to `records.jsonl` in this
  folder. The record is the printed object without `output` and `blocked`, plus `halLatencyMs`.
- **Nothing here writes reputation, and nothing here is on a chain.** No agent is registered, no
  score changes anywhere, no transaction is sent.

## Run it

You need Node 22.13 or later (`node --version`) and git. Every command is run from the
`examples/external-agent` folder of a clone of this repository. The commands are the same in bash
and in Windows PowerShell 5.1; run them one at a time. If you open a new terminal, `cd` back into
that folder first.

```bash
git clone https://github.com/DealAppSeo/trustshell.git
```

```bash
cd trustshell/examples/external-agent
```

```bash
npm ci --ignore-scripts
```

`npm ci` installs the two pinned packages and what they depend on (about 100 packages) into this
folder. It prints `npm warn EBADENGINE` for `eliza-as-promised`, which declares a very old Node
version; that warning is expected and harmless. It ends with `added 99 packages` (the count may
differ slightly) and exit code 0. It can take a few minutes. In PowerShell, if `npm` or `npx` is
refused with a message about running scripts being disabled, type `npm.cmd` or `npx.cmd` instead.

To see the exit code of the command you just ran: `echo $?` in bash, `echo $LASTEXITCODE` in PowerShell.

### Case 1: supported

```bash
node run.mjs supported
```

ELIZA answers `I need some help`. The wrapper sends the reply to the local stub, the stub says
PASS, and the reply is released. Expected output (the port number changes every run; the
`WARNING` line is written to stderr, the rest to stdout):

```text
WARNING: TrustShell is using the backend http://127.0.0.1:50802, not the default https://repid-engine-production.up.railway.app. Everything TrustShell sends goes to that host.
{
  "case": "supported",
  "verdict": "PASS",
  "checked": true,
  "disposition": "released",
  "halScore": 0,
  "trustScore": 100,
  "decisionReason": "STUB verdict from stub-hal.mjs on this machine. Nothing was checked.",
  "evidence": [
    "local-stub:TRUE (stub, not a real check)"
  ],
  "blockAtOrAbove": null,
  "output": "What would it mean to you if you got some help ?",
  "blocked": false
}
RESULT: released, verdict PASS from the LOCAL STUB (wiring shown, truth not checked)
```

Exit code **0**. The `WARNING` line is the SDK saying it was pointed at another backend; here that
backend is the stub, so it is expected. The script itself checks that the stub received exactly
the text ELIZA returned, and exits 1 if not.

### Case 2: evidence unavailable

```bash
node run.mjs unavailable
```

No stub is started. The client is created with `localOnly: true`, so the SDK sends nothing and
answers NOT_CHECKED. The agent is wrapped twice: once with the defaults, once fail-closed
(`blockAtOrAbove: 'VETO', onUnavailable: 'withhold'`). Expected output, shortened: each `...`
stands for `halScore: null`, `trustScore: null`, a long `decisionReason`, an empty `evidence` list
and an `error` line saying nothing was sent. The fail-closed record has no `output` line at all.

```text
{
  "case": "unavailable-default",
  "verdict": "NOT_CHECKED",
  "checked": false,
  "disposition": "released",
  ...
  "output": "What would it mean to you if you got some help ?",
  "blocked": false
}
{
  "case": "unavailable-fail-closed",
  "verdict": "NOT_CHECKED",
  "checked": false,
  "disposition": "withheld",
  ...
  "blockAtOrAbove": "VETO",
  "blocked": true
}
RESULT: NOT_CHECKED. Default released the output; fail-closed withheld it. Not a pass.
```

Exit code **3**. `NOT_CHECKED`, `checked: false` and `blocked` come from the SDK. The exit code is
this example's own choice, because `wrapExecute` is a function and has no exit code: 3 is the code
the `trustshell` command line uses for "not checked". Note what the first record shows: by default
an unchecked output is still handed over.

Any other argument prints a usage line and exits 2. An unexpected result in either case exits 1.

After running each case once, `records.jsonl` in this folder holds three lines, one per wrapped
call. Every further run appends more lines; delete the file to start again. Git ignores it.

## What this example cannot show

`wrapExecute` cannot contradict an agent by itself. A contradiction needs a checker that
compares the text with something, and offline there is none: the stub agrees with everything.

A different feature of the same package does compare a claim with outside evidence: `trustshell
check` reads one public GitHub Actions run from `api.github.com` (no key; your claim text is not
sent) and compares your sentences with GitHub's record of that run. Each claims file here holds
one sentence, which the tool splits into three claims: the outcome, the commit and the run. It has nothing to do with
ELIZA or with `wrapExecute`. It is here so you can see a real SUPPORTED and a real CONTRADICTED.
These two commands need internet access to `api.github.com`:

```bash
npx --no-install trustshell check https://github.com/DealAppSeo/trustshell/actions/runs/44544121933 --claims-file claims-supported.txt
```

Prints `### Claims: 3 supported · 0 contradicted · 0 not checked`. Exit code **0**.

```bash
npx --no-install trustshell check https://github.com/DealAppSeo/trustshell/actions/runs/44544121933 --claims-file claims-contradicted.txt
```

The claim names the wrong commit for that run. Prints `### Claims: 1 supported · 1 contradicted ·
1 not checked`. Exit code **1**.

Both results were observed on 2026-11-20. They depend on GitHub still serving that run; if it
cannot be read, expect a different result, not one of these two.

## Using the real checker

This example does not do this, and its expected output above no longer applies if you do. In
`run.mjs`, replace `new TrustShell({ apiUrl: stub.url })` with `new TrustShell()` and delete the
block that starts `const realFetch`. No key is needed.
Then every wrapped call sends the agent's output to the hosted HyperDAG backend, which passes it
to third-party model providers. That is a network call to a service, it is not free to operate,
and it is still a verdict about text, recorded after the agent ran. It does not register the agent
or change any reputation score.

## Files

| File | What it is |
|---|---|
| `run.mjs` | The two cases. |
| `stub-hal.mjs` | The local stand-in for the checker. A stub, not a checker. |
| `claims-supported.txt`, `claims-contradicted.txt` | Input for the two `trustshell check` commands. |
| `package.json`, `package-lock.json` | Exact versions of the two published packages. |

The repository's test for this example is `tests/external-agent-example.test.ts`. To run it, from
the repository root: `npm ci --ignore-scripts`, then `npx jest tests/external-agent-example.test.ts`.
