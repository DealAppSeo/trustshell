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
 *
 * Transport: stdio (the Claude Desktop / Cursor default). Configure with:
 *   { "mcpServers": { "trustshell": { "command": "npx",
 *       "args": ["-y", "@hyperdag/trustshell", "trustshell-mcp"] } } }
 *
 * ENV:
 *   REPID_API_KEY       — optional API key (verify/leaderboard/repid are keyless)
 *   TRUSTSHELL_API_URL  — override the backend origin (default: live HyperDAG backend)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TrustShell } from '../lib/trustshell';
import { resolvePackageVersion } from '../lib/version';

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
export const MCP_VERSION = resolvePackageVersion(__dirname);

/** Build the SDK client from env (apiKey + apiUrl are both optional; reads are keyless). */
export function makeClient(): TrustShell {
  return new TrustShell({
    apiKey: process.env.REPID_API_KEY?.trim() || undefined,
    apiUrl: process.env.TRUSTSHELL_API_URL?.trim() || undefined,
  });
}

/** MCP text-content helper — returns a tool result carrying a single JSON text block. */
function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

/** MCP error result — surfaces the failure to the agent WITHOUT throwing (isError set). */
function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/**
 * Construct the TrustShell MCP server and register its tools. The client is injected so this is
 * unit-testable without a live network. Exported (not just booted) so tests can drive it directly.
 */
export function createServer(client: TrustShell = makeClient()): McpServer {
  const server = new McpServer({
    name: 'trustshell',
    version: MCP_VERSION,
  });

  // The MCP SDK's registerTool is generic over the Zod input shape; inferring the callback against
  // it under `strict` trips TS2589 ("excessively deep"). Bind to a loose signature — our handlers
  // are still explicitly typed below, so we keep type-safety where it matters (the tool payloads).
  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: { title?: string; description: string; inputSchema: Record<string, unknown> },
    cb: (args: any) => unknown,
  ) => void;

  // --- verify: HAL cross-provider fact-check quorum -----------------------------------------
  registerTool(
    'verify',
    {
      title: 'HAL verify',
      description:
        'Run text through the live HAL cross-provider fact-check quorum (strictness 2). Returns ' +
        'PASS / FLAG / VETO, a 0–100 trust score, the decision reason, and per-provider evidence. ' +
        'Use it to check a claim before acting on it.',
      inputSchema: {
        text: z.string().min(1).describe('The claim or output text to fact-check.'),
      },
    },
    async ({ text }: { text: string }) => {
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
      } catch (e: any) {
        return errorResult(`verify failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  // --- getLeaderboard: live model / agent trust leaderboard ---------------------------------
  registerTool(
    'getLeaderboard',
    {
      title: 'Trust leaderboard',
      description:
        "Fetch the live trust leaderboard from the public repid-engine. board='models' returns the " +
        "two-lens model board (performance + value, code-review discrimination — a narrow proxy, " +
        "not general trustworthiness); board='agents' returns agents ranked by real 0–10,000 RepID.",
      inputSchema: {
        board: z.enum(['models', 'agents']).describe("Which board: 'models' or 'agents'."),
      },
    },
    async ({ board }: { board: 'models' | 'agents' }) => {
      try {
        const data = board === 'agents'
          ? await client.getLeaderboard('agents')
          : await client.getLeaderboard('models');
        return jsonResult(data);
      } catch (e: any) {
        return errorResult(`getLeaderboard failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  // --- getRepID: an agent's live RepID score + tier -----------------------------------------
  registerTool(
    'getRepID',
    {
      title: 'Get RepID',
      description:
        "Fetch an agent's live RepID reputation score and tier from the public repid-engine " +
        '(keyless). Returns repid, tier, and the latest on-chain anchor / proof hash if present.',
      inputSchema: {
        agentId: z.string().min(1).describe('The agent id (UUID) or slug to look up.'),
      },
    },
    async ({ agentId }: { agentId: string }) => {
      try {
        const r = await client.getRepID(agentId);
        return jsonResult(r);
      } catch (e: any) {
        return errorResult(`getRepID failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  return server;
}

/** Boot the server over stdio. */
export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe (stdout is the JSON-RPC channel).
  process.stderr.write('trustshell-mcp: ready (stdio)\n');
}

// Boot ONLY when run as the entry point (not when imported by a test), so createServer/makeClient
// stay unit-testable without spawning a stdio transport.
const isEntry = (() => {
  try {
    const argvPath = process.argv[1];
    if (!argvPath) return false;
    return /[\\/]mcp[\\/]index\.js$/.test(argvPath) || /trustshell-mcp$/.test(argvPath);
  } catch {
    return false;
  }
})();

if (isEntry) {
  main().catch((e) => {
    process.stderr.write(`trustshell-mcp: fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
