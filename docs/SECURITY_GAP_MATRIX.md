# Security gap matrix

The truthful baseline for `@hyperdag/trustshell` and the engine paths it depends on: what is enforced, what
is only partly enforced, what runs in observe mode, and what is not enforced at all. Written 2026-11-01
(overnight item 1). `tests/baseline-matrices.test.ts` checks every row: the status is in the vocabulary,
every local evidence path exists, and an ENFORCED row has a test behind it. That test checks that evidence
**exists**, not that it is still sufficient; reading the test is still your job.

This page is a map, not a security claim. It does not say the system is secure. Where it disagrees with
[`KNOWN-LIMITS.md`](KNOWN-LIMITS.md), one of them is wrong, and that is a bug.

## Status vocabulary

| Status | Means |
|---|---|
| ENFORCED | Code refuses the bad case, and a named test fails if it stops refusing. |
| PARTIAL | Enforced on some paths; the gap column names the ones it is not. |
| OBSERVE | The check runs and records what it would decide, but decides nothing. |
| NOT_ENFORCED | A known gap, stated. Nothing refuses this case. |
| NOT_CHECKED | Nobody measured it. Not a pass and not a failure. |

Cross-repo rows (`repid-engine:...`) are not checked by this repo's tests. Each carries the date it was read.

## Matrix

| ID | Control | Status | Evidence | Gap |
|---|---|---|---|---|
| S1 | Spend: an unknown or missing origin refuses before any intent row is written | ENFORCED | `src/lib/guarded-payment.ts`, `tests/guarded-payment.test.ts` | Applies only to callers that use `guardedX402Payment`; the lower-level `buildX402Payment` signer has the cap but not the origin gate. |
| S2 | Spend: no policy, or a policy whose `allow` is not the boolean `true`, refuses | ENFORCED | `tests/guarded-payment.test.ts`, `tests/policy-allow-strict.test.ts` | Same caller scope as S1. |
| S3 | Spend: negative, empty or malformed amounts refuse, and the refusal does not echo the value | ENFORCED | `tests/payment-amount-strict.test.ts` | None known. |
| S4 | The SDK refuses plain http to another host, and never sends the key to plain http | ENFORCED | `src/lib/api-url.ts`, `tests/api-url-https-only.test.ts` | Plain http on this machine is allowed (without the key). |
| S5 | A JWT anon-key fallback is refused rather than used | ENFORCED | `tests/dead-jwt-fail-closed.test.ts` | None known. |
| S6 | Secrets are scrubbed from outbound claims; a sentence that is only a secret sends nothing | PARTIAL | `tests/scrub-outbound.test.ts`, `tests/scrub-corpus.test.ts` | Pattern-based: catches the shapes in the corpus, not every secret. A secret in a shape the corpus does not hold is sent. |
| S7 | Local-only mode refuses every send of the person's text | PARTIAL | `src/lib/local-only.ts`, `tests/local-only.test.ts` | Off by default. Reads with no user text (status, repid, proof, leaderboard) still go to the engine. |
| S8 | Published egress table matches what commands actually open | ENFORCED | `scripts/check-egress.cjs`, `tests/egress.test.ts` | Covers the commands in the table; a missing table reads NOT_CHECKED, not a pass. |
| S9 | Guard policy decides CLI actions (default deny for unlisted tools, smallest limit binds, expiry) | PARTIAL | `src/lib/guardrails.ts`, `tests/guardrails.test.ts` | CLI and `trustshell run` only. See the containment matrix for what it does not mediate. |
| S10 | Guard policy is protected owner authority (tamper resistance) | NOT_ENFORCED | `src/lib/guardrails.ts`, `tests/guard-authority.test.ts` | By design today: anything running as the owner's OS user can rewrite the policy, and a hand-edited or unsigned policy is enforced. Changing that is a permission-model decision. |
| S11 | Guard decision ledger is tamper-evident | PARTIAL | `tests/guard-carry-redteam.test.ts` | The chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch. |
| S12 | Carry bundle: only an owner-signed, newer-nonce policy is enforced on import; older or unsigned imports as suggested | ENFORCED | `src/lib/bundle.ts`, `tests/bundle.test.ts` | Signed, **not encrypted**: anyone holding the file can read it. |
| S13 | Autonomy level records are authentic | NOT_ENFORCED | `src/cli/guard.ts`, `tests/autonomy.test.ts` | An edited record is refused, but a record is unsigned, so a fabricated one is accepted. Autonomy is SHADOW by default. |
| S14 | Key vault KDF strength | PARTIAL | `lib/vault.ts` | PBKDF2-SHA256 at 250,000 iterations, below current guidance; Argon2id not used. |
| S15 | Key vault: the served bundle cannot read keys | NOT_ENFORCED | `docs/KNOWN-LIMITS.md` | We serve the JavaScript that unlocks the vault. No Subresource Integrity or reproducible build hashes. |
| S16 | Payment authorisation by grant (ControlProof gate on the pay route) | OBSERVE | `docs/KNOWN-LIMITS.md`, `repid-engine:src/routes` | Records what it would decide; decides nothing. Per KNOWN-LIMITS (reviewed 2026-08-20); not re-probed tonight. |
| S17 | Grants mint-floor predicates G1, G3 | NOT_CHECKED | `docs/KNOWN-LIMITS.md` | No measured caller. |
| S18 | Settlement: one piece of evidence pays once; actor taken from the key; no self or same-owner verifier | ENFORCED | `repid-engine:tests/actor-binding-score-routes.test.ts`, `repid-engine:tests/bounties-verify-auth.test.ts` (repid-engine #1470 on main, checked 2026-11-01) | Open cases (overnight item 2): one proof reused by two agents, same owner with different wallets, cross-chain event reuse, repeated transfers in one transaction, missing RPC data, refund cycles, ownership transfer mid-settlement. |
| S19 | Settlement uniqueness is a database constraint, not only an app check | NOT_CHECKED | `repid-engine:tests/bounties-verify-auth.test.ts` (#1470 carries no migration, checked 2026-11-01) | Whether the production schema has the constraint was not read. |
| S20 | Kernel client: anything but a clean ALLOW bound to this request is a refusal (network error, timeout, non-200, bad shape, DENY, NOT_CHECKED) | ENFORCED | `src/lib/kernel-client.ts`, `tests/kernel-client.test.ts` | Only callers that ask the kernel are covered; nothing forces a caller to ask. |
| S22 | Kernel attenuation (a child capability ⊆ its parent) and authority = min(owner grant, domain RepID eligibility, safety floor), with stake as a separate money cap | NOT_CHECKED | `src/lib/kernel-client.ts`, `repid-engine:src` (not read tonight, 2026-11-01) | The engine kernel exists (`POST /api/v1/kernel/decide`, default-deny, signed owner policy, per this client's header). Whether it attenuates and composes authority this way was not read. Overnight item 3 starts by reading it, not by building a new one. |
| S21 | Prompt contents retained by the backend | PARTIAL | `docs/KNOWN-LIMITS.md` | Full prompts are not stored, but the first 200 characters are (`anfis_routing_logs.prompt_preview`). |

## What this page does not cover

- Adaptive attackers. See [`red-team.md`](red-team.md) for what the scheduled red team measured and what it does not say.
- The engine's own database policies (RLS). Those live in `repid-engine` and are not restated here.
