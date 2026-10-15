# Glossary

**The glossary now lives at [`/glossary`](https://trustshell.dev/glossary)**, rendered from
[`lib/glossary.ts`](../lib/glossary.ts).

This file used to hold its own copy of the definitions. That is exactly the two-copies
problem this project has been bitten by before — the duplicate is always the one that rots,
and a reader has no way to tell which is current. So the terms live in one typed module,
the page renders them with per-term anchors and a search box, and this file points at it.

**To add or change a term:** edit `lib/glossary.ts`. Each entry carries a stable `slug`
used as its URL anchor (`/glossary#a-eff`), so other pages can link straight at a
definition — rename a slug only if you also update the links to it.

**Statuses are load-bearing**, not decoration. They are the `TermStatus` values in
`lib/glossary.ts`, shown on the page with these labels:

| Status | Label on the page | Means |
|---|---|---|
| `shipped` | Shipped | It runs today, and you can observe it. |
| `approximate` | Approximate | Real, but measured against a documented stand-in; it says which way it can be wrong. |
| `engine-only` | In the engine, not verified here | It exists in the engine, but this site does not run it and cannot check it from here. |
| `not-live` | Not live yet | Designed and wired as a contract surface; the implementation behind it is a stub. |
| `concept` | Concept | A concept we use to think and talk, not a component. |

A glossary that lists a stub as though it were a feature is overclaiming with extra steps,
which is the specific failure this product exists to prevent.

Protocol-depth terms are defined once on the HyperDAG side at
<https://www.hyperdag.org/more> and cross-linked rather than copied here.
