<!-- STATUS: NARRATIVE -->
<!-- HAL: UNCHECKED -->
<!-- author: reviewer-cc -->

# TrustShell MVP — REAL vs NARRATIVE vs BLOCKED

Read-only assessment for XC (implementer). I did not edit README, examples, src, tests, CI,
package.json, or AGENTS.md. Live probes below are keyless GET/POST against the deployed backend
— reads only, no writes, no publish.

Probed 2026-09-09 from `C:\Users\Cash4\repos\trustshell`, branch `feat/check-egress-2026-09-08`
@ `2915d59`.

---

## 1. Version reality (confirmed)

| Tree | Value | Source |
|---|---|---|
| npm `latest` | **1.3.0** | `npm view` of the published package → 1.3.0 |
| global CLI on this machine | **1.3.0** | global CLI `--version` → 1.3.0 |
| repo `package.json` | **1.4.0** | file:2 |
| local built `dist/cli` | **1.4.0** | `node dist/cli/index.js --version` → 1.4.0 |

**The 1.4.0 work is real, built, and unpublished.** A stranger doing `npm i` / `npx` gets **1.3.0**.
Do NOT "fix" by publishing — publish is irreversible and the `sdk:test` release gate is broken
(see §6). The gap is the single biggest MVP risk: everything README says is "LIVE" in 1.4.0 that
was added *after* 1.3.0 is unreachable to a stranger.

**Concretely unreachable at 1.3.0:** the `check` command. It exists in tree `dist/cli/index.js`
(grep: 3 hits; `node dist/cli/index.js` lists it) but the README's own launch line
`npx` of this package at 1.4.0 `check <url>` resolves to **1.3.0 = unknown command** today. AGENTS.md
already documents this exact trap ("A command nobody can invoke is not shipped").

---

## 2. Claim inventory (every user-facing README claim)

Legend: **REAL** = probed live / present in built artifact · **NARRATIVE** = design/roster/aspiration,
labeled as such · **BLOCKED** = real code but gated on key/wallet/publish/backend-cadence.

| Claim (README) | Verdict | Evidence |
|---|---|---|
| `TrustShell.init()` live `/health` probe | **REAL** | `curl /health` → **HTTP 200** |
| `verifyOutput(text)` cross-provider HAL quorum, keyless | **REAL (DEGRADED)** | `POST /api/v1/hal/evaluate` keyless → 200 with named per-provider evidence. **But 2/6 providers succeeded** (groq, openrouter TRUE); gemini/mistral/zai = credits depleted / rate-limited, cerebras = model 404. `quorum:"partial"`. See §3. |
| `score(text)` raw HAL signals | **REAL** | same endpoint; `src/lib/trustshell.ts:496` |
| `getRepID(agentId)` keyless RepID+tier | **REAL** | `curl /api/v1/repid/trinity-shofet` → `2150 ESTABLISHED` (README says 2110 — it moves, as documented) |
| `presentProof(agentId)` ZK range proof | **REAL (verifier optional)** | `src/lib/trustshell.ts:850`; `@hyperdag/proof-verifier` dynamically imported, degrades if WASM absent |
| `badge` CLI — client-side-verified SVG | **REAL (1.4.0 only)** | `node dist/cli/index.js` lists `badge`; committed `examples/proof-badge-trinity-shofet.svg`. Not verified via published 1.3.0 CLI. |
| `verify` CLI as CI gate (exit 0/1/2/3) | **REAL** | present in `dist/cli`; `examples/ci-gate/trust-gate.yml` |
| `check <run-url>` — GitHub public-API card | **BLOCKED (publish)** | in tree/dist 1.4.0; **absent from published 1.3.0** → `npx … check` = unknown command for strangers. §1. |
| `listServices()` / `getService()` keyless | **REAL** | `curl /api/v1/services` → **HTTP 200** keyless |
| `register()` keyless onboarding | **REAL, no mint** | `POST /api/v1/agents/register` exists; README states plainly it does NOT mint on-chain identity → `NOT_MINTED` |
| ERC-8004 identity mint | **BLOCKED (key)** | `POST /api/v1/agents/:id/mint` key-gated; keyless path never reaches minter (README self-documents, measured 2026-08-30) |
| `executeA2A()` / `buildX402Payment()` x402 pay | **BLOCKED (key + funded wallet)** | `src/lib/trustshell.ts:955`; needs `REPID_API_KEY` + funded Base Sepolia wallet — moves real testnet value |
| "12 agents minted / 46 lifetime on-chain writes" | **NARRATIVE (unverified here) + self-flagged paused** | I did NOT read BaseScan. README states writes are **paused**, last write **2026-06-22**. Treat count as `[reported]` until a BaseScan read. |
| On-chain writes live cadence | **BLOCKED** | README: anchor worker down, paused. Honest. |
| On-device / "portable mesh" proofs | **NARRATIVE (v2, not shipped)** | README §Honest limits: "v1 is a thin client… on-device proof generation is v2 — not shipped" |
| Behavioral-integrity / deception layer | **NARRATIVE (shadow-only)** | Confirmed in live response: `"enforced":false`, SBFA `reliability_source: "constant-placeholder … NOT a verified-outcome oracle"`, execution_floor `"enabled":false`. Computes+logs, does not mutate RepID. |
| Pythagorean Comma veto | **NARRATIVE (hypothesis)** | README labels it "origin hypothesis… under active falsification… not yet validated on real data" |
| 3+1 node / Trinity roster | **NARRATIVE (design roster)** | README: "design roster, not a running swarm" |
| MCP `@hyperdag/trustshell-mcp` | **REAL (separate pkg)** | published; not re-probed here |
| GitHub install `github:DealAppSeo/trustshell` | **REAL** | ships committed `dist/`; resolves same import surface without build |

Bottom line: the **keyless trust core (verify + repid + services + proof/badge) is REAL and live**.
Everything money/identity/mesh/comma is honestly labeled BLOCKED or NARRATIVE **in the README already**
— this README does not lie. The two things that CAN drift into a lie: (a) the publish gap making 1.4.0
claims unreachable, and (b) the degraded HAL quorum vs the 3-named-provider quickstart example.

---

## 3. HAL quorum: the one live claim most likely to embarrass MVP

Live `POST /api/v1/hal/evaluate` for "The capital of France is Paris." right now:

- **Succeeded: groq (gpt-oss-20b) TRUE, openrouter (qwen-2.5-72b) TRUE** → verdict clean/PASS. Real.
- **Failed 4/6:** gemini (prepayment credits depleted), mistral (rate limit), zai (insufficient
  balance), cerebras (model 404). `signals.quorum: "partial"`, `families_used: 2`.

The README quickstart output shows `gemini / mistral / openrouter` — **two of those three are down
right now.** The verdict is still correctly backed by ≥2 cross-provider evidence, and README §141
already warns "which providers answer moves." So this is not a lie *yet*. But a "live-vs-paused table"
that shows HAL as fully green would be one. **Any MVP status table must show HAL as LIVE-but-degraded
(2/6 providers funded), not LIVE-green.** This is a backend-key/funding issue in repid-engine, not a
trustshell code bug — flag to Sean, don't patch in this repo.

---

## 4. Smallest file set for MVP

**XC should touch (MVP-critical, in priority order):**

1. `package.json` — version/publish coordination **only after** the `sdk:test` gate is fixed (§6).
   This is the load-bearing MVP fix: 1.4.0 must reach strangers or `check` + any post-1.3.0 claim is vapor.
2. `.github/workflows/publish-sdk.yml` — fix the `sdk:test` = `jest --testPathPattern=trustshell`
   bug that matches the repo dir and drags a live-backend dep into the publish gate (documented in
   `check.yml:25-32`). Publish is irreversible; this must be right before any version ships.
3. `README.md` — one truth pass on the keyless-vs-key table (§2) and the live-vs-degraded HAL row (§3).
   No new claims; only align wording to the degraded quorum and the publish state.

**XC should NOT need to touch for the keyless journey:** `src/lib/trustshell.ts`, `src/cli/index.ts`.
They already work live (verified §2). If the MVP is "stranger runs verify + getRepID + `npx verify`",
the code is done; the gap is **packaging/publish**, not logic.

**Files I must not touch until XC's STATUS.md exists** (per this dispatch): `README.md`, `examples/**`,
`src/**`, `tests/**`, `.github/workflows/**`, `package.json`, `AGENTS.md`. I only created
`docs/handoff/CC-ASSESS.md`.

---

## 5. Must-fix vs nice-to-have (the stranger journey)

**Journey A — `npm install` (or github install):**
- MUST: nothing broken — `npm i` of the published package gets 1.3.0 and installs lean (dist-only). ✅
- NICE: publish 1.4.0 so the installed version matches the README.

**Journey B — `verifyOutput()` + `getRepID()`:**
- MUST-FIX: none for correctness — both return live keyless (§2). ✅
- MUST-FIX (honesty): status/table wording must reflect HAL degraded (§3).
- NICE: repid-engine provider funding so quorum is ≥3 again (backend, not this repo).

**Journey C — `npx @hyperdag/trustshell verify "The capital of France is Paris."`:**
- MUST: works today on 1.3.0 (`verify` shipped in every release). ✅
- Caveat: subject to the same degraded-quorum evidence as §3.

**Journey D — `npx @hyperdag/trustshell check <run-url>` (README launch line):**
- **MUST-FIX: BLOCKED — `check` is not in published 1.3.0.** Either publish 1.4.0 (after §6) or stop
  advertising `check` at `@1.4.0` until it ships. This is the one journey that hard-fails for a stranger.

**Journey E — a live-vs-paused table that does not lie:**
- MUST-FIX: table must encode three states, not two — LIVE (verify/repid/services/proof), 
  LIVE-DEGRADED (HAL 2/6 providers), PAUSED/BLOCKED (on-chain writes since 2026-06-22, mint=key,
  x402=key+wallet, mesh=v2, comma=hypothesis, deception=shadow-only). A two-color table lies by omission.

---

## 6. HAL / CI gaps (noted only — not implemented)

- **`check.yml` is the only PR gate.** It runs `npm ci` → `tsc --noEmit` → jest minus `tests/e2e`.
  `npm run verify` reproduces exactly this locally — run it before any push (AGENTS.md).
- **`publish-sdk.yml` release gate is compromised:** `sdk:test` = `jest --testPathPattern=trustshell`
  matches the repository directory in every absolute path, so it selects all 6 suites including the
  live-backend `tests/e2e/wrapper-readiness.test.ts`. Result: **an `npm publish` depends on a
  third-party backend being up.** Documented, deliberately unfixed in `check.yml:25-32`. Must be an
  explicit decision before publishing 1.4.0 — this is on the MVP critical path (Journey D).
- **HAL quorum health is not gated anywhere.** No check fails when providers drop to 2/6. That is a
  backend-funding signal, not a trustshell CI concern, but any status surface reading "HAL LIVE" is
  unverified against provider health. (I am NOT implementing the gate.)

---

Waiting for XC PLAN.md / STATUS.md. I will not implement.
