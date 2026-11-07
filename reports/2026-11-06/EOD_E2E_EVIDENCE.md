# TrustShell / TrustLattice — EOD E2E Evidence (2026-11-06)

**End state: YES — one genuine, independently-reproducible trust cycle runs green, verified from a clean
`@hyperdag/trustshell/verify` install.** Everything below is offline / inert: no network during
verification, no chain write, no live RepID, no prod data change. Signer is an **ephemeral test key**;
public issuance is **NOT_CHECKED** by design. `[V]` = a check I ran and watched pass; `[R]` = reported.

Reproduce (committed suite): **`npm run test:trust-cycle`** — builds the SDK, mints the two signed
receipts through the real `guardrails.decide`, and runs the 16-experiment matrix through the shipped
`dist/verify` ([`tests/e2e/trust-cycle-walk.mjs`](../../tests/e2e/trust-cycle-walk.mjs), hermetic/offline).
The dated artifacts in [`e2e-artifacts/`](e2e-artifacts/) are a **frozen snapshot** from the stronger
"stranger" reproduction — a clean `npm pack` + `npm install` of the published tarball, verifying through
the package `exports` map (`@hyperdag/trustshell/verify`); `verify-matrix.json` is that run's recorded output.

---

## 1. The reviewable change is pushed (authorized action)

| Item | Value |
|---|---|
| Branch | `claude/trustlattice-verify-2026-11-06` → pushed to `DealAppSeo/trustshell` [V] |
| Draft PR | **#676** (base `main`, draft, **no merge**) · CI 2 passing / 1 pending at bind [V] |
| Commits (parent `045bd37e`, on `origin/main`) | `f07c8781` verifier + v0 corpus · `1030a949` verify-receipt CLI · `30e9b21e` +4 adversarial vectors · `be85a595` `verifyReceiptChain` |
| Diff surface | conformance/, docs/protocol/VERDICTS.md, package.json, src/cli/index.ts, src/lib/verify-receipt.ts, src/verify/index.ts, tests/ — **no `dist/`, no XC3** [V] |
| Secret scan | `gitleaks 8.30.1`, `045bd37e..HEAD`, 4 commits → **no leaks found** (exit 0) [V] |

## 2. The trust cycle (producer: `tests/e2e/trust-cycle-walk.mjs`) [V]

Real owner policy (actions `['tool:write-artifact','spend']`, `per_tx_raw=1,000,000`), driven through
trustshell's **actual** `src/lib/guardrails.decide()` — not a mock:

- **GRANT** — request `tool:write-artifact` (class `other`) → `decide` = **ALLOWED**. The authorized tool
  wrote a deterministic artifact; `sha256 = 0xb44ce6005f1b30c1813cb5c38f7aa52561e29d368dbbbe4fb0746d28da1e7c43`.
- **REFUSE** — request `spend` `amount_raw=2,000,000` → `decide` = **DENIED**, reason
  `"2000000 is over per_tx_raw 1000000"`. No artifact, nothing authorized.

Two `kernel-receipt/2` minted with the engine's exact signing recipe (ephemeral Ed25519 test key),
chain-linked ALLOW → DENY:

| Receipt | verdict | receipt_hash (this run) |
|---|---|---|
| A (root) | ALLOW | `0x25469c9d2e2a0ebafa1238ed149dff2da705e20a2f2bca077e940d00de2f23b0` |
| B (child, prev=A) | DENY | `0x84d74890e55c2df2dda34e48a74800b8dc99cad35cb59bac9766029262d91b16` |

> The signer is **ephemeral per run** and the Ed25519 signature is part of the hashed body, so the two
> `receipt_hash` values change every run — a reproducer will see its own pair in `context.json` (public
> root `0x5c76044e…`). The `artifact sha256` above is content-addressed and stays `0xb44ce6…`.

## 3. Independent verification from a CLEAN install (clean-room, dated run) [V]

`npm pack` → `hyperdag-trustshell-1.9.0-dev.0.tgz` → fresh temp project → `npm install` (97 pkgs, exit 0)
→ `npm install ethers@^6` (the optional peer dep keccak needs) → driver imports **`@hyperdag/trustshell/verify`**
through the real `exports` map and knows only the receipt files + the pinned public root.

**16-experiment matrix — 16/16 as expected:**

| # | experiment | result |
|---|---|---|
| 1 | ALLOW, test root pinned | integrity **VERIFIED**, sealer **trusted**, verdict ALLOW |
| 2 | ALLOW, no root (public posture) | integrity VERIFIED, sealer **untrusted** |
| 3 | DENY, test root pinned | integrity **VERIFIED**, verdict DENY (cap reason bound in) |
| 4 | chain [ALLOW→DENY], pinned | chain **VERIFIED**, broken_at null |
| 5 | ALLOW, **wrong** root | integrity **FAILED**, sealer untrusted |
| 6 | ALLOW verdict flipped | integrity **FAILED** |
| 7 | ALLOW args_hash swapped | integrity **FAILED** |
| 8 | DENY reason rewritten | integrity **FAILED** |
| 9 | ALLOW downgraded to unsigned /1 under pin | integrity **FAILED**, sealer untrusted |
| 10 | ALLOW schema → unknown | schema **MALFORMED** |
| 11 | chain, DENY.prev_hash wrong | chain **FAILED** @1 |
| 12 | chain, DENY.prev_receipt_id wrong | chain **FAILED** @1 |
| 13 | ALLOW + bound six-claim envelope, pinned | envelope **BOUND**, but authorization/containment **NOT_CHECKED** — the envelope is unauthenticated (see correction below) |
| 14 | same envelope, no root | envelope BOUND but authorization **NOT_CHECKED** (sealer unconfirmed → downgrade) |
| 15 | DENY + bound envelope, pinned | authorization **FAILED** (a self-reported refusal is surfaced, not downgraded) |
| 16 | ALLOW + the DENY receipt's envelope | **PRESENT_UNBOUND** → authorization NOT_CHECKED (binding enforced) |

> **CORRECTION (2026-11-07, after Strix review of PR #676).** An earlier version of this line claimed
> experiment 13 showed `authorization` **verifying independently (VERIFIED)** under the pinned root.
> **That was an over-claim and is wrong.** The six-claim envelope is **not covered by the receipt's
> Ed25519 signature** — the signature seals the receipt bytes, and the envelope only names the receipt
> by id+hash. So offline, the envelope's attestations (authenticity/observation/correctness/
> authorization/containment) are **read, not re-derived**: anyone holding a genuine receipt could swap
> the envelope's statuses and the verifier could not tell. The verifier was hardened to surface a
> `VERIFIED` envelope claim as **`NOT_CHECKED`** unless the caller sets `envelopeAuthenticated: true`
> (an authenticated channel, e.g. the API `receipt_response`). So under a pinned root alone (exp 13),
> authorization/containment are **NOT_CHECKED**, not VERIFIED. Only `integrity` (hash + pinned
> signature) is established independently offline. A self-reported `FAILED` (exp 15) is still surfaced.
> Pinned by `conformance/trustlattice/v0/` (18 vectors incl. `clean-valid-pinned-authenticated`) and
> `tests/verify-subpath-import.mjs`; see commit `899d2538` and `docs/protocol/VERDICTS.md`.

**Golden-vector ruler:** `npm run test:trustlattice` → **17 vectors, 0 failures** [V].

## 4. Experimental dual-band RepID — WITHHELD, shadow-only (`dual-band-replay.mjs`) [V]

Competence / Integrity kept as two separate bands (never one scalar). Candidate: Competence +0.02
(1 verified ALLOW + 1 verified DENY + 12/12 controls), Integrity 0. **Award WITHHELD** (`accepted:false`,
`dual-band-shadow.json`, never canonical) for four documented reasons: same-controller (signer = actor =
verifier operator), test signer / public issuance NOT_CHECKED, no independent verifier, and `authorization`
claim NOT_CHECKED. This is the correct anti-gaming outcome: a self-verified test cycle earns no Integrity.

## 5. On-chain, read-only [V 2026-11-06]

The anchoring pipeline is **live and wrote today** — not this cycle, the existing production stream:
`repid_zkp_proofs` 79,729 rows (latest 12:00:46 UTC), `erc8004_reputation_writes` 164 (latest 12:01:04 UTC).
Latest EAS batch (`eas_anchor_batches`, Base Sepolia 84532, keccak256):

- schema `repid-real-proof-batch-v1`, status `anchored`, 12:02:08 UTC, 4 proofs
- tx `0x2a903c1b79f7efb3771cf9311cafdd27d3c0c9951a18c0aee94173ba7a3a558b`
- UID `0x6f919388a26a5cbdb09c78a208e626ae6016986696a5c8fda23516a2a4beacd1`
- merkle_root `0x596a29f916b4136ede78e916fdbc778548f472d59aa5b5537d9a56f2fed06238`

Anchoring **today's E2E receipt root** on-chain was **not** done — that is a gated owner action (§7).

## 6. Honest limitations

- **Ephemeral test signer**, not a production/accountable issuer. With no pin, `sealer.trusted=false`.
- **Six-claim envelope is emitted and bound** (experiments 13–16), but its claims are the issuer's
  attestation, **read, not re-derived** — the envelope is not covered by the receipt's signature. So
  offline, `authorization`/`containment`/`authenticity` surface as **NOT_CHECKED** even under the
  pinned root (they reach VERIFIED only with `envelopeAuthenticated: true`, declaring an authenticated
  channel); `observation` NOT_CHECKED and `correctness` NOT_APPLICABLE throughout. **Only `integrity`
  (hash + pinned Ed25519 signature) is established independently offline.** A self-reported `FAILED` is
  surfaced (exp 15). A production/accountable issuer whose envelope is delivered over an authenticated
  channel, and a real runtime `observation` probe, remain future work. *(Corrected 2026-11-07 — see §3.)*
- The receipt is **minted by the harness** reproducing the engine's recipe; production mints in repid-engine.
- The clean room needed `ethers@^6` (optional peer dep) to recompute the keccak hash — expected and documented.
- **T12 not dispatched from here:** the swarm is alive [V — 12 agents pinging, 271 task-claims/24h] but
  `trinity_tasks` INSERT is RLS-denied to this session; no write was attempted and none is claimed.

## 7. Gated — see `OWNER_ACTION_QUEUE.md`

Canonical RepID write · npm publish · on-chain anchor of today's receipt root · six-claim-envelope wiring
promotion · committing the E2E harness as a reproducible suite.
