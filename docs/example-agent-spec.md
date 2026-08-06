# Example Agent — Specification

A minimal, end-to-end reference agent that uses TrustShell to gate its actions.

> ✅ **Working implementation shipped:** [github.com/DealAppSeo/example-agent](https://github.com/DealAppSeo/example-agent)
> — clone, `npm install && npm start`, runs **keyless** (public HAL fact-check) out of the box, with an
> optional SDK mode (full HAL + RepID loop) when you set an API key. This doc is the design spec it follows.

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
1. **Construct** `new TrustShell()` — keyless for the guard path.
2. **Propose → guard:** call `shell.verifyOutput(actionText)`.
   - `result.ok === true` → execute the action.
   - `false` → log `result.decisionReason`, skip (or route to a human).
3. **Detail:** use `shell.score(text)` when you want the signal breakdown and per-provider
   `evidence[]` behind the verdict.
4. **Status:** periodically `shell.getRepID(agentId)` to read the agent's current tier/score.
5. **(Optional) A2A:** `shell.executeA2A(params)` to run a service contract (requires an API key).

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
5. **Idempotent settlement** — the engine settles a given contract only once.

## Acceptance criteria (for the V1.5 implementation)
- Runs from a clean clone with only `REPID_API_KEY` + `AGENT_ID` set.
- All 5 scenarios above demonstrated in the README with real output.
- No secrets committed; `.env.example` only.

See [getting-started.md](./getting-started.md) and [api-reference.md](./api-reference.md).
