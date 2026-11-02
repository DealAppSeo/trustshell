# Containment matrix

What bounds an agent that runs on this machine through TrustShell, and what does not. Written 2026-11-01
(overnight item 1), from `GUARD_DOES_NOT_COVER` in `src/lib/guardrails.ts` and the tests named below.
`tests/baseline-matrices.test.ts` checks every row, and fails if rows C2-C4 stop agreeing with
`GUARD_DOES_NOT_COVER`: Guard covers the MCP server since IS-P0-5 (C3); when it starts covering SDK calls, this
page must change with it.

**Guard is local guardrails for cooperative agents. It is not an OS sandbox and not a security boundary.**
It stops a mistaken command. It does not stop an agent that can run the CLI itself, edit the policy, or act
without TrustShell. Statuses use the vocabulary in [`SECURITY_GAP_MATRIX.md`](SECURITY_GAP_MATRIX.md).

## Matrix

| ID | Control | Status | Evidence | Gap |
|---|---|---|---|---|
| C1 | `trustshell run` starts only an executable the policy lists, by its own name, before it starts | ENFORCED | `src/cli/guard.ts`, `tests/guardrails.test.ts`, `tests/guard-carry-redteam.test.ts` | Bounds WHICH executable starts, not what it does (C2, C5). |
| C2 | What a started command does (files, network, child processes) | NOT_ENFORCED | `src/lib/guardrails.ts` | Not observed. Guard decides before an action starts and sees nothing after. |
| C3 | MCP server (`trustshell-mcp`) tool calls read the Guard policy | ENFORCED | `src/mcp/index.ts`, `tests/mcp-guard.test.ts`, `tests/guard-carry-demo.test.ts` | Every tool call is decided by the CLI's own decision and ledger, from the policy in the server's `TRUSTSHELL_HOME`, re-read per call, before the tool runs; unparseable, killed, expired or unreadable denies. A client that starts the server with a `TRUSTSHELL_HOME` holding no policy turns the gate off for it (C9). Cooperative guardrails, not a sandbox: anything running as the owner can edit the policy. |
| C4 | SDK callers (code importing `@hyperdag/trustshell`) are bounded by Guard | NOT_ENFORCED | `src/lib/guardrails.ts` | Such code must call `guardDecide` itself; nothing makes it. |
| C5 | Allowing an interpreter (node, python, sh, powershell) limits which scripts it runs | NOT_ENFORCED | `src/lib/guardrails.ts` | Allowing an interpreter allows any script it is given. |
| C6 | Commands that would run something Guard cannot see (`init --pai`, stored shell commands, `learn check run`) are denied while a policy is in force | ENFORCED | `src/cli/guard.ts`, `tests/guardrails.test.ts` | Only the commands the CLI knows spawn; an unknown spawner is C2. |
| C7 | `guard kill` allows nothing afterwards, and a later `init --force` cannot replay an older looser signed policy | ENFORCED | `tests/guardrails.test.ts`, `tests/guard-carry-redteam.test.ts` | The owner (or anything running as them) can re-init. Kill stops cooperative agents, not a hostile one. |
| C8 | Spend limits (per-tx, rolling daily, total) hold under concurrent runs | ENFORCED | `tests/guard-carry-redteam.test.ts`, `tests/guardrails.test.ts` | Counts only spends that asked the guard; a spend made without asking is not counted. |
| C9 | A `TRUSTSHELL_HOME` with no policy turns the gate off for that command (or MCP server) | PARTIAL | `tests/guard-carry-redteam.test.ts`, `tests/mcp-guard.test.ts` | It warns loudly (the MCP server on stderr); it does not stop the command. |
| C10 | Policy changes are never silent (init, allow, sign, kill each leave a record with hash before and after) | ENFORCED | `tests/guard-carry-redteam.test.ts` | The record chain is unkeyed (gap matrix S11). |
| C11 | Carried memories arrive as untrusted text: quarantined on import, trust labels refused, injected instructions held | ENFORCED | `src/lib/bundle.ts`, `tests/bundle.test.ts`, `tests/guard-carry-redteam.test.ts` | Quarantine is pattern-based for injection-looking text. |
| C12 | Autonomy level can only narrow the policy, never widen it | PARTIAL | `src/lib/autonomy.ts`, `tests/autonomy.test.ts` | SHADOW by default (records, refuses nothing). Records are unsigned (gap matrix S13). |
| C13 | Free-token loops halt instead of falling back to a paid model | NOT_CHECKED | `repid-engine:src/providers` (repid-engine #1472, open, no callers yet, checked 2026-11-01) | Overnight item 0. A stub with no callers bounds nothing until a loop calls it. |
| C14 | Sandbox mission profile (`src/sandbox/mission.ts`): no network, read-only root, all capabilities dropped, no new privileges, user 65534, pids/memory/cpu limits, wall-clock timeout, only the image's own environment, image pinned by digest; read back from `docker inspect` before the worker starts, and not started if any field differs | ENFORCED | `tests/sandbox-mission.test.ts`, `.github/workflows/sandbox-mission.yml` | Applied and verified, not attacked (C15). No container runtime means no mission: it refuses, it does not run uncontained. |
| C15 | A sandbox mission holds against an active hostile worker (escape, egress, exhaustion, privilege escalation) | NOT_CHECKED | `src/sandbox/receipt.ts` | Not tested: adversarial in-container tests await Sean's scope decision. Kernel or hypervisor escapes and side channels are not measured either. |
| C16 | Nothing a sandbox worker writes is trusted until the promotion gate signs it (its own Ed25519 key, not mounted into the container): canary-carrying files, self-approvals, approvals from the outbox and revoked mission tokens are refused; tool configs and proposed memory are held, never auto-promoted | ENFORCED | `src/sandbox/promote.ts`, `tests/sandbox-airlock.test.ts`, `tests/sandbox-promote-receipt.test.ts` | The canary match is literal, so an encoded or transformed canary is not caught. Approval, config and memory files are recognised by name and JSON keys. |

## What would close the biggest gaps

C2, C4 and C5 together are the reason Guard is not a boundary (C3, the MCP server, is wired since IS-P0-5).
Closing them needs OS-level isolation (a container, a separate user, a MicroVM) or Guard wired into every path an
agent can act through. Both are deferred in
`docs/living/OVERNIGHT_2026-11-01.md` §2; neither is claimed here.

Sandbox missions (C14-C16) do not change C2-C5 for plain `trustshell run`: they are a separate path for
work handed to a disposable container.
