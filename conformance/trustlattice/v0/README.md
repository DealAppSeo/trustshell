# TrustLattice conformance vectors — v0

A fixed, versioned ruler for receipt verification. Each vector is self-contained: a receipt, the
caller's options, and the per-claim verdict a **conformant verifier must produce**. If you install
`@hyperdag/trustshell` and run these through `@hyperdag/trustshell/verify`, you get the same result
we do — that is the point of the corpus.

- **Spec:** the verdict semantics these vectors pin are in [`docs/protocol/VERDICTS.md`](../../../docs/protocol/VERDICTS.md) (`https://hyperdag.dev/trustlattice/verdicts/v0`).
- **Run against the shipped verifier:** `npm run test:trustlattice` (builds, then `tests/trustlattice-conformance.mjs`).
- **Reproduce this file:** `npm run sdk:build && node conformance/trustlattice/v0/generate.mjs`.

## Vector shape

```jsonc
{
  "id": "clean-valid-pinned",
  "description": "...",
  "receipt":  { /* a kernel-receipt/1 or /2, or a non-receipt for the malformed cases */ },
  "options":  { "trustedRoots": ["0x..."], "asOf": 1800003599, "engineEnvelope": { /* six-claim in-toto statement */ } },
  "expect": {
    "schema": "kernel-receipt/2",
    "sealer_trusted": true,
    "engine_envelope": "BOUND",            // BOUND | PRESENT_UNBOUND | ABSENT
    "downgraded": [],                       // claims the verifier lowered from the envelope
    "claims": { "integrity": "VERIFIED", "authenticity": "VERIFIED", "observation": "NOT_CHECKED",
                "correctness": "NOT_APPLICABLE", "authorization": "VERIFIED", "containment": "VERIFIED" }
  }
}
```

A verifier conforms when, for every vector, `verify(receipt, options)` yields `expect.schema`,
`expect.sealer_trusted`, `expect.engine_envelope`, the same set of `downgraded` claims, and the
`expect.claims` status for all six claims. Statement/support/gap text is advisory, not pinned.

## Provenance

Vectors are derived from the signed engine golden
(`tests/fixtures/kernel-receipt-v2.golden.json`, engine commit recorded in `vectors.json`). The
generator reuses the SDK's own canonical-JSON + keccak only to seal synthetic fixtures (as the CLI
tests do); the **expected verdicts are authored against the spec**, not read back from the verifier.

## What the vectors cover

`clean-valid-pinned` · `clean-valid-no-roots` (sealer-unconfirmed downgrade) · `jcs-key-reorder`
(canonical-hash stability) · `byte-tamper-decision` · `untrusted-signer` · `expired-as-of` /
`within-as-of` · `envelope-absent` · `envelope-unbound` · `unknown-schema` · `not-a-receipt` ·
`v1-unsigned-no-roots` / `v1-unsigned-pin-downgrade` · `array-reorder-tamper` (array order is
load-bearing where key order is not) · `malformed-trusted-root` (a garbage pin trusts nothing) ·
`expired-as-of-rfc3339` / `as-of-epoch-string` (the freshness anchor parses both the CLI's RFC3339
and epoch-seconds forms).
