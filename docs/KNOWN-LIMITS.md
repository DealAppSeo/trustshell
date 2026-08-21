# Known limits

What this system does **not** do yet, stated plainly.

This document exists because the recurring failure mode in trust software is a
system reporting success it has not earned — a skipped check scored as a pass, a
green build over undefined references, a badge that says VERIFIED over something
nobody measured. A page of limits is the cheapest defence against that, and it is
also the fastest way for a reviewer to find the interesting parts.

Every entry below is something we checked. Where a limit is a deliberate design
choice we say so; where it is unfinished work we say that instead. If you find
something here that is *worse* than described, that is a bug in this document and
we want to hear about it — see [`SECURITY.md`](https://github.com/DealAppSeo/repid-engine/blob/main/SECURITY.md)
in `repid-engine`.

Last reviewed: 2026-08-20.

---

## The status vocabulary

Four states, and the distinctions between them are the product:

| State | Means |
|---|---|
| **MEASURED** | A named check ran and passed. Traceable to that check. |
| **APPROXIMATE** | Measured, but against a documented proxy rather than the real quantity. Always carries its caveat. |
| **NOT_CHECKED** | Nobody looked. **Not** a warning, and not a failure — an absence. |
| **FAILED** | A check ran and did not pass. |

`NOT_CHECKED` renders neutral and achromatic rather than amber, deliberately:
amber asserts that something is *wrong*, which is a claim nobody measured, in the
same way a green tick asserts a success nobody measured. Both are the same error
pointed in opposite directions.

---

## Limits by surface

### Activity is this device only

`/history` reads a local IndexedDB store. It shows what **this browser** has done
— not a global, cross-agent feed of GateRuns, score events and pay decisions.

Clearing site data erases it. Another device shows nothing. There is no server-side
copy, which is also why it cannot be tampered with remotely — the limit and the
privacy property are the same fact.

**Not** a stepping stone that's half-built: a global activity feed is a different
design with different privacy consequences, and we have not decided to build it.

### Authority cannot state its own measurement status

`/stake` shows an authority ceiling as a number with no MEASURED / NOT_CHECKED
indication, and it cannot currently do better. The backing endpoint
(`GET /api/v1/stake/authority/:builder_id` in `repid-engine`) returns the value
and its basis, but no measurement outcome.

Rendering a status the backend never returned would be exactly the failure this
vocabulary exists to prevent, so the surface stays silent rather than guessing.
Closing this needs backend work on the authority path, not a UI change.

### A_eff is an approximation, and says so

Effective authority is defined as `min(R_route, 100·√S_real) · 1[builder ≥ floor]`.
`repid-engine` **cannot compute the true, decay-adjusted `R_route`** — that comes
from a different engine in another repository. It passes the ledger value instead,
and stamps every result `rRouteIsLedgerApproximation: true`.

The consequence, stated in that file's own header: mint-floor checks are measured
against a conservative-in-name-only proxy and are **explicitly not** measured
against the locked formula. Where a surface shows this, it must show `APPROXIMATE`
with the caveat attached — never a bare `MEASURED`.

If decay is latent on the grantor's agent, this can **overstate** authority.

### Most grants have unverified mint consent

A grant records `signature_status`. `VERIFIED` means the grantor's registered
wallet signed the EIP-712 mint intent. `NOT_CHECKED` means the grantor has no
wallet on record, so consent was never cryptographically checked — which is the
case for most agents today, because wallet registration is optional and recent.

These are rendered distinctly and are never treated as equivalent. A grant with
`NOT_CHECKED` consent is still a real, enforced grant; what is unproven is that
the named grantor authorised it.

### Prompts leave your device, and a 200-character preview is retained

The `/history` entry above is about *history rows*. It is not a claim that nothing left
your machine, and the two are easy to conflate.

Running a prompt sends it to the router (`POST /api/v1/llm/complete`) and on to whichever
model provider answers it. HAL scoring is a second server-side call. Both are how an
answer and a score get produced at all — there is no local inference path.

The backend retains `anfis_routing_logs.prompt_preview`, the **first 200 characters** of
every prompt, on both the success and failure paths, for routing quality. Alongside it:
provider, model, token counts, latency, cost. **Full prompts and full answers are not
stored** — several modules say so explicitly, and `routing_decision_records` was designed
with "no prompt text and no prompt preview" as a stated constraint.

So the accurate claim is *"your history is yours"*, not *"nothing left your machine."* If
a prompt must never leave your machine, do not send it through a hosted router — this one
included.

### Founder Mode events are device-local, with no durable backend

Notes filed in Founder Mode are tagged `actor=founder`, kept out of end-user
telemetry, and stored **on that device only**. The event contract is specified;
the backend that would persist it is not built. The UI says so at the point of
filing rather than in a footnote.

---

## Limits in the trust engine

### Sprint-3 stubs: constitutional audit, ZKP, EAS attestation

Several layers are deliberate contract surfaces awaiting real implementations:

- **Constitutional audit** — currently a stub. Gated behind
  `CONSTITUTIONAL_AUDIT_ENABLED`, **default off**, and non-load-bearing: while
  disabled its output influences no score, no verdict and no tool gate. A stub
  that always passes must never steer anything or be reported as a measurement.
- **ZKP** — a stub prover is always-on; the real wiring is not.
- **EAS attestation** — stubbed in the same way.

These are not bugs to be "fixed" by hardcoding a passing result. That would
convert an honest absence into a false measurement, which is worse than the gap.

### Grants: G1 and G3 are NOT_CHECKED

Of the eight grants predicates, mint-floor enforcement (G1, G3) has no measured
caller yet. G2, G4, G5, G7 are backed by existing checks; **G6** — grantor
revocation, the one that makes authority genuinely revocable — is MEASURED
end-to-end, in CI and against production.

### Payment authorisation is in observe mode

The ControlProof gate on the pay route runs in **observe**: it records what it
would decide and does not decide it. A grant does not currently approve or deny a
payment. This is a deliberate switch, not an oversight, and flipping it is a
decision with real consequences rather than a config tweak.

### No federated learning, no differential privacy

Nothing learns across users. There is no gradient sharing, no model update
upload, no cross-tenant aggregation — and correspondingly, no privacy budget,
because there is nothing to bound.

We mention this because the absence is easy to misread as an unstated feature.
If such a thing is ever built it will be opt-in and bounded, and this document
will say what ε it runs under.

---

## Limits in the key vault

### It is non-custodial — with one honest qualifier

Provider keys are encrypted in the browser (PBKDF2 → AES-GCM-256) and stored
locally. The passphrase never leaves the device, so there is no server-side copy
to leak or subpoena. That property is real.

The qualifier: **we serve the JavaScript that runs in your browser.** Whoever
controls the served bundle could read the keys at unlock time. So the accurate
claim is *"we never receive your keys"* — not *"we could not possibly access
them."* Making the stronger claim verifiable needs Subresource Integrity and
reproducible builds with published hashes, which are **not** in place yet.

Zero-knowledge proofs do not solve this and are not claimed to. ZKP proves a
statement about data without revealing it; custody is a different problem, solved
by client-side encryption plus build integrity.

### KDF iterations are below current guidance

The vault derives its key with PBKDF2-SHA256 at 250,000 iterations. Current OWASP
guidance is higher, and Argon2id is preferred where available. Hardening this is
logged as V1 work: raise the count, version the vault blob, re-wrap on next
unlock.

### Losing the passphrase loses the vault

By construction. There is no recovery path, because a recovery path we control is
custody by another name. Export your vault file if that matters to you.

---

## Limits in how we verify our own claims

### The end-to-end suites are not in gating CI

Two suites cover the product path — a 24-assertion walk of the whole first-run
journey, and a 10-assertion grants fail-closed suite that proves an unreachable
service is never rendered as "no grants". Both pass.

Neither runs in pull-request CI. They need a browser and a running server, and a
gate that goes red for environmental reasons gets ignored within a week — at
which point it is worse than no gate. They run on demand:

```bash
npm i -D playwright && npx playwright install chromium
npm run test:mvp-walk
npm run test:grants-fail-closed
```

Playwright is deliberately not a dependency. Absent, these exit **2 =
NOT_CHECKED** rather than failing — "we did not look", not "it passed".

### There is no version endpoint on this domain

`trustshell.dev` exposes no `/api/version`, so you cannot tell from the outside
which commit is serving. A 200 from the domain proves the site is up, not that it
is running current code: a platform keeps the last successful build serving when a
new deploy fails, so a green pipeline and a healthy page are both compatible with
week-old code.

Sibling surfaces in this ecosystem do expose `/api/version`. This one does not
yet.

---

## What we are confident about

Short, because confidence should be expensive:

- **Agents never hold your keys.** They act only inside grants you issue, and the
  grants module has no code path to the vault.
- **Revocation works, and cascades.** A revoked grant denies everything delegated
  beneath it, on the next read, verified against production — not just in tests.
- **An unreachable service is never rendered as an empty result.** "We could not
  check" and "there is nothing" are distinct states on every surface, with a test
  that fails if they are ever collapsed.
- **Nothing here claims a measurement it did not make.** That is the property this
  whole document exists to keep true.
