#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_VERSION = void 0;
exports.makeClient = makeClient;
exports.createServer = createServer;
exports.main = main;
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
 *
 * Transport: stdio (the Claude Desktop / Cursor default). Configure with:
 *   { "mcpServers": { "trustshell": { "command": "npx",
 *       "args": ["-y", "@hyperdag/trustshell", "trustshell-mcp"] } } }
 *
 * ENV:
 *   REPID_API_KEY       — optional API key (verify/leaderboard/repid are keyless)
 *   TRUSTSHELL_API_URL  — override the backend origin (default: live HyperDAG backend)
 */
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const trustshell_1 = require("../lib/trustshell");
/** Package version — kept in sync with package.json at release time. */
exports.MCP_VERSION = '1.2.0';
/** Build the SDK client from env (apiKey + apiUrl are both optional; reads are keyless). */
function makeClient() {
    return new trustshell_1.TrustShell({
        apiKey: process.env.REPID_API_KEY?.trim() || undefined,
        apiUrl: process.env.TRUSTSHELL_API_URL?.trim() || undefined,
    });
}
/** MCP text-content helper — returns a tool result carrying a single JSON text block. */
function jsonResult(payload) {
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
/** MCP error result — surfaces the failure to the agent WITHOUT throwing (isError set). */
function errorResult(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}
/**
 * Construct the TrustShell MCP server and register its tools. The client is injected so this is
 * unit-testable without a live network. Exported (not just booted) so tests can drive it directly.
 */
function createServer(client = makeClient()) {
    const server = new mcp_js_1.McpServer({
        name: 'trustshell',
        version: exports.MCP_VERSION,
    });
    // The MCP SDK's registerTool is generic over the Zod input shape; inferring the callback against
    // it under `strict` trips TS2589 ("excessively deep"). Bind to a loose signature — our handlers
    // are still explicitly typed below, so we keep type-safety where it matters (the tool payloads).
    const registerTool = server.registerTool.bind(server);
    // --- verify: HAL cross-provider fact-check quorum -----------------------------------------
    registerTool('verify', {
        title: 'HAL verify',
        description: 'Run text through the live HAL cross-provider fact-check quorum (strictness 2). Returns ' +
            'PASS / FLAG / VETO, a 0–100 trust score, the decision reason, and per-provider evidence. ' +
            'Use it to check a claim before acting on it.',
        inputSchema: {
            text: zod_1.z.string().min(1).describe('The claim or output text to fact-check.'),
        },
    }, async ({ text }) => {
        try {
            const r = await client.verifyOutput(text);
            return jsonResult({
                verdict: r.verdict,
                ok: r.ok,
                trustScore: r.trustScore,
                halScore: r.halScore,
                decisionReason: r.decisionReason,
                evidence: r.evidence,
            });
        }
        catch (e) {
            return errorResult(`verify failed: ${e?.message ?? String(e)}`);
        }
    });
    // --- getLeaderboard: live model / agent trust leaderboard ---------------------------------
    registerTool('getLeaderboard', {
        title: 'Trust leaderboard',
        description: "Fetch the live trust leaderboard from the public repid-engine. board='models' returns the " +
            "two-lens model board (performance + value, code-review discrimination — a narrow proxy, " +
            "not general trustworthiness); board='agents' returns agents ranked by real 0–10,000 RepID.",
        inputSchema: {
            board: zod_1.z.enum(['models', 'agents']).describe("Which board: 'models' or 'agents'."),
        },
    }, async ({ board }) => {
        try {
            const data = board === 'agents'
                ? await client.getLeaderboard('agents')
                : await client.getLeaderboard('models');
            return jsonResult(data);
        }
        catch (e) {
            return errorResult(`getLeaderboard failed: ${e?.message ?? String(e)}`);
        }
    });
    // --- getRepID: an agent's live RepID score + tier -----------------------------------------
    registerTool('getRepID', {
        title: 'Get RepID',
        description: "Fetch an agent's live RepID reputation score and tier from the public repid-engine " +
            '(keyless). Returns repid, tier, and the latest on-chain anchor / proof hash if present.',
        inputSchema: {
            agentId: zod_1.z.string().min(1).describe('The agent id (UUID) or slug to look up.'),
        },
    }, async ({ agentId }) => {
        try {
            const r = await client.getRepID(agentId);
            return jsonResult(r);
        }
        catch (e) {
            return errorResult(`getRepID failed: ${e?.message ?? String(e)}`);
        }
    });
    return server;
}
/** Boot the server over stdio. */
async function main() {
    const server = createServer();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // stderr is safe (stdout is the JSON-RPC channel).
    process.stderr.write('trustshell-mcp: ready (stdio)\n');
}
// Boot ONLY when run as the entry point (not when imported by a test), so createServer/makeClient
// stay unit-testable without spawning a stdio transport.
const isEntry = (() => {
    try {
        const argvPath = process.argv[1];
        if (!argvPath)
            return false;
        return /[\\/]mcp[\\/]index\.js$/.test(argvPath) || /trustshell-mcp$/.test(argvPath);
    }
    catch {
        return false;
    }
})();
if (isEntry) {
    main().catch((e) => {
        process.stderr.write(`trustshell-mcp: fatal: ${e?.stack ?? e}\n`);
        process.exit(1);
    });
}
