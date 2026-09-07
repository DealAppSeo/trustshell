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
