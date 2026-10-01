# x402 site gate

A short pointer doc for the `Site` origin in TrustShell's x402 spend path.

## What it is

`AgentTurnOrigin` recognizes `'Site'` as a pay-capable origin, alongside `'Cli'`, `'Mcp'`, and `'Market'`. See [`src/lib/origin.ts`](../src/lib/origin.ts):

- `Unknown` may never pay.
- `Site` is allowed to pay when a spend policy allows and a cap is set.
- The gate is enforced by `assertOriginCanPay` and the higher-level `guardedX402Payment` wrapper.

So the SDK/CLI surface has a place for a hosted web UI to originate an x402 payment, with the same origin + policy + cap + audit-before-act guards as the other pay-capable origins.

## What is NOT checked / not shipped

- **No hosted page on `trustshell.dev` actually spends via x402 today.** The current site is informational: it displays the marketplace, passport, leaderboard, and docs. It does not call `buildX402Payment`, `guardedX402Payment`, or `executeA2A` on behalf of a visitor.
- **Browser wallet handling for `origin: 'Site'` is not measured.** Any future site spend UI would need to solve key custody in the browser, set a cap, and call the guarded SDK path. That is not in the tree yet.
- **`guardedX402Payment` is the spend entry, but it is not invoked from `app/` today.** If you are looking for a live site spend flow, the reference implementations are currently the CLI and `examples/a2a-purchase/`.

## No stake claims here

This doc is about the **spend-origin gate**, not about staking. It does not enable, flip, or describe `REAL_STAKING`, `HUMAN_AGENT_BIND`, or any stake flag. For those, see the CLI status output and the engine readiness response, not this file.

## Where to go next

- SDK spend path: [`src/lib/guarded-payment.ts`](../src/lib/guarded-payment.ts) and [`src/lib/origin.ts`](../src/lib/origin.ts)
- Live CLI example: [`examples/a2a-purchase/a2a-purchase.mjs`](../examples/a2a-purchase/a2a-purchase.mjs)
- Honesty contract for return values: [`docs/HONEST_RETURN_CONTRACT.md`](./HONEST_RETURN_CONTRACT.md)
