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
