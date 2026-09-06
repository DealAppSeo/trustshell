# BLOCKED_FOR_SEAN — trustshell 1.4.0 local commands

**Status: BLOCKED. Nothing was built. No PR opened.**
Branch: `feat/1.4.0-local` (at `ce74154`, one docs commit ahead of `main`).
Date: 2026-09-06.

## The exact action needed from Sean

**Drop the `trustshell-1.4.0` tarball into the working folder** (the session
working directory alongside the checkout), or push its contents to a branch on
`DealAppSeo/trustshell` and say which branch.

Nothing else is missing. The moment the tarball is present the checklist below
becomes checkable and the work proceeds.

## Why this is blocked and not a fluent guess

The task named exactly one input — the 1.4.0 tarball — and it is absent. It is
also not recoverable from any reachable source:

| Where I looked | Result |
|---|---|
| The working folder and the whole local filesystem | no `trustshell-1.4.0` archive of any extension |
| npm registry, `@hyperdag/trustshell` | published versions stop at **1.3.0**; no 1.4.0 |
| GitHub releases on this repo | **zero** releases |
| This branch | `main` + one docs commit; no 1.4.0 code |
| Open PRs on this repo | **none** |
| Other DealAppSeo repos in reach | no `inspect` / `check` / `report`; see the `init` note below |

The four commands are not additions to something already here — they *are* the
tarball. The repo currently has one CLI (`src/cli/index.ts`) whose entire
command set is `verify | repid | proof | badge | help | version`.

Two of the task's own constraints are unsatisfiable without the artifact, and
both are preservation constraints — they presuppose code I do not have:

- **"Keep the OpenClaw plugin."** There is no OpenClaw plugin in this repo. The
  only occurrence of the string is prose in `app/earned-trust/page.tsx`. A
  plugin that cannot be opened cannot be kept.
- **"`init` + `lib/profile.js` committed."** `lib/profile.js` does not exist.

The remaining constraints (`fetch()` only to `api.github.com`; `seq` = last line
of the JSONL; the per-command egress table; the `INCONSISTENT` verdict word) are
**acceptance criteria for reviewing Sean's implementation**, not a specification
of one. They say what must be true of the code; they do not say what `inspect`
inspects, what `check` checks, or what `report` reports. Writing four commands
from them would be inventing the 1.4.0 design and reporting it as landed.

This branch's own `.github/skills/verify-first/SKILL.md` — the newest commit on
it — rules that out in two lines:

> Do not invent a recorder, identity layer, or CLI command that already lives in
> another DealAppSeo repo. Search org code first.
> If you cannot open the artifact, say NOT CHECKED. Never fill the gap with a
> fluent guess.

I searched org code first. The result is in the next section.

## One thing found while searching org code — worth a decision before 1.4.0 lands

`trinity-ecosystem/scripts/trustshell-init.mjs` is an **existing, different
`init`**. It installs a receipt harness into a Claude Code install and uses
`~/.trustshell/receipts.db` plus a `.trustshell.log` — not the
`.trustshell/profile.md` this task describes. Its own header records a measured
finding from 2026-08-15 and a warning that is directly on point for 1.4.0:

> `trustshell verify <session>` … **WOULD COLLIDE**. `trustshell verify` already
> ships and means "verify an LLM output". Shipping a second meaning under the
> same verb on the same binary is how you get a support burden that never ends.

So there are two things called `trustshell init` in the org, with different
on-disk layouts. **Which one owns the name is a decision, not a cleanup** — flagging
it rather than picking.

## Checklist pre-flight against the branch as it stands

Three outcomes, not two. `NOT CHECKABLE` means the tarball is required.

| # | Requirement | Verdict now |
|---|---|---|
| 1 | package name `@hyperdag/trustshell` | **PASS** — already correct |
| 1 | version `1.4.0` | **FAIL** — `package.json` says `1.3.0` |
| 2 | new commands `fetch()` only to `api.github.com` | **NOT CHECKABLE** — no new commands exist |
| 3 | README egress table, per command | **FAIL** — README has no egress/network section at all |
| 4 | `seq` = last line of the JSONL (no Map, no sidecar) | **NOT CHECKABLE** — no JSONL writer exists |
| 5 | `.trustshell/profile.md` gitignored | **FAIL** — `.gitignore` has only `hyperdag-trustshell-*.tgz` |
| 5 | `init` + `lib/profile.js` committed | **FAIL** — neither exists |
| 6 | no synthetic cards in the README | **PASS (vacuous)** — none present; must hold after the edit |
| 7 | verdict word `INCONSISTENT`, not `contradicted` | **N/A** — no verdict vocabulary in the CLI yet. The repo's `contradicted` hits are all in `.claude/skills/impeccable/`, an unrelated design skill, not the trust path |

Item 6 is marked vacuous on purpose: "no synthetic cards" passes today only
because the README has no cards. It is not evidence of anything until the 1.4.0
README edit exists.

## Fences honored

No merge, no publish, no DDL, no key rotation. Nothing touched in Supabase,
Railway, Vercel, or any other repo. `verify`, `repid`, `proof`, `badge` are
unmodified. This file is the only change.
