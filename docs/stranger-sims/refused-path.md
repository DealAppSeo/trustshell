# Refused path

Run 2026-10-12 from a cloud sandbox. Branch `claude/bold-turing-icz50x-stranger-path` (PR #518).
Outcomes are VERIFIED / NOT_CHECKED / FAILED. Every block below is pasted from a real run; each says which engine it talked to.

Every refusal below is **a receipt and no spend**. The rule: default deny, and a check that did not run is a no, never a pass.

## 1. Limit pulled to zero, the next spend refuses

**STUB (browser, `tests/e2e/spend-walk.mjs`, fake wallet + stub chain that decodes `approve` and keeps the allowance):**

```
PASS  the page says it is test network only
PASS  step 2 names the agent's own wallet and a cap of 0 — 2. Set the cap | Agent wallet | 0x2222222222222222222222222222222222222222 | Cap now | 0.0 USDC | Your test USDC | 100.0 | Agent gas | 0.01 E
PASS  the wallet sent approve(agent wallet, 5 USDC) to USDC on Base Sepolia — {"from":"0x1111111111111111111111111111111111111111","to":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","spender":"0x222222
PASS  the page reads the new cap back
PASS  a dry run inside the cap says it would go through and sends nothing
PASS  a real send while spending is off is refused and says so
PASS  with spending on, the agent pays 2 and the cap left is 3 — 3. Have it pay | Pay to (address) | Amount (USDC) | Check first | Pay |  | Paid 2.0 USDC. Cap left: 3.0 USDC. See it on Basescan
PASS  the receipt links to Basescan
PASS  4 over the 3 left is refused before sending
PASS  stop sends a real approve of 0
PASS  after stopping, even 1 would not go through
PASS  nothing scrolls sideways at 390px — scrollWidth 390
PASS  no page errors

13/13 passed
```

The agent paid 2 under a cap of 5, was refused at 4 (over the 3 left), the owner pressed Stop (an `approve(agent wallet, 0)` sent to the stub chain), and even 1 was then refused.

**ENGINE-CI (the engine's own policy kernel, run read-only against `repid-engine` `origin/main`):**

```
✓ an edited policy no longer verifies: raising the limit after signing is DENY(policy_signature_invalid) (62 ms)
✓ DENY(spend_limit_zero), the tool is called 0 times, the receipt says executed:false (192 ms)
✓ a policy store that throws → NOT_CHECKED(policy_store_unavailable); the tool does not run; the refusal is recorded (38 ms)
✓ NOT_CHECKED blocks a spend, a post, and a plain tool alike (55 ms)
✓ ...and a signature that is simply wrong (no smart wallet there) is DENY(policy_signature_invalid), a different answer (95 ms)
✓ a payee NOT on the list → DENY(payee_not_allowed), a receipt with executed:false, the tool called 0 times (16 ms)
✓ a policy that lists NO payees refuses every spend: an omitted list is an empty list, never "anyone" (56 ms)
✓ widening the list after the owner signed it voids the policy: DENY(policy_signature_invalid) (24 ms)
✓ HAL not wired at all → NOT_CHECKED(hal_not_checked), never a pass (22 ms)
Test Suites: 3 passed, 3 total
Tests:       155 passed, 155 total
```

`DENY(spend_limit_zero)` with the tool called **0 times** and a receipt that says `executed:false`. The kernel's default is a limit of zero: a policy that omits a limit has set it to zero.

## 2. A bad signature

ENGINE-CI, in the block above: `an edited policy no longer verifies: raising the limit after signing is DENY(policy_signature_invalid)`, and `a signature that is simply wrong ... is DENY(policy_signature_invalid), a different answer` from a chain that could not be reached (`NOT_CHECKED(policy_signature_not_checked)`). Raising a limit after the owner signed voids the policy.

## 3. A payee off the list

ENGINE-CI, in the block above: `a payee NOT on the list -> DENY(payee_not_allowed), a receipt with executed:false, the tool called 0 times`, and `a policy that lists NO payees refuses every spend: an omitted list is an empty list, never "anyone"`.

## 4. Not checked

Three real runs, none of which spent anything.

**LIVE, the kernel-buy dry run with no API key** (`examples/kernel-buy/kernel-buy.mjs`, a local 402 resource, the live engine). It stops before any key is read:

```
→ GET http://127.0.0.1:4799/paid (expecting 402)
  requirement: 1000 raw units to 0x3333333333333333333333333333333333333333
→ asking the policy kernel…
REFUSED by client: NOT_CHECKED (http_401). Nothing was signed; no key was read.
exit=2
```

**The kernel cannot be reached at all** (`TRUSTSHELL_API_URL=http://127.0.0.1:9`):

```
REFUSED by client: NOT_CHECKED (network_error). Nothing was signed; no key was read.
exit=2
```

No receipt log was created in either run (`TRUSTSHELL_HOME` stayed empty): a refused call never reached the signing step.

**STUB (browser, `/check`):** a split vote and a check the service could not finish both read Not checked, with a receipt that says so:

```
[phone 390px] a split vote is NOT CHECKED and a no for spending and posting
[phone 390px] a check the service could not finish is NOT CHECKED, never Checks out
```

## 5. What each refusal leaves behind

| case | verdict | tool / signer ran | receipt |
|---|---|---|---|
| limit 0, spend 10000 | `DENY spend_limit_zero` | 0 times | `executed:false`, three legs present |
| edited policy | `DENY policy_signature_invalid` | 0 times | `executed:false` |
| payee off the list | `DENY payee_not_allowed` | 0 times | `executed:false` |
| no answer from the kernel | `NOT_CHECKED` (client) | no key read | none written; nothing to sign |
| split vote on the web | `NOT CHECKED` | nothing spent or posted | on-page receipt: "a no for spending and posting" |

## NOT_CHECKED here

- A DENY from the **live** engine: that needs an API key and a registered agent with a signed policy, which a stranger sim must not create on production. The DENY cases are the engine's own suite, not a live call.
- The engine PR for CORS and mint status is the engine lane's, not this branch's.
