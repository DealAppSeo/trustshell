# Owner Action Queue — 2026-11-06 (TrustShell / TrustLattice EOD)

What this session built is inert and reviewable. The items below need **Sean, explicitly, one at a
time** (CLAUDE_RULES r30/r31, D-107 MAJOR = HITL) — they change live state, publish, or write on-chain.
None was done.

## Done, no approval needed (inert, already shipped)
- Draft PR **#676** (verifier slice) pushed; CI running. Review it; **do not** auto-merge (merge is gated).
- EOD E2E ran green from a clean `@hyperdag/trustshell/verify` install (see `EOD_E2E_EVIDENCE.md`).

## Needs your GO (one at a time)

1. **Merge PR #676** — after review. Weight LOW (inert verifier + tests, no live surface), but merge
   authority is yours. One non-authoring reviewer + Strix + CI green per D-107, then you merge.

2. **CORRECTED (2026-11-07, Strix review of #676):** an earlier line here claimed `authorization`
   **verifies independently (VERIFIED)** once the envelope binds. **That was an over-claim.** The
   envelope is not covered by the receipt signature, so offline its attestations are **read, not
   re-derived**, and now surface as **NOT_CHECKED** unless the caller declares an authenticated channel
   (`envelopeAuthenticated: true`). Only `integrity` (hash + pinned signature) is established
   independently offline; a self-reported `FAILED` (the DENY) is still shown. Fix shipped in `899d2538`.
   **Needs your GO for the real path:** a production/accountable issuer that signs the envelope (or a
   receipt that commits to the envelope hash) so these claims can be verified, not just read — a
   repid-engine change, MAJOR. Plus a real runtime `observation` probe.

3. **DONE — committed reproducible suite shipped** in a focused draft PR off `main`: `tests/e2e/trust-cycle-walk.mjs`
   + `npm run test:trust-cycle` (builds the SDK, mints the two signed receipts through the real
   `guardrails.decide`, runs the 16-experiment matrix through `dist/verify`; hermetic/offline). It asserts
   the hardened verifier that landed in `main` via #676. Branch `claude/trustshell-trust-cycle-e2e-2026-11-07`;
   replaces the earlier #677, which GitHub left CONFLICTING once #676's base branch merged. Inert, LOW —
   review + merge are still yours.

4. **Anchor today’s E2E receipt root on Base Sepolia** (the real "on chain" leg). This is an **on-chain
   send** → MAJOR, Sean-only, guard-hook-blocked for agents. If you want it: I prepare the exact capped
   call; you run it with your funded test wallet, or approve via `ALLOW_ONCE`. Read-only today showed the
   pipeline is live (tx `0x2a903c1b…a558b`, 12:02 UTC).

5. **Canonical RepID write** — **NO-GO** by design. The dual-band replay correctly **withheld** (same
   controller, test signer). Canonical RepID stays untouched until an independent verifier outside this
   controller epoch requalifies. Nothing to approve; flagged so it’s on record.

6. **npm publish** — **NO-GO**. Published `latest=1.8.1`; branch is `1.9.0-dev.0`. Not for today.

## T12
Swarm alive [V: 12 agents pinging, 271 claims/24h] but this session **cannot** INSERT into
`trinity_tasks` (RLS 42501). No task dispatched, none claimed. If you want volume/research farmed out,
it needs a dispatch path this session has rights to, or you run the insert.
