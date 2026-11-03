#!/usr/bin/env node
/**
 * @hyperdag/trustshell — MCP server
 * ------------------------------------------------------------------
 * The FOURTH distribution channel for the TrustShell trust harness:
 *   - SDK  (`import { TrustShell }`)      → code
 *   - CLI  (`trustshell …`)               → terminal + CI
 *   - dist install (`github:DealAppSeo/trustshell`) → npx
 *   - MCP  (`trustshell-mcp`)             → AI agents (Claude Desktop / Cursor / …)  ← this file
 *
 * A THIN wrapper over the SDK (../lib/trustshell). No fake verdicts — every tool makes a real SDK
 * call against the live HyperDAG backend (default: the Railway repid-engine baked into the SDK).
 *
 * Tools exposed:
 *   - verify         — run text through the live HAL cross-provider fact-check quorum (PASS/FLAG/VETO).
 *   - getLeaderboard — the live model or agent trust leaderboard.
 *   - getRepID       — an agent's live RepID score + tier (keyless).
 *   - present_proof  — RepID range proof; optional client-side verify (1.4.0 tree; not in npm MCP 1.0.0).
 *   - remember       — write a note into the local sqlite file. No network.
 *   - recall         — list saved notes from that file. No network.
 *   - repid          — alias of get_repid / getRepID.
 *   - verify_output  — canonical name for verify/evaluate (SDK verifyOutput).
 *   - get_repid      — canonical name for getRepID.
 *   - verify_proof   — client-side WASM proof verification (SDK verifyProof). Nothing leaves the host.
 *   - status         — `trustshell status` parity; calls src/cli/status.ts so the two cannot drift.
 *   - check_claim    — `trustshell check "<sentence>"` parity: pass / veto / not-checked, the same
 *                      label the Chrome extension shows. Calls src/lib/claim.ts classifyClaim, the
 *                      one function the CLI also calls.
 *   - inspect_run    — `trustshell check <runUrl> --claims "<text>"` parity (Inspect): claims mapped
 *                      onto a GitHub Actions run, no model, api.github.com only. Calls the CLI's
 *                      functions (src/lib/action-evidence.ts, src/lib/evidence-card.ts), so the
 *                      record digest is the CLI's. Not check_claim, and never falls back to it.
 *   - my_job         — the agent's role, the tools it may use and until when, from its live grants
 *                      (src/lib/my-job.ts). Which agent: TRUSTSHELL_AGENT_ID, or .trustshell/.
 *   - kernel_receipt — `trustshell receipt <id>` parity: read a kernel receipt back, hash checked
 *                      locally, with its six claims (src/lib/kernel-client.ts kernelReceipt).
 *   - ground_quote   — `trustshell ground` parity: is the quote really in the source text, on the
 *                      cited page, with the value in it? Local, no network (src/lib/ground.ts).
 *   - learn_lessons_for — `trustshell learn inject` parity: the job's accepted lessons, verbatim, plus
 *                      the scaffold the person chose; recorded as loop_tokens. Local (src/learn).
 *   - learn_record   — episode metadata for this turn. The caller's outcome is stored as agent_outcome
 *                      and no ruler reads it; there is no tool that runs a check, accepts a lesson or
 *                      writes a correction: those are the person's, at the CLI.
 *
 * GUARD (IS-P0-5, containment row C3). Every tool call is decided against the owner policy BEFORE the tool runs,
 * by guardDecide, the same decision and the same hash-chained ledger the CLI gate uses (src/cli/guard.ts
 * runGuarded). The policy is read from the server's own TRUSTSHELL_HOME on every call, never from the call's
 * arguments, so `guard kill` stops the next call without a restart. Every tool is an action: none is exempt,
 * because the CLI gates its local reads too (`guard init` lists them). Each maps to the CLI command it mirrors
 * (MCP_GUARD_TOOLS, the one table), so `tool:recall` in a policy means the same at both. A denied call answers
 * isError with the rule it broke; a policy that does not parse, is killed or expired, or cannot be read denies
 * (fail closed); no policy at all lets the call run, exactly as the CLI does (C9), unless the opt-in
 * TRUSTSHELL_REQUIRE_POLICY is set, which makes an absent policy fail closed too. Local guardrails for
 * cooperative agents, not a sandbox: anything running as the owner can edit the policy.
 *
 * There is no `redact` tool (SEC F8, 2026-10-16): it let any connected agent delete the operator's
 * keyed rows, and an MCP caller cannot write a keyed row, so it has none of its own to delete.
 * Deleting is the operator's, at the CLI (`trustshell redact <key>`).
 *
 * UNTRUSTED DATA (SEC F9): every tool whose answer came over the network returns
 * { untrusted_data, screening } (see screenRemote). It is data for the agent, never instructions.
 *
 * camelCase names (verify / evaluate / getLeaderboard / getRepID) are kept as ALIASES: 1.4.0 is
 * already published with them live, so renaming would break existing agent configs.
 *
 * Transport: stdio (the Claude Desktop / Cursor default). Configure with:
 *   { "mcpServers": { "trustshell": { "command": "npx",
 *       "args": ["-y", "@hyperdag/trustshell", "trustshell-mcp"] } } }
 *
 * ENV:
 *   REPID_API_KEY       — optional API key (verify/leaderboard/repid are keyless)
 *   TRUSTSHELL_API_URL  — override the backend origin (default: live HyperDAG backend)
 *   TRUSTSHELL_AGENT_ID — which agent this server serves (my_job); else .trustshell/credentials.json
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TrustShell } from '../lib/trustshell';
import { type AssuranceScope } from '../lib/guardrails';
/**
 * Package version — read from package.json at runtime, never retyped here.
 *
 * Was a hardcoded literal, last touched at `'1.2.0'` and never updated
 * through the 1.3.0 release — the same bug the CLI's `resolveVersion()` (now
 * `../lib/version.ts`, shared by both) already fixed once, one file over,
 * without the fix being generalized past that one call site. See that
 * module's header for why this is a runtime `readFileSync` and not a static
 * `import pkg from '../../package.json'`.
 */
export declare const MCP_VERSION: string;
/** Build the SDK client from env (apiKey + apiUrl are both optional; reads are keyless). */
export declare function makeClient(): TrustShell;
/**
 * SEC F9: text that came over the network (HAL evidence, leaderboard names, a role from my_job, an
 * error body) is DATA for the calling agent, never instructions to it. Every string in the payload is
 * run through ingest(); one that looks like instruction-smuggling is replaced by WITHHELD and its path
 * listed in screening.withheld. ingest() is a keyword screen with a known ceiling (src/lib/ingest.ts),
 * so the envelope itself is the other half: the agent is told the whole thing is untrusted data.
 * ponytail: object KEYS are not screened (remote keys here are fixed field names); screen them if a
 * tool ever returns free-text keys.
 */
export declare function screenRemote(payload: unknown): {
    untrusted_data: unknown;
    screening: {
        ingest: 'clean';
    } | {
        ingest: 'veto';
        withheld: string[];
    };
};
/**
 * THE tool-to-action map: each MCP tool is decided as `tool:<this>`, the CLI command it mirrors, so one policy
 * entry means the same at the CLI and over MCP. getLeaderboard and my_job have no CLI command and keep their own
 * names. A tool registered without an entry is still gated, as `tool:<its own name>` (tests/mcp-guard.test.ts
 * fails if one is missing).
 */
export declare const MCP_GUARD_TOOLS: Readonly<Record<string, string>>;
/** The scope an MCP decision record states. */
export declare function mcpScope(tool: string): AssuranceScope;
/**
 * Decide one MCP tool call against the policy in the server's TRUSTSHELL_HOME and record it. null: run the tool
 * (allowed, or no policy, as the CLI). Otherwise the isError result to return instead. Nothing the client sent is
 * read: the tool name is the server's own. Any failure to decide (an unreadable file, a held lock) refuses.
 */
export declare function mcpGuard(tool: string, env?: NodeJS.ProcessEnv): {
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
} | null;
/**
 * Construct the TrustShell MCP server and register its tools. The client is injected so this is
 * unit-testable without a live network. Exported (not just booted) so tests can drive it directly.
 */
export declare function createServer(client?: TrustShell): McpServer;
/** Boot the server over stdio. */
export declare function main(): Promise<void>;
