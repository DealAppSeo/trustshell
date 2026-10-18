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
 * Construct the TrustShell MCP server and register its tools. The client is injected so this is
 * unit-testable without a live network. Exported (not just booted) so tests can drive it directly.
 */
export declare function createServer(client?: TrustShell): McpServer;
/** Boot the server over stdio. */
export declare function main(): Promise<void>;
