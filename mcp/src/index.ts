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
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { TrustShell, buildX402Payment, verify as verifyProofOffline } from '@hyperdag/trustshell';

const REPID_API_KEY = process.env.REPID_API_KEY?.trim() || undefined;
const TRUSTSHELL_API_URL = process.env.TRUSTSHELL_API_URL?.trim() || undefined;
const TRUSTSHELL_WALLET_KEY = process.env.TRUSTSHELL_WALLET_KEY?.trim() || undefined;

/** SDK default backend when TRUSTSHELL_API_URL is unset — kept in sync with the SDK so the
 *  MCP's own direct escrow-by-id fetch (see buy_service) hits the same origin the SDK uses. */
const DEFAULT_API_URL = 'https://repid-engine-production.up.railway.app';

/**
 * Fail-fast validation of TRUSTSHELL_API_URL. An invalid override (e.g. a bare host, a typo,
 * or a non-http(s) scheme) otherwise fails opaquely deep inside a per-call fetch. Returns the
 * validated base URL (no trailing slash), or throws a clear message the operator can act on.
 */
export function resolveApiUrl(raw: string | undefined): string {
  if (!raw) return DEFAULT_API_URL;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(
      `TRUSTSHELL_API_URL is not a valid URL: ${JSON.stringify(raw)}. ` +
        `Set it to a full http(s) origin (e.g. ${DEFAULT_API_URL}) or unset it to use the default.`,
    );
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(
      `TRUSTSHELL_API_URL must use http/https, got ${JSON.stringify(u.protocol)} in ${JSON.stringify(raw)}.`,
    );
  }
  return raw.replace(/\/+$/, '');
}

/** Validated backend origin. Throwing here fails the process at boot (fail-fast) rather than
 *  surfacing an opaque error on every tool call. */
const API_URL = resolveApiUrl(TRUSTSHELL_API_URL);

/** One shared client. apiKey is only attached when present (keyless tools don't need it). */
const shell = new TrustShell({
  apiKey: REPID_API_KEY,
  apiUrl: API_URL,
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

/** A hex 0x…40 EVM address (case-insensitive). Used to sanity-check the 402 payTo before signing. */
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Money-safety gate for buy_service: decide whether it is safe to SIGN a payment for the
 * amount/recipient the backend asked for, given the authoritative marketplace listing.
 *
 * Conservative by design — reject on doubt, never sign above the listed price, never sign to a
 * malformed/unexpected recipient. Pure + exported so it can be unit-tested without a network.
 *
 * @param listedPriceRaw  the listing's base_price_usdc_raw (authoritative ceiling)
 * @param agreedPriceRaw  optional caller-agreed price (must itself be <= listed price)
 * @param quotedAmountRaw the amount the 402 payment requirements ask us to pay
 * @param payTo           the recipient address from the 402 payment requirements
 */
export function checkPaymentSafe(
  listedPriceRaw: number,
  agreedPriceRaw: number | undefined,
  quotedAmountRaw: unknown,
  payTo: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(listedPriceRaw) || listedPriceRaw < 0) {
    return { ok: false, reason: `listing has no usable base price (got ${String(listedPriceRaw)})` };
  }
  // The price the buyer authorized: their agreed price if given, else the listing price.
  // An agreed price ABOVE the listing is itself rejected (never authorize more than list).
  if (agreedPriceRaw !== undefined) {
    if (!Number.isFinite(agreedPriceRaw) || agreedPriceRaw <= 0) {
      return { ok: false, reason: `agreed price is not a positive number (got ${String(agreedPriceRaw)})` };
    }
    if (agreedPriceRaw > listedPriceRaw) {
      return {
        ok: false,
        reason: `agreed price ${agreedPriceRaw} exceeds the listed price ${listedPriceRaw} — refusing to authorize more than list`,
      };
    }
  }
  const ceiling = agreedPriceRaw ?? listedPriceRaw;

  const amount = typeof quotedAmountRaw === 'string' ? Number(quotedAmountRaw) : quotedAmountRaw;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: `backend quoted a non-positive/unparseable amount (${String(quotedAmountRaw)})` };
  }
  if (amount > ceiling) {
    return {
      ok: false,
      reason: `backend quoted ${amount} which exceeds the authorized price ${ceiling} (listed ${listedPriceRaw}) — refusing to sign`,
    };
  }
  if (typeof payTo !== 'string' || !EVM_ADDRESS_RE.test(payTo)) {
    return { ok: false, reason: `backend payTo is not a valid EVM address (${String(payTo)}) — refusing to sign` };
  }
  return { ok: true };
}

/**
 * Escrow an ALREADY-CREATED contract by id, reusing the single contract from the probe. The
 * published SDK bundles create+escrow inside executeA2A and exposes no escrow-by-id method, so a
 * second executeA2A would POST /contracts again and orphan the first contract (double-spend risk).
 * This hits the same POST /api/v1/contracts/:id/escrow leg the SDK uses internally — one contract,
 * one escrow. Uses the same origin + auth as the shared SDK client.
 */
async function escrowContractById(
  contractId: string,
  xPaymentHeader: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-PAYMENT': xPaymentHeader,
  };
  if (REPID_API_KEY) headers['Authorization'] = `Bearer ${REPID_API_KEY}`;
  const res = await fetch(`${API_URL}/api/v1/contracts/${encodeURIComponent(contractId)}/escrow`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
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
      // HONESTY: only a PASS reads as "verified". The SDK's `ok` is true on a soft FLAG too
      // (ok = verdict !== 'VETO'), which an AI reads as "verified/OK". Make the MCP result
      // unambiguous: top-level `verified` is true ONLY on PASS, and FLAG/VETO come back as an
      // MCP error (isError) so the model cannot mistake a flagged/vetoed claim for a clean one.
      const verified = r.verdict === 'PASS';
      const payload = {
        verified,
        verdict: r.verdict,
        // keep the SDK's raw ok for transparency, but clearly subordinate to `verified`
        sdkOk: r.ok,
        trustScore: r.trustScore,
        halScore: r.halScore,
        soft: r.soft,
        decisionReason: r.decisionReason,
        evidence: r.evidence,
        signals: r.signals,
        ...(r.glassBox ? { glassBox: r.glassBox } : {}),
      };
      if (!verified) {
        return err(
          `verify_output: NOT verified — verdict ${r.verdict} (${r.verdict === 'VETO' ? 'hard veto' : 'flagged, not clean'}). ` +
            `Do NOT treat this output as verified. Details:\n${JSON.stringify(payload, null, 2)}`,
        );
      }
      return text(payload);
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
      const doVerify = verify ?? true;
      const p = await shell.presentProof(agent_id, { verify: doVerify });
      const payload = {
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
      };
      // HONESTY: when local verification was requested, a proof that did NOT verify (failed check,
      // or no verifier/proof present so verification is null) must NOT read as MCP success. An AI
      // reading a success result will say "proof verified" — only a real verified===true earns that.
      if (doVerify && p.verification?.verified !== true) {
        const why = p.verification
          ? `verification failed: ${p.verification.error ?? 'not verified'}`
          : 'no client-side verification result (missing proof bytes/statement or the WASM verifier)';
        return err(
          `present_proof: proof was NOT verified (${why}). Do NOT claim the RepID proof is verified. ` +
            `Details:\n${JSON.stringify(payload, null, 2)}`,
        );
      }
      return text(payload);
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
      // Step 0: fetch the AUTHORITATIVE listing first, so we can sanity-check the backend's quoted
      // price/recipient before ever signing a payment (never sign above list, never to a surprise
      // address). This is a public read.
      const listing = await shell.getService(service_id);
      if (!listing.active) {
        return err(
          `buy_service: service ${service_id} is not active — refusing to create a contract or pay. No payment was made.`,
        );
      }
      if (agreed_price_usdc_raw !== undefined && agreed_price_usdc_raw > listing.basePriceUsdcRaw) {
        return err(
          `buy_service: agreed price ${agreed_price_usdc_raw} exceeds the listed price ${listing.basePriceUsdcRaw} — ` +
            `refusing to authorize more than list. No contract was created and no payment was made.`,
        );
      }

      // Step 1: create EXACTLY ONE contract and learn the exact payment requirements. With no payment
      // header the backend replies 402 with { accepts: [...] }; the SDK echoes them in paymentRequired
      // and hands back the single contractId it created. We reuse THAT id below — we never call
      // executeA2A a second time (which would POST /contracts again and orphan this one).
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
          note: 'Contract created (no payment required). Fulfillment is asynchronous — poll the backend for the result.',
        });
      }

      // Step 2: payment IS required. Extract payTo + amount from the 402 requirements.
      const accept = (probe.paymentRequired.accepts?.[0] ?? {}) as Record<string, any>;
      const payTo: unknown = accept.payTo ?? accept.to ?? accept.recipient;
      const amount = accept.maxAmountRequired ?? accept.amount ?? probe.agreedPriceUsdcRaw;
      const asset: string | undefined = accept.asset ?? accept.token;

      // Step 3: MONEY-SAFETY GATE — verify the quoted amount/recipient against the authoritative
      // listing BEFORE signing anything. Reject on any doubt; the created contract is left un-escrowed
      // (no money moves). One contract exists; zero payments signed.
      const safe = checkPaymentSafe(listing.basePriceUsdcRaw, agreed_price_usdc_raw, amount, payTo);
      if (!safe.ok) {
        return err(
          `buy_service: refusing to sign the x402 payment — ${safe.reason}. ` +
            `Contract ${probe.contractId} was created but left UN-ESCROWED (no payment was signed or made). ` +
            `Backend 402 requirements: ${JSON.stringify(probe.paymentRequired)}`,
        );
      }

      // Step 4: sign the x402 header locally, then escrow the SAME contract by id (one contract,
      // one escrow — no second executeA2A / no second POST /contracts).
      const xPaymentHeader = await buildX402Payment({
        privateKey: TRUSTSHELL_WALLET_KEY,
        to: payTo as string,
        amount,
        ...(asset ? { asset } : {}),
      });

      const escrow = await escrowContractById(probe.contractId, xPaymentHeader);
      if (escrow.status === 401) {
        return err(
          `buy_service: backend rejected the API key (401) at escrow. Contract ${probe.contractId} exists but was NOT paid. ` +
            `The payment authorization was signed but not accepted — no funds moved.`,
        );
      }
      if (escrow.status === 402) {
        return err(
          `buy_service: backend still returned 402 at escrow for contract ${probe.contractId} — the signed payment was ` +
            `not accepted, so no funds moved. Requirements: ${JSON.stringify(escrow.body)}`,
        );
      }
      if (!escrow.ok) {
        return err(
          `buy_service: escrow failed (${escrow.status}) for contract ${probe.contractId} — ${escrow.body?.error ?? 'unknown error'}. ` +
            `No second contract was created.`,
        );
      }

      return text({
        status: escrow.body.status ?? 'escrowed',
        contractId: probe.contractId,
        providerAgentId: escrow.body.provider_agent_id ?? probe.providerAgentId,
        agreedPriceUsdcRaw: escrow.body.agreed_price_usdc_raw ?? probe.agreedPriceUsdcRaw,
        settlementId: escrow.body.x402_payment_id ?? null,
        note:
          'Payment signed locally with your wallet and submitted for x402 escrow against the single ' +
          'contract created above. Fulfillment is asynchronous — poll the backend for the final result.',
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
  const keyState = REPID_API_KEY
    ? 'REPID_API_KEY set (list_services enabled)'
    : 'no REPID_API_KEY (list_services + buy_service guarded)';
  const walletState = TRUSTSHELL_WALLET_KEY
    ? 'TRUSTSHELL_WALLET_KEY set'
    : 'no TRUSTSHELL_WALLET_KEY (buy_service guarded — a purchase ALSO needs a funded wallet key, not just REPID_API_KEY)';
  process.stderr.write(`[trustshell-mcp] ready over stdio — 6 tools — backend ${API_URL} — ${keyState}; ${walletState}\n`);
}

// Boot ONLY when run as the entry point (not when imported by a test/consumer). This lets the
// pure helpers above be unit-tested without spawning the stdio server.
const isEntry = (() => {
  try {
    const argvPath = process.argv[1];
    if (!argvPath) return false;
    return fileURLToPath(import.meta.url) === resolve(argvPath);
  } catch {
    return false;
  }
})();

if (isEntry) {
  main().catch((e) => {
    process.stderr.write(`[trustshell-mcp] fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
