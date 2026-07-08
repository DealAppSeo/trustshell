#!/usr/bin/env node
/**
 * @hyperdag/trustshell-mcp
 * ------------------------------------------------------------------
 * An MCP (Model Context Protocol) server that wraps the @hyperdag/trustshell
 * SDK and exposes its trust capabilities as MCP TOOLS an AI can call directly
 * from Claude Desktop / Cursor / Windsurf — no terminal, no code.
 *
 * Transport: stdio (the standard MCP transport).
 *
 * HONESTY CONTRACT:
 *   - Keyless tools (verify_output, get_repid, present_proof, verify_proof)
 *     hit the live HyperDAG backend / bundled WASM verifier with NO credentials.
 *   - Keyed tools (list_services, buy_service) are exposed but GUARDED: if the
 *     required env (REPID_API_KEY / a funded wallet) is missing, they return a
 *     clear "needs credentials" message. A purchase is NEVER faked.
 *
 * ENV:
 *   REPID_API_KEY        — enables list_services + buy_service (optional)
 *   TRUSTSHELL_API_URL   — override backend (default: live Railway backend baked into the SDK)
 *   TRUSTSHELL_WALLET_KEY — payer private key (0x…) for buy_service x402 payment (optional)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TrustShell, buildX402Payment, verify as verifyProofOffline } from '@hyperdag/trustshell';

const REPID_API_KEY = process.env.REPID_API_KEY?.trim() || undefined;
const TRUSTSHELL_API_URL = process.env.TRUSTSHELL_API_URL?.trim() || undefined;
const TRUSTSHELL_WALLET_KEY = process.env.TRUSTSHELL_WALLET_KEY?.trim() || undefined;

/** One shared client. apiKey is only attached when present (keyless tools don't need it). */
const shell = new TrustShell({
  apiKey: REPID_API_KEY,
  apiUrl: TRUSTSHELL_API_URL,
});

/** MCP text-content helper. */
function text(payload: unknown): { content: { type: 'text'; text: string }[] } {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text: body }] };
}

/** MCP error-content helper (isError=true tells the model the call failed honestly). */
function err(message: string): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const server = new McpServer({
  name: 'hyperdag-trustshell',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// KEYLESS TOOLS — work with zero config against the live backend.
// ---------------------------------------------------------------------------

server.registerTool(
  'verify_output',
  {
    title: 'Verify an AI output (HAL fact-check)',
    description:
      'Run a real cross-LLM HAL fact-check on a piece of text. KEYLESS — needs no API key. ' +
      'Returns a verdict (PASS / FLAG / VETO), a 0–100 trust score, and per-provider evidence ' +
      '(the "why" behind the verdict). Use this to check whether a claim or an agent output is ' +
      'trustworthy before you act on it.',
    inputSchema: {
      text: z
        .string()
        .min(1)
        .describe('The AI output or claim to fact-check, e.g. "The Eiffel Tower is in Berlin."'),
    },
  },
  async ({ text: outputText }) => {
    try {
      const r = await shell.verifyOutput(outputText);
      return text({
        verdict: r.verdict,
        ok: r.ok,
        trustScore: r.trustScore,
        halScore: r.halScore,
        soft: r.soft,
        decisionReason: r.decisionReason,
        evidence: r.evidence,
        signals: r.signals,
        ...(r.glassBox ? { glassBox: r.glassBox } : {}),
      });
    } catch (e: any) {
      // The keyless HAL endpoint is anti-abuse rate-limited per IP. Surface that honestly.
      if (e?.status === 429) {
        return err(
          'verify_output: the keyless HAL fact-check hit its daily rate limit for this IP. ' +
            'This is a real anti-abuse guard on the free path — try again later, or set REPID_API_KEY ' +
            'for higher limits. (No result was faked.)',
        );
      }
      return err(`verify_output failed: ${e?.message ?? String(e)}`);
    }
  },
);

server.registerTool(
  'get_repid',
  {
    title: "Get an agent's RepID + tier",
    description:
      "Fetch an agent's live RepID (behavioral reputation score) and tier from the HyperDAG " +
      'backend. KEYLESS — needs no API key. Accepts an agent UUID or a known agent name (e.g. "sophia"). ' +
      'Tiers: PROBATIONARY / EARNING / ESTABLISHED / AUTONOMOUS / VETERAN.',
    inputSchema: {
      agent_id: z
        .string()
        .min(1)
        .describe('Agent UUID or known agent name (e.g. "sophia").'),
    },
  },
  async ({ agent_id }) => {
    try {
      const r = await shell.getRepID(agent_id);
      return text({
        agentId: r.agentId,
        repid: r.repid,
        tier: r.tier,
        lastAnchorTx: r.lastAnchorTx,
        latestProofHash: r.latestProofHash,
      });
    } catch (e: any) {
      return err(`get_repid failed: ${e?.message ?? String(e)}`);
    }
  },
);

server.registerTool(
  'present_proof',
  {
    title: 'Present a client-verifiable ZK RepID proof',
    description:
      "Fetch an agent's latest RepID range proof — a real Plonky3 STARK proof (POSTCARD tier) — and " +
      'optionally verify it client-side with the bundled WASM verifier ("trust the math, not the server"). ' +
      'KEYLESS — needs no API key. Requires an agent UUID.',
    inputSchema: {
      agent_id: z.string().min(1).describe('Agent UUID (proofs are keyed by UUID, not name).'),
      verify: z
        .boolean()
        .optional()
        .describe('If true, verify the proof locally with the bundled WASM verifier. Default: true.'),
    },
  },
  async ({ agent_id, verify }) => {
    try {
      const p = await shell.presentProof(agent_id, { verify: verify ?? true });
      return text({
        agentId: p.agentId,
        tier: p.tier,
        scheme: p.scheme,
        statement: p.statement,
        createdAt: p.createdAt,
        proofBytesLength: p.proofBytes ? p.proofBytes.length : 0,
        proofBytesPreview: p.proofBytes ? `${p.proofBytes.slice(0, 48)}…` : null,
        verification: p.verification ?? null,
        note:
          'proofBytes is base64-encoded Plonky3 proof bytes; use verify_proof to check it offline anywhere.',
      });
    } catch (e: any) {
      return err(`present_proof failed: ${e?.message ?? String(e)}`);
    }
  },
);

server.registerTool(
  'verify_proof',
  {
    title: 'Verify a ZK proof offline',
    description:
      'Verify a HyperDAG RepID range proof OFFLINE with the bundled WASM proof-verifier — no network, ' +
      'no server trust. KEYLESS. Pass the base64 proof bytes (from present_proof) and the public ' +
      'statement it claims.',
    inputSchema: {
      proof_bytes: z.string().min(1).describe('Base64-encoded Plonky3 proof bytes (from present_proof).'),
      statement: z
        .object({
          agent_id: z.string().describe('Agent UUID the proof is bound to.'),
          repid_score: z.number().describe('The RepID score asserted by the proof.'),
          threshold: z.number().describe('The threshold the proof proves the score is at/above.'),
          tier: z.string().describe('The tier asserted (e.g. ESTABLISHED).'),
        })
        .describe('The public statement the proof commits to.'),
    },
  },
  async ({ proof_bytes, statement }) => {
    try {
      const r = await verifyProofOffline(proof_bytes, statement);
      return text({
        verified: r.verified,
        error: r.error,
        verifierVersion: r.verifier_version,
      });
    } catch (e: any) {
      return err(
        `verify_proof failed: ${e?.message ?? String(e)}. ` +
          '(The bundled @hyperdag/proof-verifier WASM must be present.)',
      );
    }
  },
);

// ---------------------------------------------------------------------------
// KEYED TOOLS — exposed, but honestly guarded. Never fake a purchase.
// ---------------------------------------------------------------------------

server.registerTool(
  'list_services',
  {
    title: 'List the A2A marketplace catalog',
    description:
      'List services in the HyperDAG agent-to-agent marketplace (the agent_services catalog). ' +
      'NEEDS an API key: set REPID_API_KEY in this server\'s env. Without a key this route is 401-gated, ' +
      'so the tool returns a clear "needs credentials" message rather than faking a catalog. ' +
      '(Keyless alternative: browse https://trustshell.dev/market.)',
    inputSchema: {
      type: z.string().optional().describe('Filter by service_type (e.g. "verification").'),
      limit: z.number().int().positive().max(100).optional().describe('Max results (default backend page).'),
    },
  },
  async ({ type, limit }) => {
    if (!REPID_API_KEY) {
      return err(
        'list_services needs credentials: set REPID_API_KEY in this MCP server\'s env to browse the ' +
          'marketplace catalog (GET /api/v1/services is API-key gated). ' +
          'No catalog was fabricated. Keyless alternative: https://trustshell.dev/market',
      );
    }
    try {
      const page = await shell.listServices({ ...(type ? { type } : {}), ...(limit ? { limit } : {}) });
      return text({
        count: page.count,
        limit: page.limit,
        offset: page.offset,
        priceRangeUsdcRaw: page.priceRangeUsdcRaw,
        services: page.services.map((s) => ({
          id: s.id,
          serviceName: s.serviceName,
          serviceType: s.serviceType,
          basePriceUsdcRaw: s.basePriceUsdcRaw,
          minRepidToPurchase: s.minRepidToPurchase,
          active: s.active,
          providerAgentId: s.providerAgentId,
        })),
      });
    } catch (e: any) {
      if (e?.status === 401) {
        return err(
          'list_services: the backend rejected the API key (401). Check REPID_API_KEY is valid. ' +
            'No catalog was fabricated.',
        );
      }
      return err(`list_services failed: ${e?.message ?? String(e)}`);
    }
  },
);

server.registerTool(
  'buy_service',
  {
    title: 'Buy a marketplace service (x402 A2A purchase)',
    description:
      'Purchase a marketplace service agent-to-agent: create a service contract and escrow payment via ' +
      'x402 (EIP-3009 on Base Sepolia). NEEDS credentials: REPID_API_KEY (to authenticate) AND ' +
      'TRUSTSHELL_WALLET_KEY (a funded payer private key, to sign the payment). If either is missing the ' +
      'tool returns a clear "needs credentials" message and does NOT create a contract. Real money-path — ' +
      'never faked.',
    inputSchema: {
      buyer_agent_id: z.string().min(1).describe('Your (the buyer) repid-engine agent UUID.'),
      service_id: z.string().min(1).describe('UUID of the agent_services row to purchase (from list_services).'),
      payload: z
        .record(z.unknown())
        .optional()
        .describe('Task payload to pass to the provider (free-form; avoid SQL keywords).'),
      agreed_price_usdc_raw: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Agreed price in micro-USDC raw units (e.g. 100000 = 0.10 USDC). Defaults to the listing price.'),
    },
  },
  async ({ buyer_agent_id, service_id, payload, agreed_price_usdc_raw }) => {
    if (!REPID_API_KEY) {
      return err(
        'buy_service needs credentials: set REPID_API_KEY (authenticates the buyer). ' +
          'No contract was created and no payment was made.',
      );
    }
    if (!TRUSTSHELL_WALLET_KEY) {
      return err(
        'buy_service needs a funded wallet: set TRUSTSHELL_WALLET_KEY (a 0x-prefixed payer private key ' +
          'with Base Sepolia USDC) so the x402 payment can be signed. ' +
          'No contract was created and no payment was made — a purchase is never faked.',
      );
    }
    try {
      // Step 1: probe the contract to learn the exact price + payTo (the backend returns a 402 with
      // payment requirements when payment is required and no header is supplied).
      const probe = await shell.executeA2A({
        buyerAgentId: buyer_agent_id,
        serviceId: service_id,
        payload: payload ?? {},
        ...(agreed_price_usdc_raw ? { agreedPriceUsdcRaw: agreed_price_usdc_raw } : {}),
      });

      // If the backend didn't ask for payment, the contract is already created/escrowed — return it.
      if (!probe.paymentRequired) {
        return text({
          status: probe.status,
          contractId: probe.contractId,
          providerAgentId: probe.providerAgentId,
          agreedPriceUsdcRaw: probe.agreedPriceUsdcRaw,
          settlementId: probe.settlementId ?? null,
          note: 'Contract created. Fulfillment is asynchronous — poll getContractStatus / the backend for the result.',
        });
      }

      // Step 2: payment is required. Extract the payTo + amount from the 402 requirements and sign an
      // x402 header locally with the funded wallet, then retry the escrow leg.
      const accept = (probe.paymentRequired.accepts?.[0] ?? {}) as Record<string, any>;
      const payTo: string | undefined = accept.payTo ?? accept.to ?? accept.recipient;
      const amount = accept.maxAmountRequired ?? accept.amount ?? probe.agreedPriceUsdcRaw;
      const asset: string | undefined = accept.asset ?? accept.token;

      if (!payTo) {
        return err(
          'buy_service: the backend returned a 402 but no payTo address could be resolved from the ' +
            'payment requirements, so no payment was signed. Raw requirements: ' +
            JSON.stringify(probe.paymentRequired),
        );
      }

      const xPaymentHeader = await buildX402Payment({
        privateKey: TRUSTSHELL_WALLET_KEY,
        to: payTo,
        amount,
        ...(asset ? { asset } : {}),
      });

      const escrowed = await shell.executeA2A({
        buyerAgentId: buyer_agent_id,
        serviceId: service_id,
        payload: payload ?? {},
        ...(agreed_price_usdc_raw ? { agreedPriceUsdcRaw: agreed_price_usdc_raw } : {}),
        xPaymentHeader,
      });

      return text({
        status: escrowed.status,
        contractId: escrowed.contractId,
        providerAgentId: escrowed.providerAgentId,
        agreedPriceUsdcRaw: escrowed.agreedPriceUsdcRaw,
        settlementId: escrowed.settlementId ?? null,
        note:
          'Payment signed locally with your wallet and submitted for x402 escrow. Fulfillment is ' +
          'asynchronous — poll the backend for the final result.',
      });
    } catch (e: any) {
      if (e?.status === 401) {
        return err('buy_service: backend rejected the API key (401). No payment was made.');
      }
      return err(`buy_service failed: ${e?.message ?? String(e)}. No payment was made if this errored before escrow.`);
    }
  },
);

// ---------------------------------------------------------------------------
// Boot over stdio.
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // NOTE: stdout is the MCP transport channel — never console.log there.
  // Diagnostics go to stderr.
  const keyState = REPID_API_KEY ? 'REPID_API_KEY set (keyed tools enabled)' : 'no REPID_API_KEY (keyed tools guarded)';
  process.stderr.write(`[trustshell-mcp] ready over stdio — 6 tools — ${keyState}\n`);
}

main().catch((e) => {
  process.stderr.write(`[trustshell-mcp] fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
