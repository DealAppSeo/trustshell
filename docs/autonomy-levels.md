# Autonomy levels for Guard (SHADOW)

Status: **shadow by default, off until turned on.** On `main`, in no npm release. Source:
`src/lib/autonomy.ts`, wired into `guardDecide` (`src/lib/guardrails.ts`) and `trustshell guard level`
(`src/cli/guard.ts`). Tests: `tests/autonomy.test.ts`.

**What this is not.** Local guardrails for cooperative agents, not a security boundary. Anything running
as you can edit the policy or `autonomy.jsonl`, or hand `guard level record` a `record.json` it made up:
an Inspect record is unsigned, and its digest shows it was not edited after it was made, not who made it.
Who may change the policy (the protected-authority question) is an open owner decision, and this does not
settle it.

## Why

How much an agent may do without a person approving it should depend on measured reliability, and
no published study shows that autonomy earned from a track record makes LLM agents safer. Both points,
with sources, are in [hyperdag-protocol docs/WHY.md §2](https://github.com/DealAppSeo/hyperdag-protocol/blob/main/docs/WHY.md).
This builds the mechanism in shadow so that question can be measured, not assumed.

## Turning it on

```bash
trustshell guard level shadow           # writes an autonomy block into the policy: computed and recorded, Guard unchanged
trustshell guard level after L2 5       # Inspect records needed to reach L2 from L1 (defaults: L1 3, L2 5, L3 10)
trustshell guard level                  # the level, why, what the next one needs, what was measured
trustshell guard level enforce          # explicit opt-in: the level can also refuse
trustshell guard level off              # removes the block
```

The block sits inside `policy`, so `guard sign` covers it and every change to it is a new policy with a
higher nonce and a `policy-change` record, like any other guard verb. The kernel's `OwnerPolicy` has no
such field; it is local only.

## Levels

| Level | Allows, at most |
|---|---|
| L0 observe | nothing |
| L1 read-only | class `read`, and the CLI's read-only commands: ground, inspect, recall, report, traps |
| L2 workspace | L1, and class `other`: commands that change local files. The guard does not see where they write. |
| L3 broader | L2, and `post` and `spend`, under the policy's spend caps |

Every agent starts at L1. A level never allows what the policy does not list: under `enforce` the
request must pass the policy AND the level. `--class` is the caller's label, as everywhere in the guard.

## Up and down

**Promotion, one level:** `promote_after` Inspect records whose every claim is SUPPORTED on a complete
run (`trustshell check <runUrl> --claims-file <file>` exits 0), since the last level change. Record one
with `trustshell guard level record <record.json>`, the file `check ... --out <dir>` writes. One record
per run; one commit counts once, ever, so re-running a workflow does not count twice.

**NOT_CHECKED never promotes.** A record with any NOT_CHECKED claim counts for nothing, including one that
pads SUPPORTED citations with claims nobody checked.

**Demotion:** one level on a record with a CONTRADICTED claim, or on a Guard refusal of an out-of-lane
attempt: an action the policy does not list, a `run` whose executable is not the named tool, a command
always denied (`init --pai`, `learn check run`), and under `enforce` what the level does not allow. To L0
on `guard level revoke` or `guard kill`. At L0 a demotion keeps L0 and starts the count again.

Not incidents: an expired policy, an amount over a cap, a policy file that does not parse. Those are the
owner's state, not the agent's attempt. In shadow the level falls only on what actually happened; a
refusal the level would have made is measured, not counted.

Every change is its own record in `autonomy.jsonl` (`trustshell.autonomy-record/0.1-draft`), hash-chained
like `guard-receipts.jsonl`, with the reason.

## Shadow changes nothing

In shadow every Guard decision, reason and guard record is what the same policy without the block
produces, at any level, and with `autonomy.jsonl` broken or unreadable: a failure in the autonomy code is
swallowed and the decision stands. `enforce` fails closed instead. `tests/autonomy.test.ts` pins both.

## Measurement

Each Guard decision under an autonomy block writes a `would-be` record beside it: `fixed` (what the policy
alone decided), `earned` (what the policy and the level decide together), the level, the action and its
class, and a link to the guard record. With incidents and Inspect outcomes in the same chain, that is the
data to ask, later and against real use: did the actions the earned level would have refused include the
harmful ones, and at what cost in refused benign ones? Nothing has been measured yet.

The level is per host: bundles do not carry `autonomy.jsonl`.
