# Check the signer (T6 — signer-aware verification)

The ERC-8004 ReputationRegistry is **permissionless**: anyone may post a `tag1=hyperdag_repid` row
against any agent, and verification is **keyless**. So "check the signer" is the real safety step, and
it is not a single-address check anymore.

**Two of our addresses post `hyperdag_repid` feedback today**, both expected, both ours:

| role | address |
|---|---|
| writer | `0xb24268884472E7613aA58D38C8813f7Af1667382` |
| attestor | `0xf6eE1768868c3266868edcA78bC41C50309cb22A` |

That is the trap this helper exists for:
- A verifier that **filters to the writer alone silently drops** the attestor's rows.
- A verifier that **accepts everything accepts a stranger**.

`verifySigner` / `classifySigners` do neither. They label **every** signer against an allowlist and
**return the unknowns flagged** — they never drop a row. `result.signers.length` always equals the
number of signers read.

```ts
import { verifySigner } from '@hyperdag/trustshell';

// Keyless: reads getClients(tokenId) from the permissionless registry (no API key).
const { signers, reasons } = await verifySigner({ tokenId: '6705' });
for (const s of signers) {
  // s.status is 'in-allowlist' (with s.role) or 'unknown' — an unknown is PRESENTED, not hidden.
  console.log(s.address, s.status, s.role);
}
```

Pure form (you already have the signer list):

```ts
import { classifySigners } from '@hyperdag/trustshell';
const labelled = classifySigners(['0x…writer', '0x…stranger']);
// [{ address, status:'in-allowlist', role:'writer' }, { address, status:'unknown', role:null }]
```

## The allowlist is config, not code
The default allowlist ships as **data** — `HYPERDAG_REPID_SIGNERS`, an exported array of
`{ address, role }`. `classifySigners(signers, allowlist?)` and `verifySigner({ …, allowlist })` both
take it as a parameter, so **changing who counts as a known signer is a data edit, not a release**. A
Sean policy decision — accept the attestor as well as the writer, or only the writer — changes a config
value; the helper does not encode that choice.

## This helper recommends no policy
It **presents both signers and lets the caller decide**. It does not say "accept" or "reject", in code
or in docs. What you do with an `unknown` — ignore it, warn, or reject the read — is your call. The one
thing it guarantees is that an unknown is never silently discarded.

*CC2 · 2026-09-15 · T6. Keyless, don't-merge. No claim beyond board #63.*
