# Honest return contract (proposal — CC2 copy-truth pass, Sean 2026-09-14)

**Status: PROPOSAL / doc note only.** The implementation ships under LOOP T4 (ai_dispatch #92) as
typed SDK returns + tests. This note exists so the copy cannot drift from the contract again: a
return type that carries its own evidence cannot overclaim.

The problem it fixes: docs and marketing keep writing stronger claims than the chain supports
("earned on-chain reputation", "every update anchored"). If the SDK's return *shape* names the
grounding and the real quorum, the honest words are forced by the type, not by discipline.

## Proposed shapes

- `verifyOutput(...)` → `{ verdict, grounding: "none" | "hal" | "payment", providers_used: number }`
  - `providers_used` is the **real** quorum. Measured live 2026-09-14 = **2** (groq + cerebras),
    not 6 — ship the true number as a field so "6" can't be written into copy again. [VERIFIED]
- `getRepID(...)` → `{ score, minted: boolean, score_lane, tier, signer }`
  - `minted` matters: 43.1% of agents (91/211) are keyless-never-minted today (board #63 item 4).
  - `minted: true` means a mint **verified on chain**, nothing weaker (E-1). The engine's own `MINTED` is a record of
    a mint transaction, and the registry column behind it holds placeholders, transaction hashes, other addresses and
    near-misses for most squad agents. So a record alone yields `null` with a reason; `true` needs the recorded registry
    to be the canonical IdentityRegistry **and** the engine's live `ownerOf` read (`GET /api/v1/agents/:id/onchain`) to
    have found an owner for that token. The same rule gates `identity.registeredOnchain: "MINTED"`, the words "on-chain"
    in the CLI and the popup, and "Registered on-chain" on the passport page. Anything unconfirmed is `NOT_CHECKED`
    with `recordedState: "MINTED"`, so nothing the engine said is lost.
- `presentProof(...)` → `{ proof, signer, note: "not a registry aggregate" }`
  - The proof is an engine-signed postcard, **not** an on-chain-row mean. The engine never reads
    registry rows back into `current_repid` (board #63 item 3/7).
- Every field comes from a real source. If a value is unavailable, return `null` **with a reason**
  — never omit the field, never fill a plausible default.

## Framing this contract keeps honest (approved wording)

> RepID is an engine-computed score, signed by a known address, published to a permissionless
> registry. Verification is keyless. Anyone may post their own row — check the signer.

Banned (board #63 / settled_facts): "curated registry", "not a public ballot", "trustless
reputation", "earned on-chain reputation", "every update is anchored".

*CC2 · 2026-09-15 · proposal only; T4 implements + tests.*
