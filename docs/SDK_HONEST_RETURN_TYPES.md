# SDK honest return types (shipped — LOOP T4, board #63)

Generated from the types in `src/lib/trustshell.ts` + `src/lib/honest-contract.ts`. A return type that
carries its own evidence cannot lie, and then the docs cannot drift from it. Every field comes from a
real source; when a value is not in the backend response the SDK returns `null` **with a reason** in
`reasons` — it never omits the field and never fills a plausible default.

## `verifyOutput(output)` → `VerifyOutputResult`
| field | type | source |
|---|---|---|
| `verdict` | `'PASS' \| 'FLAG' \| 'VETO'` | HAL decision |
| `grounding` | `'none' \| 'hal' \| 'payment'` | `'hal'` only when a real provider quorum spoke (≥1 evidence); `'none'` = HAL could not check |
| `providersUsed` | `number` | **MEASURED** provider count = `evidence.length` — never a constant (live 2026-09-14 = **2**, groq + cerebras, not 6) |
| `evidence` | `string[]` | per-provider verdicts |
| …plus existing `ok`, `trustScore`, `halScore`, `soft`, `signals`, `decisionReason`, SBFA fields |

## `getRepID(agentId)` → `RepIDResult`
| field | type | source |
|---|---|---|
| `repid` / `tier` | `number` / `string` | `GET /api/v1/repid/:id` (`repid_score`, `tier`) |
| `minted` | `boolean \| null` | real on-chain mint? Derived from `erc8004_address`/`erc8004_token_id` when present; a `external:…`/`pending-mint:…` address is **not** a mint. **`null` when the endpoint does not expose it** (it currently does not) — never defaults to `true`. |
| `signer` | `string \| null` | publishing signer when exposed; else `null` + reason |
| `scoreLane` | `string \| null` | from the real `source` field; else `null` + reason |
| `reasons` | `Record<string,string>` | why any field above is `null` — never empty when a field is null |

> Today `GET /api/v1/repid/:id` returns only `{ agent_id, last_updated, repid_score, source, tier }`, so
> `minted` and `signer` come back `null` **with a reason**, and `scoreLane` = `source`. That is the point:
> 43% of agents are keyless-never-minted (board #63 item 4) and this call cannot tell you which — so it
> says so, rather than claiming `minted: true`.

## `presentProof(agentId, { verify })` → `ProofPresentation`
| field | type | source |
|---|---|---|
| `proofBytes` / `scheme` / `statement` / `createdAt` | … | `GET /api/v1/repid/:id/proof` |
| `signer` | `string \| null` | engine publishing signer when the payload carries it (`signer`/`eas.attester`); else `null` + reason |
| `note` | `'not a registry aggregate'` | fixed honest label: a presented proof is an engine-signed postcard, **not** an aggregate of registry rows (board #63 item 3/7) |
| `reasons` | `Record<string,string>` | why `signer` is null, when it is |
| `verification?` | `{ verified, error, verifierVersion }` | client-side WASM (`presentProof({ verify: true })`) |

## Tests (pure derivations)
`tests/honest-return-contract.test.ts` asserts: grounding `none`↔`hal`; `providersUsed` varies with evidence
(not a constant); a `null` field carries a reason; `minted` treats `external:`/`pending-mint:` as **not**
minted. `npm run verify` green.

*CC2 · 2026-09-15 · T4. Shipped types + tests; don't-merge. No claim beyond board #63.*
