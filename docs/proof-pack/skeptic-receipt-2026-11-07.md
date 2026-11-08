# Skeptic's receipt challenge — PASS

> Can a skeptic forge an owner-self-signed receipt the shipped verifier accepts? Each attack below PASSES when the verifier **refuses** it. Reproduce: `npm run skeptic`.

- **commit** `253ed5a6d69449fa5dc3e591cd5a777c1f74762c`  ·  **version** `1.9.0-dev.0`  ·  **node** `v22.17.0`  ·  **platform** `win32 10.0.26200`
- **ruler** (the body under attack) `sha256:13fcf3d3c79a28d9…`  ·  **this script** `sha256:923787643243bf3d…`
- **commands** `trustshell sign-receipt` and `trustshell verify-receipt` — offline, throwaway install key, no network

| attack | verdict | what it proves | source | detail |
|---|---|---|---|---|
| 0-setup | PASS | seal a base receipt with this install key (throwaway TRUSTSHELL_HOME) | [cmd] trustshell sign-receipt | provenance owner-self-signed, pin 0x8e8c76026aaa… |
| positive-control | PASS | a real seal verifies under its own pinned key | [cmd] verify-receipt --root <pin> | exit 0, integrity VERIFIED, sealer trusted |
| missing-root | PASS | no --root pinned -> never exit 0 (unaccountable signer is not a pass) | [cmd] verify-receipt (no --root) | exit 2 (NOT_CHECKED), sealer not trusted, integrity VERIFIED |
| wrong-key | PASS | pinned to a DIFFERENT key -> integrity FAILED | [cmd] verify-receipt --root <other> | exit 1, integrity FAILED, sealer not trusted |
| tampered-evidence | PASS | flip decision.verdict after sealing -> integrity FAILED | [cmd] verify-receipt --root <pin> | exit 1, integrity FAILED (hash no longer matches) |
| forged-signature | PASS | swap the signature -> Ed25519 verify FAILED | [cmd] verify-receipt --root <pin> | exit 1, integrity FAILED |
| transplanted-sig | PASS | lift one receipt's signature onto a different body (same key) -> FAILED | [cmd] verify-receipt --root <pin> | exit 1, integrity FAILED (a signature covers its own bytes only) |
| expired-authz | PASS | a policy expired before --as-of -> authorization claim FAILED | [cmd] verify-receipt --root <pin> --as-of <future> | authorization FAILED at as-of 2033 (integrity still VERIFIED, exit 0) |
| no-self-promotion | PASS | self-signature + authenticated envelope is STILL owner-self-signed, no RepID | [shipped fn] evidenceLevel() | level OWNER_SELF_SIGNED, repid_eligible no |

## Limitations (recorded, not passes)
- **offline-verify-is-stateless** — offline verify does NOT catch a verbatim replay of one receipt. Replay is prevented by the engine (receipt_id / nullifier uniqueness), not by the offline verifier. A relying party that must not accept a receipt twice checks the id against what it has already seen. _(the same sealed receipt verified twice, both exit 0/0)_

_Generated 2026-11-07T17:16:09.898Z. PASS = the verifier refused the attack. A FAIL here is a real defect in the seam._
