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
 *   - redact         — delete one keyed row. Missing is NOT_CHECKED. No network.
 *   - repid          — alias of get_repid / getRepID.
 *   - verify_output  — canonical name for verify/evaluate (SDK verifyOutput).
 *   - get_repid      — canonical name for getRepID.
 *   - verify_proof   — client-side WASM proof verification (SDK verifyProof). Nothing leaves the host.
 *   - status         — `trustshell status` parity; calls src/cli/status.ts so the two cannot drift.
 *   - check_claim    — `trustshell check "<sentence>"` parity: pass / veto / not-checked, the same
 *                      label the Chrome extension shows. Calls src/lib/claim.ts classifyClaim, the
 *                      one function the CLI also calls.
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
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TrustShell } from '../lib/trustshell';
import { redact } from '../memory/redact';
import { resolvePackageVersion } from '../lib/version';
import { buildStatusReport, statusJsonFromText } from '../cli/status';
import { redactKey } from '../cli/redact-key';
import { refusedValue } from '../cli/remember';
import { recallLocal, rememberLocal } from './memory';
import { classifyClaim } from '../lib/claim';

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

  const verifyHandler = async ({ text }: { text: string }) => {
    try {
      const r = await client.verifyOutput(redact(text));
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
  };

  // --- verify / evaluate: HAL cross-provider fact-check quorum ------------------------------
  const verifySchema = {
    text: z.string().min(1).describe('The claim or output text to fact-check.'),
  };
  registerTool(
    'verify',
    {
      title: 'HAL verify',
      description:
        'Run text through the live HAL cross-provider fact-check quorum (strictness 2). Returns ' +
        'PASS / FLAG / VETO, or NOT_CHECKED when HAL did not decide (never a pass), a 0–100 trust score, ' +
        'the decision reason, and per-provider evidence. ' +
        'Use it to check a claim before acting on it.',
      inputSchema: verifySchema,
    },
    verifyHandler,
  );
  registerTool(
    'evaluate',
    {
      title: 'HAL evaluate',
      description:
        'Alias of verify. Same live HAL quorum. Exists so every public surface names evaluate().',
      inputSchema: verifySchema,
    },
    verifyHandler,
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

  registerTool(
    'present_proof',
    {
      title: 'Present RepID proof',
      description:
        "Fetch an agent's RepID range proof (postcard). Pass verify=true for client-side WASM check. " +
        'Keyless. This tool is on the 1.4.0 tree; published @hyperdag/trustshell-mcp@1.0.0 does not have it.',
      inputSchema: {
        agentId: z.string().min(1).describe('Agent id (e.g. trinity-shofet).'),
        verify: z.boolean().optional().describe('If true, verify the proof locally with the WASM verifier.'),
      },
    },
    async ({ agentId, verify }: { agentId: string; verify?: boolean }) => {
      try {
        const r = await client.presentProof(agentId, { verify: verify === true });
        return jsonResult(r);
      } catch (e: any) {
        return errorResult(`present_proof failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  registerTool(
    'remember',
    {
      title: 'Local remember',
      description: 'Write a note into the local sqlite memory. No network. The row kind is note.',
      inputSchema: {
        text: z.string().min(1).describe('The note to store.'),
      },
    },
    async ({ text }: { text: string }) => {
      if (refusedValue(text)) return errorResult('remember refused');
      try {
        return jsonResult(rememberLocal(text));
      } catch (e: any) {
        const message = e?.message === 'remember refused' ? 'remember refused' : `remember failed: ${e?.message ?? String(e)}`;
        return errorResult(message);
      }
    },
  );

  registerTool(
    'recall',
    {
      title: 'Local recall',
      description: 'List saved notes from the local sqlite memory. do_not_send rows are a count only. No network.',
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResult(recallLocal());
      } catch (e: any) {
        return errorResult(`recall failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  registerTool(
    'redact',
    {
      title: 'Local redact',
      description: 'Delete one KEY row from the local sqlite memory. Missing is NOT_CHECKED. No network.',
      inputSchema: {
        key: z.string().min(1).describe('The key whose row to delete.'),
      },
    },
    async ({ key }: { key: string }) => {
      try {
        return jsonResult({ result: redactKey(key) });
      } catch (e: any) {
        return errorResult(`redact failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  // --- 1.4 CLI parity: snake_case names -----------------------------------------------------
  //
  // The CLI and SDK are the naming authority; the MCP surface had drifted to camelCase for two
  // tools and omitted two more. These are ADDITIONS, not renames: @hyperdag/trustshell@1.4.0 is
  // already published with `verify` / `evaluate` / `getLeaderboard` / `getRepID` live, so
  // renaming would break every agent config already pointing at them. The camelCase names stay
  // as aliases and the snake_case ones are canonical.

  registerTool(
    'verify_output',
    {
      title: 'Verify output',
      description:
        'Canonical name for verify/evaluate — matches SDK verifyOutput() and `trustshell verify`. ' +
        'Runs text through the live HAL cross-provider fact-check quorum and returns PASS / FLAG / ' +
        'VETO, or NOT_CHECKED when HAL did not decide (never a pass), a 0-100 trust score, the ' +
        'decision reason, and per-provider evidence.',
      inputSchema: verifySchema,
    },
    verifyHandler,
  );

  const getRepidHandler = async ({ agentId }: { agentId: string }) => {
    try {
      return jsonResult(await client.getRepID(agentId));
    } catch (e: any) {
      return errorResult(`get_repid failed: ${e?.message ?? String(e)}`);
    }
  };
  registerTool(
    'get_repid',
    {
      title: 'Get RepID',
      description:
        "Canonical name for getRepID — matches `trustshell repid`. Fetches an agent's live RepID " +
        'score and tier from the public repid-engine (keyless).',
      inputSchema: {
        agentId: z.string().min(1).describe('The agent id (UUID) or slug to look up.'),
      },
    },
    getRepidHandler,
  );
  registerTool(
    'repid',
    {
      title: 'RepID',
      description:
        "Alias of get_repid. Fetches an agent's live RepID score and tier from the public repid-engine (keyless).",
      inputSchema: {
        agentId: z.string().min(1).describe('The agent id (UUID) or slug to look up.'),
      },
    },
    getRepidHandler,
  );

  registerTool(
    'verify_proof',
    {
      title: 'Verify RepID proof',
      description:
        'Verify a RepID range proof CLIENT-SIDE with the WASM verifier (SDK verifyProof()). Takes ' +
        'either a full presentation object from present_proof, or raw proof bytes plus the ' +
        'statement they were produced against. Nothing is sent to the backend — this is a local ' +
        'check, which is the point: it is what lets a verifier trust a proof without trusting us.',
      inputSchema: {
        presentation: z
          .unknown()
          .optional()
          .describe('A full presentation object as returned by present_proof. Preferred.'),
        proofBytes: z
          .string()
          .optional()
          .describe('Raw proof bytes, if you do not have the full presentation.'),
        statement: z
          .unknown()
          .optional()
          .describe('The statement the proof was produced against. Required with proofBytes.'),
      },
    },
    async ({
      presentation,
      proofBytes,
      statement,
    }: {
      presentation?: unknown;
      proofBytes?: string;
      statement?: unknown;
    }) => {
      // Refuse rather than guess: verifyProof(undefined) would throw deep in the WASM path with a
      // message that does not name the caller's mistake.
      if (presentation === undefined && proofBytes === undefined) {
        return errorResult(
          'verify_proof failed: pass either `presentation` (from present_proof) or `proofBytes` + `statement`.',
        );
      }
      try {
        const r =
          presentation !== undefined
            ? await client.verifyProof(presentation as never)
            : await client.verifyProof(proofBytes as string, statement as never);
        return jsonResult(r);
      } catch (e: any) {
        return errorResult(`verify_proof failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  // `status` is here ONLY because `trustshell status` exists in this same repo (src/cli/status.ts)
  // and this calls that module rather than reimplementing it — so the MCP answer and the CLI
  // answer cannot drift. buildStatusReport already returns NOT_CHECKED lines when the engine is
  // unreachable or OFFLINE=1; those are passed through untouched, never collapsed into a pass.
  registerTool(
    'status',
    {
      title: 'TrustShell status',
      description:
        'Live capability + honesty report for the configured HyperDAG backend, identical to ' +
        '`trustshell status`. Reports can_verify / can_bind / can_stake / can_rate_models, the ' +
        'Honesty-A line and counted first-pass fields. NOT_CHECKED is a real outcome here and ' +
        'means the value could not be read — it never means false and never means passing.',
      inputSchema: {
        json: z
          .boolean()
          .optional()
          .describe('Return the parsed JSON view instead of the human-readable lines.'),
      },
    },
    async ({ json }: { json?: boolean }) => {
      try {
        const text = await buildStatusReport({ env: process.env, fetchImpl: fetch });
        return jsonResult(json === true ? statusJsonFromText(text) : { status: text });
      } catch (e: any) {
        return errorResult(`status failed: ${e?.message ?? String(e)}`);
      }
    },
  );

  // `check_claim` is `trustshell check "<sentence>"` for agents. It calls classifyClaim — the
  // one implementation the CLI also calls — so an agent and a terminal get the same label for
  // the same sentence, and both get the label the Chrome extension shows. not-checked is
  // returned as a normal result (it is an answer: "we could not check"), never as pass.
  registerTool(
    'check_claim',
    {
      title: 'Check a sentence',
      description:
        'Label one sentence pass / veto / not-checked via the public classify endpoint — the same ' +
        'label the TrustShell Chrome extension shows and `trustshell check "<sentence>"` prints. ' +
        'Returns {label, latency_ms} (plus reason when not-checked was decided locally). A timeout, ' +
        'network failure or off-contract answer is not-checked, which never means pass.',
      inputSchema: {
        text: z.string().min(1).describe('The sentence to check.'),
      },
    },
    async ({ text }: { text: string }) => {
      try {
        return jsonResult(await classifyClaim(text));
      } catch (e: any) {
        return errorResult(`check_claim failed: ${e?.message ?? String(e)}`);
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
