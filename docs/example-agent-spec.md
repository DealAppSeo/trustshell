# Example Agent — Specification

A minimal, end-to-end reference agent that uses TrustShell to gate its actions. **This is a spec; the
runnable implementation lands in V1.5** (`examples/minimal-agent/`).

## Description
A tiny "guarded executor": it takes a proposed action + the agent's certainty, runs it through HAL via
TrustShell, and only proceeds when APPROVED. On a caught hallucination it reports the catch (earning
RepID + docking the LLM's trust). It demonstrates the full happy path without any domain complexity.

## File structure (planned)
```
examples/minimal-agent/
  package.json          # depends on @hyperdag/trustshell
  .env.example          # REPID_API_KEY, AGENT_ID, LLM_PROVIDER
  index.ts              # the agent loop
  README.md             # run instructions
```

## Key code paths
1. **Construct** `new TrustShell({ agentId, apiKey, llmProvider, profile: 'balanced' })`.
2. **Propose → guard:** call `shell.evaluate(actionText, certainty)`.
   - `result.approved === true` → execute the action.
   - `false` → log `result.veto_reason`, skip (or route to a human).
3. **Catch reporting:** if the agent detects its own LLM was wrong, call
   `shell.report({ text, certainty, hallucinationCaught: true })`.
4. **Status:** periodically `shell.getRepID()` to read the agent's current tier/score.
5. **(Optional) pay:** `shell.payAndEscrow(contractId, privateKey)` to settle a service contract via x402.

## Expected behavior
| Input | HAL decision | Agent behavior |
|---|---|---|
| Well-grounded, low-risk action (high evidence, scoped) | `clean` / APPROVE | executes; `+RepID` |
| Borderline (mid dissonance) | HITL | pauses for human review |
| Confident-but-false / harmful | `vetoed` / BLOCK | does **not** execute; logs `veto_reason`; `−RepID` |
| Degraded HAL (≤1 provider responded) | clean (degraded) | executes, but the response is flagged `degraded` for review |

## Test scenarios
1. **Approve path** — a true, low-risk statement → `approved: true`, positive `repid_delta`.
2. **Veto path** — a confident falsehood (e.g. "The capital of Australia is Sydney") → `approved: false`, `veto_reason` set.
3. **Catch path** — `report({ hallucinationCaught: true })` → agent `+RepID`, `vdr_count` increments.
4. **Auth failure** — missing/invalid key → 401/403 surfaced as a thrown error.
5. **Idempotent pay** — calling `payAndEscrow` twice for one contract settles only once.

## Acceptance criteria (for the V1.5 implementation)
- Runs from a clean clone with only `REPID_API_KEY` + `AGENT_ID` set.
- All 5 scenarios above demonstrated in the README with real output.
- No secrets committed; `.env.example` only.

See [getting-started.md](./getting-started.md) and [api-reference.md](./api-reference.md).
