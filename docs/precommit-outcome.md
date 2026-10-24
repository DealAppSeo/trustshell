# Pre-action forecast and graded outcome (SHADOW)

Status: **shadow only.** Code and tests on `main`, in no release. Nothing calls it: there is no
`trustshell` command, no MCP tool, no ruler in `learn report`, no database table, and no path to
RepID, reputation or stake. RepID's P0 containment (prediction-derived deltas held at 0) is untouched,
because nothing here reaches repid-engine.

Source: `src/learn/precommit.ts` (records, rules, ledger, Brier) and `src/learn/precommit-backfill.ts`
(the dry run). Tests: `tests/precommit.test.ts`.

## Why

`learn record --confidence` and repid-engine's `Commitment.selfConfidence` each hold one number. One
number cannot say whether it forecasts that a **claim is true** or that an **action succeeds**, and the
two come apart: a claim can be true while the action fails. So the pre-action record has `p_truth`
and `p_success` as separate fields, each graded by its own field on the outcome (`result` and
`execution`). Nothing averages them, picks one, or falls back from one to the other.

## The two records

**Pre-action** (`dev.trustshell.pre-action/0.1-draft`), sealed before the action:
`task_id`, `proposition` (`text`, one atomic claim, and `direction` TRUE or FALSE), `success_criterion`,
`p_truth`, `p_success`, `expected_cost`, `confidence_method`, `agent` (`provider`, `model`, `version`),
`sealed_at`, `nonce`, and `sealed_hash`: the SHA-256 of the record's RFC 8785 form (`src/lib/jcs.ts`).

**Outcome** (`dev.trustshell.outcome/0.1-draft`), made by a grader that is not the agent:
`pre_action_hash`, `task_id`, `grader` (`kind`, `id`, `method`), `result`
(SUPPORTED / CONTRADICTED / UNKNOWN, grades `p_truth`), `execution` (SUCCEEDED / FAILED / UNKNOWN,
grades `p_success`), `evidence` (`schema`, `digest`, `ref`; for example an action-evidence record and
its digest), `action_started_at`, `graded_at`, `outcome_hash`.

## The rules, and the refusal each one raises

| Rule | Refusal |
|---|---|
| Sealed strictly before the action started (an equal instant is refused) | `NOT_SEALED_BEFORE_ACTION` |
| Graded no earlier than the action started | `GRADED_BEFORE_ACTION` |
| The record still hashes to its `sealed_hash` | `HASH_MISMATCH` |
| The outcome names this exact record | `PRE_ACTION_MISMATCH` |
| The outcome still hashes to its `outcome_hash` | `OUTCOME_HASH_MISMATCH` |
| A nonce is used once | `NONCE_REUSED` |
| No amendment once an outcome exists; one outcome per record | `EDIT_AFTER_OUTCOME`, `ALREADY_GRADED` |
| One claim per record: no "and", "or", "but", second sentence, semicolon or question | `NOT_ATOMIC` |
| `p_truth` needs a proposition; `p_success` needs a success criterion sealed with it | `NO_PROPOSITION`, `NO_SUCCESS_CRITERION` |
| The asserted side gets at least even odds (TRUE at `p_truth` 0.1 is incoherent) | `INCOHERENT_DIRECTION` |
| No extra field (a merged `confidence` cannot ride along) | `UNKNOWN_FIELD` |
| A model is not a grader; the agent does not grade itself | `MODEL_GRADER`, `SELF_GRADED` |
| A resolved grade names its evidence | `NO_EVIDENCE` |

## The score

`brierScore(entries, axis)` scores ONE axis over resolved outcomes only. Beside the number it always
reports: how many forecasts were stated, resolved, UNKNOWN, ungraded and not stated on that axis; the
selection rate (resolved / stated); the mean forecast of the resolved and of the unresolved ones; the
confidence method; and a SHA-256 of exactly which records were scored. UNKNOWN is never scored as 0 or
1. Two confidence methods are never pooled. Below 20 resolved outcomes it says "not measured", the bar
`learn report` uses.

**Confidence laundering** (grading only the easy forecasts) shows up as a low selection rate with a
high mean forecast among the resolved ones. Sealing forecasts only for easy tasks shows up only against
an independent list of the tasks that ran: pass it as `tasks` and the report adds `task_coverage`.

## The dry-run backfill

Reads learn episodes from a memory file **read-only** and prints one JSON line per eligible episode.
It writes no database: SQLite opens the file read-only, and `--out` must be a new file that is not a
database.

```powershell
npm ci
node scripts/precommit-backfill.cjs --memory "$env:USERPROFILE\.trustshell\memory.sqlite"
```

A correct run exits 0 and prints, on stderr, how many episodes were read, how many were eligible, and
why the rest were skipped. Add `--out precommit-backfill.jsonl` to write the lines to a new file.

How it maps an episode: learn describes its confidence to agents as "your probability that the check
will pass", so it becomes `p_success`, with the registered check as the success criterion. `p_truth`
stays null, and so does the proposition: learn records none. An episode is eligible only when its job
was created by the person, it froze a check, and its confidence was recorded **strictly** before the
check ran. An outcome exists only when the check wrote one; its `execution` is the check's pass or fail
and its `result` is UNKNOWN. Nothing else is filled in.

## What this does not prove

- Nothing is signed. A hash shows a record changed after it was sealed, not who sealed it, and the
  grader's independence is declared, not verified.
- `sealed_at` is the sealer's clock. Ordering is only as good as the clocks that stamped it.
- The backfill seals what the memory file holds now. learn keeps only the last confidence stated
  before the check, and seals nothing, so earlier edits are invisible to it.
- A selection rate counts forecasts that were sealed. Forecasts never made are visible only against an
  independent task list.
