# Containment matrix

What bounds an agent that runs on this machine through TrustShell, and what does not. Written 2026-11-01
(overnight item 1), from `GUARD_DOES_NOT_COVER` in `src/lib/guardrails.ts` and the tests named below.
`tests/baseline-matrices.test.ts` checks every row, and fails if rows C2-C4 stop agreeing with
`GUARD_DOES_NOT_COVER`: when Guard starts covering the MCP server or SDK calls, this page must change with it.

**Guard is local guardrails for cooperative agents. It is not an OS sandbox and not a security boundary.**
It stops a mistaken command. It does not stop an agent that can run the CLI itself, edit the policy, or act
without TrustShell. Statuses use the vocabulary in [`SECURITY_GAP_MATRIX.md`](SECURITY_GAP_MATRIX.md).

## Matrix

| ID | Control | Status | Evidence | Gap |
|---|---|---|---|---|
| C1 | `trustshell run` starts only an executable the policy lists, by its own name, before it starts | ENFORCED | `src/cli/guard.ts`, `tests/guardrails.test.ts`, `tests/guard-carry-redteam.test.ts` | Bounds WHICH executable starts, not what it does (C2, C5). |
| C2 | What a started command does (files, network, child processes) | NOT_ENFORCED | `src/lib/guardrails.ts` | Not observed. Guard decides before an action starts and sees nothing after. |
| C3 | MCP server (`trustshell-mcp`) tool calls read the Guard policy | NOT_ENFORCED | `src/lib/guardrails.ts`, `tests/guard-carry-redteam.test.ts` | The MCP server does not read the policy yet. |
| C4 | SDK callers (code importing `@hyperdag/trustshell`) are bounded by Guard | NOT_ENFORCED | `src/lib/guardrails.ts` | Such code must call `guardDecide` itself; nothing makes it. |
| C5 | Allowing an interpreter (node, python, sh, powershell) limits which scripts it runs | NOT_ENFORCED | `src/lib/guardrails.ts` | Allowing an interpreter allows any script it is given. |
| C6 | Commands that would run something Guard cannot see (`init --pai`, stored shell commands, `learn check run`) are denied while a policy is in force | ENFORCED | `src/cli/guard.ts`, `tests/guardrails.test.ts` | Only the commands the CLI knows spawn; an unknown spawner is C2. |
| C7 | `guard kill` allows nothing afterwards, and a later `init --force` cannot replay an older looser signed policy | ENFORCED | `tests/guardrails.test.ts`, `tests/guard-carry-redteam.test.ts` | The owner (or anything running as them) can re-init. Kill stops cooperative agents, not a hostile one. |
| C8 | Spend limits (per-tx, rolling daily, total) hold under concurrent runs | ENFORCED | `tests/guard-carry-redteam.test.ts`, `tests/guardrails.test.ts` | Counts only spends that asked the guard; a spend made without asking is not counted. |
| C9 | A `TRUSTSHELL_HOME` with no policy turns the gate off for that command | PARTIAL | `tests/guard-carry-redteam.test.ts` | It warns loudly; it does not stop the command. |
| C10 | Policy changes are never silent (init, allow, sign, kill each leave a record with hash before and after) | ENFORCED | `tests/guard-carry-redteam.test.ts` | The record chain is unkeyed (gap matrix S11). |
| C11 | Carried memories arrive as untrusted text: quarantined on import, trust labels refused, injected instructions held | ENFORCED | `src/lib/bundle.ts`, `tests/bundle.test.ts`, `tests/guard-carry-redteam.test.ts` | Quarantine is pattern-based for injection-looking text. |
| C12 | Autonomy level can only narrow the policy, never widen it | PARTIAL | `src/lib/autonomy.ts`, `tests/autonomy.test.ts` | SHADOW by default (records, refuses nothing). Records are unsigned (gap matrix S13). |
| C13 | Free-token loops halt instead of falling back to a paid model | NOT_CHECKED | `repid-engine:src/providers` (repid-engine #1472, open, no callers yet, checked 2026-11-01) | Overnight item 0. A stub with no callers bounds nothing until a loop calls it. |

## What would close the biggest gaps

C2-C5 together are the reason Guard is not a boundary. Closing them needs OS-level isolation (a container,
a separate user, a MicroVM) or Guard wired into every path an agent can act through. Both are deferred in
`docs/living/OVERNIGHT_2026-11-01.md` §2; neither is claimed here.
