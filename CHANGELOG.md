# Changelog

All notable changes to the `@hyperdag/trustshell` package.

## Unreleased

### Security / x402 spend guards — published surface

**What npm users on the currently published build are missing, stated plainly:** the published
package exports `buildX402Payment` and `executeA2A` **only**. The spend guards
— `guardedX402Payment`, `assertOriginCanPay`, `auditThenAct`, and `TrustShell#getAllowance` —
were added after that release was cut and exist only on `main`. So anyone installing the published
version and wiring `buildX402Payment` directly gets the **raw payment builder with no origin check,
no audit hook, and no spend cap**: an unstamped/`Unknown` turn can pay, a spend with no policy can
sign, and nothing records the intent before the signature.

- **Guarded is the default.** `guardedX402Payment` is the documented spend entry: the turn `origin`
  must be pay-capable (`Unknown`/undefined **refuses**), a `policy` must allow the spend (its absence
  **refuses**), the intent is audited **before** the signature (a receipt-write failure **refuses**),
  and only then does `buildX402Payment` sign the EIP-3009 x402 header (which still enforces the cap).
  `buildX402Payment` remains available as the **explicit, lower-level opt-out**, not the default.
- **The four guards are pinned to the built package entry** by `tests/sdk-import-contract.mjs` (§5),
  so a future publish cannot ship the unguarded surface again.
- Refusal behaviour is covered by `tests/guarded-payment.test.ts` (Unknown-origin refused; missing
  policy refused with the intent row recorded first; audit-before-act holds even if the allowance
  reader throws), `tests/origin.test.ts`, and `tests/x402-cap.test.ts` (over-cap refused).

**Closing this for npm users is a publish** (a new version that includes the guards), which is a
Sean gate — this change does not publish.
