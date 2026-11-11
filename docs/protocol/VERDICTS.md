# TrustLattice verdict spec — v0

`https://hyperdag.dev/trustlattice/verdicts/v0`

This is the protocol note for the verdict a receipt carries and how a stranger reproduces it
offline. It is a developer-facing spec, not public launch copy. It describes what the code already
does (`src/lib/verify-receipt.ts`, `@hyperdag/trustshell/verify`), pinned by
`conformance/trustlattice/v0/` and `tests/trustlattice-conformance.mjs`.

## The six claims

Source of truth is the engine: `repid-engine/src/kernel/six-claims.ts` (`toSixClaimStatement`),
mirrored by `lib/six-claims.ts`. A verdict is an in-toto Statement
(`predicateType: https://hyperdag.dev/predicates/trust-receipt-six-claims/v1`) whose predicate holds
six named claims, in this order, each with a status, a one-line statement, `supports[]` and `gaps[]`:

| claim | asks |
|---|---|
| `integrity` | Is the record whole — its hash over its own contents, and sealed by a trusted key? |
| `authenticity` | Was the action authorized by the agent's accountable owner? |
| `observation` | Was an outcome observed (e.g. a payment settling on chain)? |
| `correctness` | Was the content verified against its source? |
| `authorization` | Did the kernel permit this action under the policy it was given? |
| `containment` | Did the tool run only under an ALLOW decision? |

Status is one of **`VERIFIED`**, **`NOT_CHECKED`**, **`FAILED`**, **`NOT_APPLICABLE`**.

**There is no rollup.** No single "VALID"/"trusted" field, by design. A reader weighs the six.
**`NOT_CHECKED` is never a pass** — it means *not looked at here*, which is different from *fine*.

## What the offline verifier re-derives vs reads

`verifyReceiptOffline(receipt, { trustedRoots?, asOf?, engineEnvelope?, envelopeAuthenticated? })`
runs with no network and no engine. Two things, and only two, can be established offline by
cryptography — the verifier does **both itself** and trusts neither the receipt nor any envelope for
them. Both land under `integrity`, whose own `gaps` in an engine receipt name exactly these two as
"not checked here":

1. **Hash.** Recompute keccak256 over the canonical receipt (`kernelCanonicalJson`, object keys
   sorted at every depth — RFC-8785-style) with `header.receipt_hash` omitted, and compare to the
   stored hash. Mismatch → `integrity: FAILED` (tampered). Missing `ethers` (the optional keccak
   peer) → `integrity: NOT_CHECKED`, never a silent pass.
2. **Signature.** Verify the Ed25519 signature against the **caller's** `trustedRoots`, never the
   header's own signer. A receipt that vouches for itself proves nothing.
   - verified under a pinned key → integrity keeps `VERIFIED`, sealer **trusted**;
   - a valid signature under a key that is **not** pinned, or a bad signature → `integrity: FAILED`
     (treated as forged);
   - a signer is pinned but the receipt is an unsigned `kernel-receipt/1` → `integrity: FAILED`
     (an unsigned receipt under a pin is a downgrade attack);
   - a `trustedRoots` entry is not `0x` + 64 hex → the whole pin set is rejected and a signature check
     the caller **asked for** could not run → `integrity` is lowered from `VERIFIED` to `NOT_CHECKED`
     (a typo'd pin must never read as a pass, and never falls back to the header key);
   - no roots pinned → integrity may hold on the hash alone, but the sealer is **not trusted**.

A single receipt's `prev_hash` is reported, not compared, by `verifyReceiptOffline`. Walking an
ordered sequence — checking each receipt's `(prev_receipt_id, prev_hash)` against the prior one's id
and recomputed hash — is `verifyReceiptChain` (below), which rolls up fail-closed.

The other five claims — authenticity, observation, correctness, authorization, containment — are the
**issuer's attestation**. The verifier reads them from a supplied six-claim envelope (it travels in
the engine's `receipt_response`) and **does not re-derive** them. **The envelope is not covered by the
receipt's Ed25519 signature:** the signature seals the receipt bytes, and the envelope only names the
receipt by `id` + `hash`, so binding says *which* receipt a document describes, never *who wrote it*.
The one exception to freshness aside, `authorization` is therefore a read, not a re-derivation.

## Reconciliation (gating)

The five read claims are gated on the two re-derived facts, and the verifier only ever **lowers** a
status, never raises one:

- **No bound envelope** (absent, or it names a different receipt/hash) → each read claim is
  `NOT_CHECKED`. An envelope is bound only when its subject name is `kernel-receipt:<id>` and its
  `digest.keccak256` equals the recomputed hash; otherwise it is `PRESENT_UNBOUND` and ignored.
- **Integrity not `VERIFIED`** → every read claim collapses to `NOT_CHECKED` (tampered or unknowable
  bytes can't carry trustworthy self-reports).
- **Envelope not authenticated** (the default) → any read claim the envelope marked `VERIFIED` is
  downgraded to `NOT_CHECKED`, *even under a trusted sealer*, because the receipt's signature does not
  cover the envelope. A read claim reaches `VERIFIED` **only** when the sealer is trusted **and** the
  caller sets `envelopeAuthenticated: true`, declaring the envelope arrived over an authenticated
  channel (the API `receipt_response`) — never for a file or a third-party hand-off. `NOT_CHECKED` /
  `NOT_APPLICABLE` / `FAILED` pass through unchanged (a self-reported failure is safe to surface).
- **Freshness.** When `asOf` is given and the decision's `policy.expires_at` is at or before it,
  `authorization` is `FAILED`, however the issuer labelled it — this is re-derived locally from the
  policy, so it overrides the read. An `asOf` that cannot be parsed fails closed to `NOT_CHECKED`,
  never silently skipped. With **no** `asOf`, freshness is not evaluated and the status is left as
  read; when the policy has an `expires_at`, `authorization.gaps` says freshness was NOT checked.
  A present expiry that cannot be read is never treated as "no expiry" or as a usable time. That
  covers a `policy` that is not an object, an `expires_at` that is not a finite number, and one
  after 2100 in epoch seconds (where a millisecond stamp lands). With `asOf`, such an expiry fails
  closed to `NOT_CHECKED`, like an unreadable `asOf`; without `asOf`, the gap says freshness was not
  checked. An early number (before 2000, or 0) is still an expiry: it is in the past, so it `FAILED`s
  against any `asOf`.
  The chain walk rolls receipts up by integrity, links, sealers and `FAILED` claims, so a
  `NOT_CHECKED` authorization does not move it. Whenever freshness was not checked for a receipt
  with an expiry (no `asOf`, an unreadable `asOf`, or an unreadable expiry), the chain's
  `limitations` count those receipts and say why. A `VERIFIED` chain then says nothing about whether
  those policies were still in force.

`reconciliation.downgraded[]` lists every claim the verifier lowered; `reconciliation.source` says
whether each claim came from the local recompute, the engine envelope, or a fail-closed default.

## Conformance

`conformance/trustlattice/v0/vectors.json` is the fixed ruler: 18 self-contained
`{receipt, options, expect}` vectors a stranger runs through any conformant verifier to get the same
per-claim verdict. Reproduce it with `node conformance/trustlattice/v0/generate.mjs`; check the
shipped verifier against it with `npm run test:trustlattice`. The vectors cover a clean valid
receipt (envelope attestations read → `NOT_CHECKED`), the one `envelopeAuthenticated` case that lifts
them to `VERIFIED`, the no-roots and unbound-envelope downgrades, byte tamper, an untrusted signer,
JCS key-reorder stability, expired/within `asOf` (epoch and RFC3339), a malformed pin that drops
integrity itself, unknown schema, a non-receipt, and the `/1` unsigned-vs-pinned pair.

## Not yet in v0 (stubs / open forks)

- **Chain walk** (`verifyReceiptChain`): shipped. Verifies each receipt offline and checks each
  `(prev_receipt_id, prev_hash)` against the prior one's id and recomputed hash. A chain is
  `VERIFIED` only when every receipt's integrity is `VERIFIED`, every sealer is confirmed under a
  pinned root, no claim is `FAILED`, and every link matches; any tampered, unlinkable, or
  unauthenticated receipt fails or defers the whole chain, and so does an expired one when `asOf`
  is given (`NOT_CHECKED` is never a pass). It does
  not assert index 0 is the true genesis — only internal consistency of the supplied sequence.
- **On-chain `observation`**: a read-only anchor check that could raise `observation` from an
  attestation to an independently observed fact. Kept out of the offline core by design.
- **Separate `@hyperdag/trustlattice` package vs this `./verify` subpath**: shipped as a subpath for
  now (one install, one version). Splitting into its own package is an owner decision, not a code
  change — flagged, not taken.
