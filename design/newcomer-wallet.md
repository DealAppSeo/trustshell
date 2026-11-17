# The newcomer wallet step: one tap to a capped testnet budget

**DESIGN ONLY. Nothing in this document is built.** No page, route or flag here exists yet unless a line says so.
Written 2026-11-16. Every engine fact below was read from repid-engine `main` on that date.

## The goal
A person with no Web3 experience gives their PAI a small, capped, revocable test budget **without** handling a
private key, visiting a faucet, holding ETH, or reading a hex address first. On the site's loop strip this is
step 4 ("Budget (testnet)"), whose "not built yet" and "built, switched off" lines this design would retire.

## The flow (five taps or fewer, test network only)
1. **One passkey tap makes the owner wallet.** Face, fingerprint or device PIN. No seed phrase, no extension.
2. **We send test USDC.** A small, rate-limited drip from a funded testnet wallet straight to the new wallet
   (no faucet page, no CAPTCHA). Test USDC on Base Sepolia only; it has no value.
3. **The owner signs once, gasless.** An EIP-3009 `transferWithAuthorization` from the owner's wallet to the
   engine's escrow, for the budget amount. The owner pays no gas: the engine submits it.
4. **The agent spends from the stake.** Stake mode: the engine checks the owner's budget and the agent's own
   limit at spend time and signs the transfer; the agent never holds the funds.
5. **Revoke is one tap.** Set the agent's limit to 0, or unbind it. The next spend is refused, and the refusal
   is receipted.

## What it waits on in repid-engine (state on 2026-11-16)
| PR | What it gives this flow | State |
|---|---|---|
| #1557 | A verified human (proof-of-human SBT holder) can hold the shared owner budget, not only a builder | Merged; behind `HUMAN_SBT_OWNER_BUDGET_ENABLED`, off by default |
| #1558 | `POST /api/v1/stake/deposit/gasless`: an EIP-3009 authorization in, the escrow submits it | Merged; behind `GASLESS_DEPOSIT_MODE` (off / shadow / on), off by default. Follow-ups in #1564 (open) |
| #1559 | Unbinding a wallet-mode agent says whether a USDC approval to the agent is still live on chain (`onchain_approval`) | Open |

The typed data the site must build for #1558 (from its description and `MIN_WINDOW_S = 120` in its code): domain `{ name: "USDC", version: "2",
chainId: 84532, verifyingContract: <USDC> }`, `to` = the escrow, `validBefore` at least 120 s ahead.

## The open problem: a passkey cannot sign what the gasless route accepts today
- The gasless route accepts only a 65-byte ECDSA signature (`/^0x[0-9a-fA-F]{130}$/` in
  `src/services/gasless-deposit.ts`). A passkey signs with P-256, which no EOA can use, so a passkey wallet is a
  **smart account**, and a smart account's signature (ERC-1271) is longer than 65 bytes. Today it would be
  refused with `bad_authorization`.
- Whether Base Sepolia's USDC accepts an ERC-1271 signature for `transferWithAuthorization` (the `bytes
  signature` overload of USDC 2.2): **NOT_CHECKED**.

Three ways through, for Sean to choose:

| Option | What it takes | Trade-off |
|---|---|---|
| A. Embedded EOA, unlocked by a passkey | A browser-held secp256k1 key, encrypted at rest and unlocked by the passkey | Works with #1558 as merged. But it is a key: it can be lost with the browser, which is the very thing a passkey wallet was meant to remove |
| B. Passkey smart account + ERC-1271 in the engine | Engine accepts and verifies ERC-1271 signatures, and USDC must accept them too | The real "no key to lose" answer. An engine change (MAJOR), and the USDC question above first |
| C. Passkey smart account, gas sponsored, plain transfer | The smart account sends the deposit itself, a paymaster pays the gas | No EIP-3009 at all. Adds a paymaster dependency and a second deposit path to keep honest |

Recommendation: answer the USDC question (one read of the token's code on Base Sepolia), then pick B if it
holds, A for a first testnet trial if it does not.

## What this step must never say
- Not "free money": test USDC has no value, and the page says so.
- Not "mainnet", "always" or "guaranteed".
- Not "gasless" until `GASLESS_DEPOSIT_MODE=on` is confirmed in production. Until then the strip keeps its
  "built, switched off" chip.

## How we will know it works
The owner-budget run of 16 Nov 2026 is the bar: real transactions on Base Sepolia, every refusal receipted and
moving nothing, re-read from the chain by a second party. The newcomer version must clear the same bar, run
from the site by someone who has never used a wallet, with every stop they hit written down and turned into a
product change.
