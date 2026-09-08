<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The browser suites DO run in an agent sandbox. Run them before saying a client path is unverifiable.

**MEASURED, from a sandboxed agent session — the first three on 2026-08-29, all four on 2026-08-30, green:**

```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
npm run test:mvp-walk            # 39/39  — the whole first-user journey, in real Chromium
npm run test:grants-fail-closed  # 10/10
npm run test:campaign-honesty    # 15/15
npm run test:roles-honesty       # 15/15  — added 2026-08-30, same run
```

`test:roles-honesty` builds in-suite rather than assuming a build exists, and so do two of its
siblings. That is not ceremony: **`next build` inlines `NEXT_PUBLIC_*` by static analysis**, so a
bundle built without `NEXT_PUBLIC_REPID_ENGINE_URL` sends every fetch to the empty string. Running
that suite against a pre-existing build failed eight assertions, and the natural reading of the
output was "these pages are broken". They were not — the probe was. Point a suite at a build it
did not make and you are measuring the build, not the code.

**Why this note exists.** Each of those files says *"NOT in gating CI — it needs a browser and a
server"*, which is true and is about **where the suite runs**, not whether you can run it. Skimmed,
it reads as "you can't run this here." A finding was published on that basis — a client-side path
declared NOT_CHECKED because a browser was assumed unavailable — and the assumption had never been
probed. Probing it took one command.

It was also contradicted by this repo's own code: `tests/e2e/chromium-path.mjs` resolves *"the flat,
pre-installed layout used by agent sandboxes."* The support was built for exactly this environment
and was sitting there unused.

**What this changes.** `curl` gets you SSR HTML, which renders identically whether or not React
mounts — so it can never tell you a client-side path is alive. These suites click. If you are about
to write NOT_CHECKED about anything that only happens after hydration, run one first. If it still
cannot be reached, say so *with the command you ran*.

Playwright is deliberately not a package dependency; absent, the suites exit `2 = NOT_CHECKED`
rather than a stack trace. It is installed globally in this sandbox, which is why they run.

**One caveat that has not moved:** these drive a **stubbed** backend. They prove the pages and
their client paths work against a known-good response shape — never that production returns that
shape. That is a separate check, against production.

---

# An exhaustive search of every tree you CAN reach is not evidence about the one you cannot.

**2026-09-06/07.** A cloud session was asked to land 1.4.0 from a tarball. It searched npm (stops
at 1.3.0), **every one of ~100 branches** (not one has a 1.4.0 `package.json`), every tag, the
releases list (zero), and its own filesystem. It then wrote a `BLOCKED_FOR_SEAN` note concluding
the work **did not exist**.

It existed. It was on the laptop, uncommitted. `bin/check.js` and `docs/MORNING.md` were pushed
minutes later and disproved the note, which was deleted.

**The search was accurate and the conclusion was not.** Every tree was named except the one that
mattered, and the missing one was invisible precisely because it was unreachable — nothing errored,
nothing came back empty in a way that looked like a gap. `verify-first` already says *name the tree
in the sentence (npm 1.3.0 / GitHub main / **unpushed laptop**)*; the failure was writing a verdict
whose scope was "everywhere" when the evidence's scope was "everywhere I can see."

Say **NOT CHECKABLE — <the tree>** and let it stand next to the negative result. A blocker note
that says "this does not exist" is worse than no note when something does.

**Corollary, same session:** the note's action item was *"drop the tarball in this folder."* A
cloud container has no folder the operator can reach. An instruction the reader cannot execute is
not a blocker report, it is a dead end — and the operator is not always a developer. Name the
transfer that actually works (attach it to the message, or commit and push it).

# Check WHICH toolchain you are measuring before reporting a build broken.

**2026-09-07.** `npm run sdk:build` exited 2 with `TS5107: moduleResolution=node10 is deprecated`,
on the branch base as well as under the change — a clean pre-existing failure, and since
`prepublishOnly` runs the build, an apparent hard block on `npm publish`. It was one sentence away
from being reported as a launch blocker with a `tsconfig` patch attached.

`node_modules` was not installed. `npx` had fallen back to a **global TypeScript 6** at
`/opt/node22/bin/tsc`. The repo pins `typescript: ^5`; under its own 5.9.3 the build exits **0**
and `moduleResolution: "node"` is entirely legal.

**`npx <tool>` in a repo with no `node_modules` measures the machine, not the repository.** Check
`node_modules/.bin/` and the installed version before believing any verdict a toolchain gives you,
especially a *pre-existing* failure — "it was already broken" is the shape that stops you looking.
Same family as the build-vs-probe error above: point a tool at something it did not build and you
are measuring the tool.

# A command nobody can invoke is not shipped, however good the code is.

**2026-09-07.** `bin/check.js` was correct and unreachable. `package.json` `files[]` publishes
`dist/` only, so `bin/` never entered the npm tarball, and the CLI's `Command` union did not
contain `'check'`. `npx @hyperdag/trustshell@1.4.0 check <url>` — the exact line in the launch
invite — would have answered *unknown command* to everyone who ran it.

Nothing was red. Tests passed, the file worked locally via `node bin/check.js`, and the gap lived
entirely in packaging. **Before claiming a CLI command ships, run it the way the README tells a
stranger to run it** — from the built artifact, not the source path you have been testing.

**Verify with the config CI uses, not the one nearest your change.** The commit that landed this
was checked with `tsc --project tsconfig.sdk.json` — which `exclude`s `tests/` — plus a green jest
run, and pushed. CI runs `npx tsc --noEmit` against the **root** `tsconfig.json`, which includes
`tests/`, and it went red on twelve type errors in the new test file alone. Two green
verifications, neither of them the one that gates the merge. `npm run check` and the workflow files
name the real commands; run those before pushing, not the subset that covers the files you touched.

And its verdicts exited **0 for every outcome it could compute**, so *"the jobs could not be read"*
and *"every job passed"* were the same observable event for any caller. NOT_CHECKED must never
share an exit code with success — least of all in the tool built to say what evidence does not
prove.


---

# Ponytail: run `lite` or `full` here. NOT `ultra`.

Ponytail (`/plugin install ponytail@ponytail`) forces the laziest solution that works — YAGNI,
stdlib first, one line over fifty. It is a good fit for this repo with one calibration, and it
reads project `AGENTS.md`, which is why the calibration lives here rather than in a chat.

**Its intensity ladder is `lite | full | ultra`, default `full`.** Use `lite` or `full`.
`ultra` is "deletion before addition, challenge the requirement in the same breath", and most of
what is valuable in this codebase LOOKS like over-engineering until you know what it cost:

- the empty-chain guard that stops `inspect` reporting `INTACT` over nothing
- the union parser that reads every quoted member rather than a character class
- `.release-hold`, twenty lines of prose guarding ten lines of shell
- the egress check that runs the commands with `fetch` stubbed instead of grepping for `fetch(`

Each is a guard whose value is invisible until it fires. A YAGNI extremist deletes exactly those.

**Where ponytail and this repo genuinely disagree, and it is worth knowing before it surprises
you.** Its Output rule says *"if the explanation is longer than the code, delete the
explanation"*. Here the explanation is frequently the mechanism: LESSONS-style comments at the
defect site are what stop a defect recurring, and a rule filed where nobody reads it has never
prevented anything. Ponytail scopes that rule to UNREQUESTED chat prose, so read narrowly the two
are compatible — but at `ultra` it will start pruning the comment that says why a guard exists.

**What it is genuinely good for here:** `/ponytail-review` on a diff before you push (opt-in, so
it advises without quietly removing a guard), and `/ponytail-debt`, which harvests deferred
`ponytail:` shortcuts into a ledger — the same shape as this project's "a caveat is a debt" rule.

**What it will not simplify away, by its own rules:** input validation at trust boundaries, error
handling that prevents data loss, security measures, and anything explicitly requested. It also
requires one runnable check behind any money- or security-path logic. Those match this repo's
posture, which is why `full` is safe.

**Uninstall has a trap.** The cleanup script is itself a plugin file, so removing the plugin
first deletes the thing that cleans up after it. Run `node scripts/uninstall.js` BEFORE removing
the plugin, or you leave a mode flag and `~/.config/ponytail/config.json` behind.

# OPERATOR ENVIRONMENT — do not infer this, it is written here

**Sean runs Windows, in PowerShell 5.1.** The prompt looks like `PS C:\Users\Cash4>`.

- **`&&` is a syntax error** in this PowerShell. Chain with `;` or give one command per line.
- Commands must be **PowerShell**, not bash. No `export`, no `$(...)`, no `~/`.
- **Sean is not a developer.** Give the full block to paste, say where to paste it, and say
  what a correct result looks like. Do not give a fragment that assumes a working directory.
- Paths in this repo's committed docs include `/Users/Cash4/...`. **Those are not his machine.**
  A committed string is not a live environment reading.

# The recurring defect: preferring your own inference to an authoritative source you already have.

Four instances in the session of 2026-09-06/07, all the same move — a fact was *inferred* while
the thing that could have *settled* it sat unread, in reach, or one question away:

| inferred | the source that was already available |
|---|---|
| "the 1.4.0 work does not exist" | the laptop — unreachable, so **ask**; instead a BLOCKED note was written |
| "the build is broken, publish is blocked" | `node_modules/typescript` — `npx` had fallen back to a global TS 6 |
| "my change verifies clean" | `.github/workflows/check.yml`, which names the three gating commands |
| "the operator is on a Mac" | the operator's own shell prompt, `PS C:\Users\Cash4>`, in the transcript |

It is not random inattention. It is a consistent preference for evidence you can generate
yourself over evidence you would have to go and read or ask for — and it gets worse with
momentum, because gathering feels like progress and reading feels like a detour.

**The rule.** Before stating any fact about (a) the operator's machine, (b) which toolchain
just ran, or (c) what CI gates on — name the source you read for it, in the sentence. If you
cannot name one, you inferred it: either go read it, or ask. "It looked like X" is not a source.

**Asking is cheap and is not a failure.** Anything about the operator's machine is one question,
answered in seconds, with certainty. No amount of clever inference beats that, and four attempts
at it in one session cost more than four questions would have.

**The mechanical half — use these, so the judgement is not needed:**

- `npm run verify` runs **exactly** what `check.yml` gates on (`tsc --noEmit`, then jest minus
  `tests/e2e`). Run it before every push. It exists so "which config?" has one answer instead of
  being a choice you can get wrong — which is how CI went red above.
- The environment block above exists so the operator's OS is never inferred again.

# Wait for the Strix verdict before merging. It is not a required check, so nothing else will.

**Sean's standing instruction, 2026-09-08**, after this pattern was measured across five
PRs in one session:

| PR | Strix | outcome |
|---|---|---|
| #103 | started, then the merge landed **5 seconds later** | no verdict ever recorded |
| #104 | allowed to finish | *No security issues found* |
| #105 | started, merge **2 seconds later** | no verdict |
| #106 | allowed to finish | *No security issues found* |
| #107 | started, merge **2 seconds later** | no verdict |

Three of five shipped unreviewed, and not because the bot is slow — because merging the
moment CI went green beat it every time. Strix is **not configured as a required check**,
so GitHub will happily merge underneath it. The only thing standing between a PR and an
unreviewed merge is the agent deciding to wait.

**How to wait.** Strix posts a comment reading *"Security review in progress"* and then
**edits that same comment in place** with the verdict. So the signal is an
`issue_comment.edited` from `strix-security[bot]`, not a new comment — a watcher looking
only for new comments waits forever. Green CI is not the merge signal; green CI **plus a
Strix verdict** is.

**Strix does not review DRAFTS, so "wait for Strix" on a draft waits forever.** Measured
across every PR in that table: it starts **4-6 seconds after `ready_for_review`** and never
before. This section's own PR sat a draft with no review at all until it was marked ready
— the rule caught its own author within minutes of being written. So the sequence is: open
the PR, get CI green, **mark it ready**, wait for the verdict, then merge.

A finding is work before the merge, not after. If Strix reports one, fix it — and then
ASK for the re-review, per the section immediately below. It does not re-run on the new
head by itself.

**AUTOMATIC RE-REVIEW ON PUSH IS OFF FOR THIS REPOSITORY. A push does not
re-trigger Strix** [MEASURED 2026-09-08 on #111]. This is the trap that follows
directly from making it required, and it is easy to misread as a slow review.

Findings were fixed and pushed. On the new head there was then **no Strix check
run at all** — `check` green, Vercel green, and the required `Strix Security
Review` simply absent. Absent is not pending and not passing: the PR cannot
merge, and nothing tells you why unless you read Strix's own pinned comment,
which says:

> This pull request has **1 commit** after the last Strix review (`ae6aff5`).
> Strix has **not** reviewed these changes. Automatic review on push is off for
> this repository.

**The trigger is a mention: comment `@strix-security` on the PR.** The pinned
summary also carries a re-run link. Neither an empty commit nor a close-and-reopen
is the mechanism, and both are forbidden anyway.

So the full sequence is: open the PR → **mark it ready** (Strix ignores drafts) →
wait for the verdict → fix any findings → **push AND mention `@strix-security`** →
wait again → merge. The second wait is the one nobody expects, because on every
other check in this repo a push is the trigger.

The same session that wrote this section told the operator "Strix is
re-reviewing" immediately after pushing a fix. It was not. Nothing was running,
and nothing would have started.

**DONE 2026-09-08: `Strix Security Review` and `check` are now REQUIRED checks** on `main`
via a branch ruleset. GitHub enforces the wait; it is no longer only an agent's judgement.
Everything above still matters — it explains *why* the gate exists and how to satisfy it
(mark ready, or Strix never runs and the required check never reports) — but a PR can no
longer be merged ahead of the verdict even by an agent that forgets.

Verified by attempting a merge before the verdict landed and confirming GitHub refused. A
rule nobody has tested is a setting, not a gate.
