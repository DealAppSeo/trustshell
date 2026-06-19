# PUBLISH CHECKLIST — @hyperdag/trustshell

**Publish is Tier-3 (Sean only).** CC builds + verifies; Sean runs `npm publish`.

## Version
- `0.5.0` (was 0.4.0 published) — adds guest-first onboarding, deferred claim, `whoami`/`credential`, thin trust client. Minor bump (new features, no breaking change to existing `score`/`verify`/`getRepID`).

## Verified (CC, 2026-06-18)
- [x] `npm run sdk:build` → tsc exit 0, emits `dist/cli.js` (bin, with shebang) + `dist/lib/*.js`.
- [x] `npm run prepublishOnly` (`sdk:build && sdk:test`) → **PASSES, 7/7 tests green** (jest + ts-jest added to devDeps + `jest.config.js`; previously jest was missing → prepublish would have failed).
- [x] `bin` → `dist/cli.js`; `files` → `dist`, `src/lib`, `README.md`.
- [x] `dependencies` slim: only `@hyperdag/proof-verifier@0.2.0` (no Next/React in runtime deps).
- [x] **Live acceptance (read+write, throwaway agents):**
  - `node dist/cli.js init` (zero input) → onboarded custodian + agent, HAL-checked call on free models (`cerebras:TRUE`, `mistral:TRUE`), printed RepID 200. Agents `0b14a13c…`, `f4b817f9…`.
  - `claim --email` → staged locally (handle hashed, raw never stored), exit 0.
  - `whoami` / `credential` → DID + nullifier + RepID + per-vertical (defensive) + claim state.
- [x] Privacy: DID + nullifier (commitment) printed; raw identity/handle never persisted.
- [x] Honest early-stage disclosures in README.

## Pre-publish steps for Sean
1. `cd trustshell && git checkout feat/cc-2026-06-18-trustshell-init` (after merge to main, from main).
2. `npm install --legacy-peer-deps` (devDeps incl. jest).
3. `npm run prepublishOnly` — confirm green.
4. `npm publish --access public` (scoped public package).
5. Smoke from a clean dir: `npx @hyperdag/trustshell@0.5.0 init` → expect the onboarding card + RepID.

## Known limitations (ship-honest; not blockers)
- **Identity claim is endpoint-stubbed.** `POST /api/v1/identity/claim` is **GA-owned and not live yet** — `claim` stages locally by default and flags GA. Set `TRUSTSHELL_CLAIM_ENABLED=true` to attempt once GA ships it (degrades gracefully on any not-live response). **Dependency: GA.**
- **Per-vertical is consumed defensively.** `whoami`/`credential` try `GET /api/v1/repid/:id/credential` for the per-vertical breakdown; until GA ships `v_repid_by_vertical` + the credential payload, it shows "pending (GA)". **Dependency: GA.**
- **`conservator_address` typed column** is set by the register endpoint **only after** the one-line repid-engine fix merges (`feat/cc-2026-06-18-conservator-column`); until then it lives in `constitution` JSON (functional, just not column-queryable).
- **`submitOutcome` hits a backend bug** (NOT the SDK): the apply trigger errors `null value in column agent_id of relation agent_repid_history` on externally-submitted score events — flag for the apply-wire owner (backend/GA). The SDK request shape is correct.
- CJS only (no ESM dual-package yet); `ethers` is an optional peer-dep for on-chain reads.

## Out of scope (other lanes — do NOT publish changes to these from here)
- Settlement / ERC-8004 / per-vertical compute → GA. Agent loop / telegram / stats → XC.
