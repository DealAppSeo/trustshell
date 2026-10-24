# Trust Receipt v0: a design draft

**Status: DESIGN. Not implemented, not ratified, not part of 1.8.0.** Schema id
`dev.trustshell.trust-receipt/0.1-draft`: [`schemas/trust-receipt-v0.schema.json`](../schemas/trust-receipt-v0.schema.json).
Nothing in TrustShell writes or reads one yet.

One record any host (an OpenClaw plugin, an ERC-8004 integration, a CLI) can hand another, keeping apart what an
agent was asked to do, what it was allowed to do, what it says it did, and what the evidence shows. It adds no
evidence format: observations are [`dev.trustshell.action-evidence/0.1-draft`](action-evidence.md) records.

## The contract

A file is `{ receipt, digest, signature }`, like an action-evidence file's `{ record, digest }`.

| Part | Meaning |
|---|---|
| `intended` | What the agent was asked to accomplish, as the requester put it. Or null. |
| `authorized` | What the owner permitted, under a named `mode`. `LOCAL_GUARDRAIL`: owner-editable, binding only the paths it mediates. `PROTECTED_OWNER_AUTHORITY`: enforced by a component the agent cannot rewrite; nothing emits it today. Or null. |
| `executed` | What the executor reports happened, in its own words, and which executor. A report, never a finding. Or null. |
| `observed` | Action-evidence records, `EMBEDDED` or `REFERENCED` by uri. Their verdicts stand; the receipt never re-grades. |
| `unknown` | Each gap as an entry (`NOT_RECORDED`, `NOT_CHECKED`, `INACCESSIBLE`, `OUTSIDE_OBSERVATION`) with a pointer to it. Never empty. |
| provenance | On every part: `source` (as stated), `origin` (`STATED`, `SELF_REPORTED`, `PLATFORM_REPORTED`, `INDEPENDENT`), `integrity` (`NONE`, `DIGEST_ONLY`, `SIGNED`), `digest`, `signature`, `verifier` (tool, version). On the receipt: `assembled_by`, `assembled_at`, `digest`, `signature`. |
| `payment` | Reserved: null in v0. |

## Rules, and how the schema checks each

1. **A digest is not a signature.** A digest shows content is unchanged against a copy of that digest from
   elsewhere; in the same file it catches only accidents. Only a signature the reader verifies names a key, and a
   key is not a person. *Checked:* `DIGEST_ONLY` forbids a signature, `SIGNED` requires one (Guard's shape: Ed25519
   over RFC 8785 bytes), `NONE` forbids both.
2. **Offline covers only what the receipt carries.** *Checked:* `EMBEDDED` requires the record and forbids a uri;
   `REFERENCED` the reverse. Reading GitHub or a chain again is a separate, labelled capability that yields a new
   observation with its own `fetchedAt`, never an edit.
3. **Three outcomes, never two.** `SUPPORTED`, `CONTRADICTED`, `NOT_CHECKED`; NOT_CHECKED is never a pass.
   *Checked:* status is that enum, every claim has a scope and a reason, and closed objects refuse a `pass` flag.
4. **The authority mode is named, never implied.** *Checked:* `mode` is required, no default.
   `PROTECTED_OWNER_AUTHORITY` requires an `enforcer` and a `SIGNED` policy: necessary, not sufficient (open
   question 2). A signed policy is still `LOCAL_GUARDRAIL`.
5. **A green CI run is not delivered work.** *Checked:* `payment` is null. A payment part first needs four bindings:
   the exact deliverable, the acceptance criteria, the beneficiary or counterparty, and independent outcome evidence.
6. **Nothing missing is silent.** *Checked:* a null part or an empty `observed` needs a `NOT_RECORDED` entry.

Well-formed is not valid: a verifier still recomputes digests, verifies signatures and resolves pointers.
[`tests/trust-receipt-schema.test.ts`](../tests/trust-receipt-schema.test.ts) validates the example and refuses one
breach of each rule.

## Worked example: run 39619591025

[`schemas/trust-receipt-v0.example.json`](../schemas/trust-receipt-v0.example.json) embeds, unchanged, the record the
site serves ([`public/samples/inspect-39619591025/record.json`](../public/samples/inspect-39619591025/record.json)): a
staged challenge, not an observed agent failure. Receipt digest
`310d16bb4746c56a58415f4851396ae7f2a13fc41820ba12d238439f1db673f0`.

| Part | In the example |
|---|---|
| intended, authorized | null: no task was given, and no policy was in force (Inspect reads a finished run; it mediates nothing) |
| executed | the two claim sentences; `executor` null; `STATED`, integrity `NONE` (written by hand) |
| observed | one `EMBEDDED` record, digest `e45fa23a…bb35` as its card prints, `PLATFORM_REPORTED`, `DIGEST_ONLY`, verifier version null. Its verdicts: run identity SUPPORTED twice; "the check workflow succeeded" SUPPORTED on the line citing only the run; commit `5d1c5e3f57e1` CONTRADICTED (the run is on `392797a69b6a`); that line's outcome NOT_CHECKED |
| unknown | 8: the three missing parts; the NOT_CHECKED claim; whether GitHub still says the same; the producer's version, absent from the record; its `does_not_prove` list, pointed at; whether any paid work was delivered |
| provenance | per part, as above; the receipt `DIGEST_ONLY`, `signature: null`, assembled by hand |

`DIGEST_ONLY` describes the record as a document. Its own `cryptographic_integrity: NOT_CHECKED` describes GitHub's
answer inside it: no attestation of that was read.

## What verifies offline, and what does not

| Offline, from the receipt alone | Not offline |
|---|---|
| each digest against its content: the receipt, each embedded record | whether GitHub, a chain or a policy still says the same (online, labelled) |
| each carried signature against its own public key | whether that key is the owner's, or any person's |
| every pointer resolves; every status is one of three | a `REFERENCED` record: NOT_CHECKED until fetched and matched |
| | whether a `STATED` or `SELF_REPORTED` part is true |

## How integrations would map (none exists)

**ERC-8004 feedback** would point at a receipt, not live in one: `giveFeedback`'s `feedbackURI` and `feedbackHash`
(a `bytes32`, which a sha-256 fills) would name a receipt and its digest, binding a rating to one fixed body of
evidence (the missing link in [DealAppSeo/trustshell#589](https://github.com/DealAppSeo/trustshell/issues/589)).
Reading it back is the online capability and shows only that some address posted it; `giveFeedback` is
permissionless ([S1_A7_READPATH_VERDICT.md](S1_A7_READPATH_VERDICT.md)), so the rating stays `STATED`.

**x402.** v0 records no payment. `guardedX402Payment`'s policy and cap come from the calling code, not
authenticated as the owner's, so a cap goes under `executed` (the executor's own limit), never `authorized`. A
later payment part binds a settled payment to rule 5's four bindings; a SUPPORTED CI claim meets none of them.

**OpenClaw hook adapter**, a spec only ([starter task 7](good-first-issues.md#7-the-openclaw-hook-adapter-a-spec-and-a-harness)):
the user's request fills `intended`; `before_tool_call`'s decision, `authorized` (`LOCAL_GUARDRAIL`);
`after_tool_call`, `executed` (tool, parameter hash, outcome, duration, `SELF_REPORTED`); `trustshell check`, `observed`.

**Guard and Carry, later.** Guard ([#593](https://github.com/DealAppSeo/trustshell/pull/593),
[#607](https://github.com/DealAppSeo/trustshell/pull/607), [#608](https://github.com/DealAppSeo/trustshell/pull/608))
would fill `authorized`: the policy's RFC 8785 sha-256, its install-key signature, its `actions` as `permits`, mode
`LOCAL_GUARDRAIL`, because it decides only for `trustshell run` and its own CLI and whoever runs the CLI as the owner
can change the policy ([guard-carry-demo.md](guard-carry-demo.md)). A `guard-record/1` line's `executed` is what
the started process reported, never what it did; its `assurance_scope.not_mediated` becomes `OUTSIDE_OBSERVATION`
entries. A Carry bundle would supply `REFERENCED` observations and a signed policy; its signature grants nothing,
so the receiving host's own guard sets the mode.

## Open questions

1. [`receipt.schema.json`](../schemas/receipt.schema.json), [`kernel-receipt.v1.json`](../schemas/kernel-receipt.v1.json)
   and Guard's `guard-record/1` already exist. Proposed: this is the envelope that names them by digest, not a
   fourth competitor. Or should one absorb the others?
2. What makes `PROTECTED_OWNER_AUTHORITY` sufficient, e.g. an enforcer under an OS account the agent cannot use?
   Until defined, should v0 refuse the mode, as it refuses `payment`?
3. Carry's evidence pointer hashes file bytes (`9e523645…` here); the receipt binds the RFC 8785 digest
   (`e45fa23a…`). Same evidence, two hashes: should Carry add the canonical digest, or the receipt accept bytes?
4. The record does not name its producer's version. Add it in action-evidence 0.2?
5. Is a new evidence source (an ERC-8004 read-back, an x402 settlement) a new `platform` inside action-evidence
   (proposed: one format) or a new observation `kind`?
6. Who signs a receipt, and with which key: the assembling host's install key, or one the owner names?
