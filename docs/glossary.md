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

**Statuses are load-bearing**, not decoration: `shipped`, `approximate`, `not-live`,
`concept`. A glossary that lists a stub as though it were a feature is overclaiming with
extra steps, which is the specific failure this product exists to prevent.

Protocol-depth terms are defined once on the HyperDAG side at
<https://www.hyperdag.org/more> and cross-linked rather than copied here.
