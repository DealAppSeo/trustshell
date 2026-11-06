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

`verifyReceiptOffline(receipt, { trustedRoots?, asOf?, engineEnvelope? })` runs with no network and
no engine. Two things, and only two, can be established offline by cryptography — the verifier does
**both itself** and trusts neither the receipt nor any envelope for them. Both land under
`integrity`, whose own `gaps` in an engine receipt name exactly these two as "not checked here":

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
   - no roots pinned → integrity may hold on the hash alone, but the sealer is **not trusted**.

The chain is **not** walked offline: `prev_hash` is reported, not compared with the prior receipt.

The other five claims — authenticity, observation, correctness, authorization, containment — are the
**issuer's attestation**. The verifier reads them from a supplied six-claim envelope (it travels in
the engine's `receipt_response`) and **does not re-derive** them.

## Reconciliation (gating)

The five read claims are gated on the two re-derived facts, and the verifier only ever **lowers** a
status, never raises one:

- **No bound envelope** (absent, or it names a different receipt/hash) → each read claim is
  `NOT_CHECKED`. An envelope is bound only when its subject name is `kernel-receipt:<id>` and its
  `digest.keccak256` equals the recomputed hash; otherwise it is `PRESENT_UNBOUND` and ignored.
- **Integrity not `VERIFIED`** → every read claim collapses to `NOT_CHECKED` (tampered or unknowable
  bytes can't carry trustworthy self-reports).
- **Integrity `VERIFIED` but sealer not trusted** → any read claim the envelope marked `VERIFIED` is
  downgraded to `NOT_CHECKED` (an unauthenticated issuer's attestation is read, not verified);
  `NOT_CHECKED` / `NOT_APPLICABLE` / `FAILED` pass through unchanged.
- **Freshness.** When `asOf` is given and the decision's `policy.expires_at` is before it,
  `authorization` is `FAILED`, however the issuer labelled it.

`reconciliation.downgraded[]` lists every claim the verifier lowered; `reconciliation.source` says
whether each claim came from the local recompute, the engine envelope, or a fail-closed default.

## Conformance

`conformance/trustlattice/v0/vectors.json` is the fixed ruler: self-contained
`{receipt, options, expect}` vectors a stranger runs through any conformant verifier to get the same
per-claim verdict. Reproduce it with `node conformance/trustlattice/v0/generate.mjs`; check the
shipped verifier against it with `npm run test:trustlattice`. The vectors cover a clean valid
receipt, the no-roots and unbound-envelope downgrades, byte tamper, an untrusted signer, JCS
key-reorder stability, expired/within `asOf`, unknown schema, a non-receipt, and the `/1`
unsigned-vs-pinned pair.

## Not yet in v0 (stubs / open forks)

- **Chain walk** (`verifyReceiptChain`): comparing `prev_hash` across a receipt sequence. Today a
  standing gap under `integrity`.
- **On-chain `observation`**: a read-only anchor check that could raise `observation` from an
  attestation to an independently observed fact. Kept out of the offline core by design.
- **Separate `@hyperdag/trustlattice` package vs this `./verify` subpath**: shipped as a subpath for
  now (one install, one version). Splitting into its own package is an owner decision, not a code
  change — flagged, not taken.
