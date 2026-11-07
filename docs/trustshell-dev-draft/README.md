# trustshell.dev — "Receipts, not promises" draft section (D7)

**Status: DRAFT. Not deployed. Not published.** This is a self-contained HTML draft of one
explainer section for trustshell.dev, built to be shown and reviewed, then ported into the live
site by the site owner if approved. Nothing here ships automatically, and no new public claim
goes live from this folder.

## What it is

`receipts-section.html` — a single, self-contained page that renders the "Receipts, not promises"
section: the one-receipt / six-claim non-collapsing verdict, the three-rung evidence ladder
(owner-self-signed → independently-verified → RepID-eligible), and a "What a receipt does not
prove" block. It is the offline receipt loop (D1/D4/D5) told as a page a skeptic reads before
they run `npx @hyperdag/trustshell@latest demo`.

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

## Design-detector result

`impeccable detect` → **1 finding, accepted:** `overused-font: inter`. Inter is trustshell.dev's
own body face; this section inherits the established world, so the face is intentional, not a
default. All other findings (contrast, sub-11px micro-labels, flat type steps, italic-serif hero
tell, em-dash saturation) were fixed. Verified rendered at desktop and 375px mobile.

## What this draft does NOT do

It does not deploy, it does not touch the live trustshell.dev, and it introduces no claim the
engine cannot already back. Any new public copy here is a MAJOR change and is the owner's call.
