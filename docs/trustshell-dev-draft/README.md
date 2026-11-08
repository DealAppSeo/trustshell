# trustshell.dev — "Receipts, not promises" draft section (D7)

**Status: DRAFT. Not deployed. Not published.** This is a self-contained HTML draft of one
explainer section for trustshell.dev, built to be shown and reviewed, then ported into the live
site by the site owner if approved. Nothing here ships automatically, and no new public claim
goes live from this folder.

## What it is

`receipts-section.html` — a single, self-contained page that walks the owner's five-step
progression — **Enforce → Observe → Verify → Earn → Reuse** — with the real CLI at each step:
the owner policy that decides before a tool runs and pins it by path+sha256 (`guard` / `run`), the
hash-chained log checked offline (`inspect`), the one-receipt / six-claim non-collapsing verdict
(`verify-receipt`), the three-rung evidence ladder (owner-self-signed → issuer-attested →
RepID-eligible), and the signed carry where authority never travels (`bundle`). It ends with
"What a receipt does not prove" and a runnable, offline, no-account loop.

## This revision (2026-11-07): IA aligned, commands made real, one label corrected

- **IA now follows the owner's progression** Enforce → Observe → Verify → Earn → Reuse — a step rail
  up top, one step per section. The six-claim verdict panel lives inside Verify; the ladder inside Earn.
- **Three fabricated commands removed.** The prior draft told a skeptic to run `trustshell demo`,
  `npx … demo`, and `trustshell sign-receipt` — none of which exist in the CLI (`demo` is only a
  `check --demo` flag; sealing lives in the `sandbox` / `run` path, which needs a container or the
  engine). Every command shown now is one the CLI actually has and runs offline: `guard`, `run`,
  `inspect`, `verify-receipt`, `bundle` (verified against `src/cli/index.ts` and L-E2E).
- **Rung 2 is "Issuer-attested", not "independently-verified"** — reconciled with #681's
  `INDEPENDENTLY_VERIFIED → ISSUER_ATTESTED` rename: the engine's key is not independent of the
  issuer, so the page says exactly that instead of claiming an independence it does not have.

## How to view it

```
cd docs/trustshell-dev-draft
python -m http.server 8787
# open http://127.0.0.1:8787/receipts-section.html
```

Opening the file directly (`file://`) works too; a server is only needed if a tool must drive it.

## It inherits trustshell.dev's own world (extension, not a redesign)

Captured from the live site and reused verbatim, so this drops in without a visual seam:

- Ground `#0a0a0a`, foreground `#fafafa`, muted `#a1a1aa`, accent `#f6851b`, card `#18181b`,
  border `#27272a`.
- State palette doing the semantic work: `--state-measured #2dd4bf` (VERIFIED), `--state-not-checked
  #8b97a8` (NOT_CHECKED), `--state-failed #fb7185` (reserved for FAILED).
- Type: IBM Plex Serif display headings, Inter body, JetBrains Mono for receipts / commands / state.

## Honesty rules honored (PRODUCT.md copy rules)

- No "first / only / unique / unhackable" anywhere.
- NOT_CHECKED is shown, never rounded up to a pass; the six claims never collapse into one badge.
- The three evidence levels are kept distinct; an owner self-signature earns **no** production RepID.
- Framed as a developer preview; ends with explicit "what a pass does not prove".
- No accuracy number is quoted (none has a ruler to carry here).
- Every command shown exists in the CLI and runs offline — no fabricated `demo` / `sign-receipt`.
- "Independently-verified" is not claimed where the code only reaches `ISSUER_ATTESTED` (#681).

## Design-detector result

`impeccable detect` → **1 finding, accepted:** `overused-font: inter`. Inter is trustshell.dev's
own body face; this section inherits the established world, so the face is intentional, not a
default. All other findings (contrast, sub-11px micro-labels, flat type steps, italic-serif hero
tell, em-dash saturation) were fixed. Verified rendered at desktop and 375px mobile.

## What this draft does NOT do

It does not deploy, it does not touch the live trustshell.dev, and it introduces no claim the
engine cannot already back. Any new public copy here is a MAJOR change and is the owner's call.
