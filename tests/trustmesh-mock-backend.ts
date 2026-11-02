/**
 * TrustMesh mock backend — a LOCAL, in-process stand-in for the repid-engine A2A endpoints the
 * TrustShell SDK calls. It exists so `tests/trustmesh-e2e.test.ts` can drive the SDK's REAL client
 * code (TrustShell.init → executeA2A → buildX402Payment → getContractStatus/pollUntilSettled) over
 * actual HTTP, with no live backend, no chain and no funds.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS A CLIENT-FLOW FIXTURE. Every shape below is derived from the SDK's own TYPES and INLINE
 * DOCS in src/lib/trustshell.ts (line refs cited per endpoint), so the fixture is faithful to the
 * contract the SDK *documents and consumes*. It is NOT a guarantee that the live repid-engine
 * backend matches these shapes byte-for-byte — a live-backend E2E (real repid-engine + real x402 on
 * Base Sepolia) is a separate follow-up. Nothing here verifies a payment on-chain: escrow only
 * requires a well-formed `X-PAYMENT` header to be present, exactly as a client-flow test should.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Endpoints mirrored (all under /api/v1, the base the SDK builds from `resolveApiBase` → `fetch`):
 *
 *   GET  /health                      — TrustShell.init() probe. src/lib/trustshell.ts:698
 *                                       (reads res.ok + data.status).
 *   GET  /api/v1/services             — listServices(). trustshell.ts:1621-1649; body `{ data:[row],
 *                                       count, limit, offset }`; each row per mapServiceRow
 *                                       (trustshell.ts:1735: id, provider_agent_id, service_type,
 *                                       service_name, description, base_price_usdc_raw,
 *                                       min_repid_to_purchase, active).
 *   GET  /api/v1/services/:id         — getService(). trustshell.ts:1653-1662; single row, 404 shape.
 *   POST /api/v1/contracts            — executeA2A() step 1. trustshell.ts:1421-1443; request body
 *                                       `{ service_id, buyer_agent_id, payload, agreed_price_usdc_raw? }`;
 *                                       response read as `{ id, status, provider_agent_id,
 *                                       agreed_price_usdc_raw }` (contract starts `pending`).
 *   POST /api/v1/contracts/:id/escrow — executeA2A() step 2. trustshell.ts:1446-1528.
 *                                       • No `X-PAYMENT` header → HTTP 402 with payment requirements
 *                                         `{ x402Version, accepts:[...], error }` (read at :1460-1464).
 *                                       • `X-PAYMENT` header present & well-formed → 200
 *                                         `{ status:'escrowed', provider_agent_id,
 *                                         agreed_price_usdc_raw, x402_payment_id }` (read at
 *                                         :1521-1528; x402_payment_id → A2AResult.settlementId).
 *   GET  /api/v1/contracts/:id        — getContractStatus()/pollUntilSettled(). trustshell.ts:1670-1731;
 *                                       response `{ id, status, provider_agent_id, buyer_agent_id,
 *                                       agreed_price_usdc_raw, x402_payment_id?, result? }`. Status
 *                                       domain: pending|escrowed|fulfilled|disputed|cancelled
 *                                       (trustshell.ts:278). Terminal set per pollUntilSettled
 *                                       default (:1713-1715) includes fulfilled & disputed.
 *
 * Status machine (per contract): a GET that observes `escrowed` returns `escrowed` ONCE and then
 * advances the stored status to its terminal value, so a poll genuinely sees `escrowed → terminal`
 * rather than an instant jump. A contract bought from the "dispute" service terminates in
 * `disputed`; any other service terminates in `fulfilled`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

/** Base Sepolia USDC — the SDK's default x402 asset (src/lib/x402-prepare.ts). */
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export interface MockService {
  id: string;
  provider_agent_id: string;
  service_type: string;
  service_name: string;
  description: string;
  base_price_usdc_raw: number;
  min_repid_to_purchase: number;
  active: boolean;
  /** Which terminal status a contract for this service settles into. */
  settlesTo: 'fulfilled' | 'disputed';
}

interface ContractRow {
  id: string;
  status: 'pending' | 'escrowed' | 'fulfilled' | 'disputed' | 'cancelled';
  provider_agent_id: string;
  buyer_agent_id: string;
  agreed_price_usdc_raw: number;
  x402_payment_id?: string;
  result?: unknown;
  settlesTo: 'fulfilled' | 'disputed';
}

export interface MockBackend {
  /** e.g. http://127.0.0.1:53124 — pass straight to TrustShell.init({ apiUrl }). */
  baseUrl: string;
  /** Every request the SDK made, for assertions. */
  requests: Array<{ method: string; path: string; hadPayment: boolean }>;
  /** Snapshot a contract row the server holds (test introspection only). */
  contract(id: string): ContractRow | undefined;
  close(): Promise<void>;
  /** The provider wallet address echoed as x402 `payTo` in 402 requirements. */
  providerPayTo: string;
}

export interface MockOptions {
  services: MockService[];
  /** A valid (checksummed) address the 402 requirements point payment at. */
  providerPayTo: string;
}

/** Is `header` a well-formed x402 header (base64 JSON carrying from/to/value/signature)? */
export function isWellFormedX402(header: string | undefined): boolean {
  if (!header) return false;
  try {
    const json = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    return (
      typeof json === 'object' &&
      json !== null &&
      typeof json.from === 'string' &&
      typeof json.to === 'string' &&
      typeof json.value === 'string' &&
      typeof json.signature === 'string'
    );
  } catch {
    return false;
  }
}

export async function startMockBackend(opts: MockOptions): Promise<MockBackend> {
  const services = new Map(opts.services.map((s) => [s.id, s]));
  const contracts = new Map<string, ContractRow>();
  const requests: MockBackend['requests'] = [];

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;
      const hadPayment = isWellFormedX402(
        (req.headers['x-payment'] as string | undefined) ?? undefined,
      );
      requests.push({ method, path, hadPayment });

      const send = (code: number, obj: unknown): void => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const row = (s: MockService) => ({
        id: s.id,
        provider_agent_id: s.provider_agent_id,
        service_type: s.service_type,
        service_name: s.service_name,
        description: s.description,
        base_price_usdc_raw: s.base_price_usdc_raw,
        min_repid_to_purchase: s.min_repid_to_purchase,
        active: s.active,
      });

      // GET /health — init() probe.
      if (method === 'GET' && path === '/health') return send(200, { status: 'ok' });

      // GET /api/v1/services — listServices().
      if (method === 'GET' && path === '/api/v1/services') {
        const data = [...services.values()].map(row);
        return send(200, { data, count: data.length, limit: 50, offset: 0 });
      }

      // GET /api/v1/services/:id — getService().
      const svcMatch = /^\/api\/v1\/services\/([^/]+)$/.exec(path);
      if (method === 'GET' && svcMatch) {
        const s = services.get(decodeURIComponent(svcMatch[1]!));
        if (!s) return send(404, { error: 'service_not_found' });
        return send(200, row(s));
      }

      // POST /api/v1/contracts — executeA2A() step 1: create (pending).
      if (method === 'POST' && path === '/api/v1/contracts') {
        const b = JSON.parse(body || '{}');
        const s = services.get(b.service_id);
        if (!s) return send(404, { error: 'service_not_found' });
        const id = randomUUID();
        const price =
          typeof b.agreed_price_usdc_raw === 'number'
            ? b.agreed_price_usdc_raw
            : s.base_price_usdc_raw;
        contracts.set(id, {
          id,
          status: 'pending',
          provider_agent_id: s.provider_agent_id,
          buyer_agent_id: b.buyer_agent_id,
          agreed_price_usdc_raw: price,
          settlesTo: s.settlesTo,
        });
        return send(200, {
          id,
          status: 'pending',
          provider_agent_id: s.provider_agent_id,
          agreed_price_usdc_raw: price,
        });
      }

      // POST /api/v1/contracts/:id/escrow — executeA2A() step 2.
      const escMatch = /^\/api\/v1\/contracts\/([^/]+)\/escrow$/.exec(path);
      if (method === 'POST' && escMatch) {
        const c = contracts.get(decodeURIComponent(escMatch[1]!));
        if (!c) return send(404, { error: 'contract_not_found' });
        const header = req.headers['x-payment'] as string | undefined;
        if (!header) {
          // No payment yet: tell the client what it owes (x402 402 requirements).
          return send(402, {
            x402Version: 1,
            error: 'payment_required',
            accepts: [
              {
                scheme: 'exact',
                network: 'base-sepolia',
                maxAmountRequired: String(c.agreed_price_usdc_raw),
                resource: `/api/v1/contracts/${c.id}/escrow`,
                description: 'Escrow for A2A service contract',
                mimeType: 'application/json',
                payTo: opts.providerPayTo,
                maxTimeoutSeconds: 3600,
                asset: BASE_SEPOLIA_USDC,
                extra: { name: 'USDC', version: '2' },
              },
            ],
          });
        }
        if (!isWellFormedX402(header)) {
          return send(400, { error: 'x402_malformed' });
        }
        // Well-formed payment present: escrow it. (No on-chain verification — client-flow fixture.)
        c.status = 'escrowed';
        c.x402_payment_id = `x402_${randomUUID()}`;
        return send(200, {
          id: c.id,
          status: 'escrowed',
          provider_agent_id: c.provider_agent_id,
          agreed_price_usdc_raw: c.agreed_price_usdc_raw,
          x402_payment_id: c.x402_payment_id,
        });
      }

      // GET /api/v1/contracts/:id — getContractStatus() / pollUntilSettled().
      const getMatch = /^\/api\/v1\/contracts\/([^/]+)$/.exec(path);
      if (method === 'GET' && getMatch) {
        const c = contracts.get(decodeURIComponent(getMatch[1]!));
        if (!c) return send(404, { error: 'contract_not_found' });
        const snapshot = {
          id: c.id,
          status: c.status,
          provider_agent_id: c.provider_agent_id,
          buyer_agent_id: c.buyer_agent_id,
          agreed_price_usdc_raw: c.agreed_price_usdc_raw,
          x402_payment_id: c.x402_payment_id,
          result: c.result,
        };
        // Advance AFTER snapshotting, so the first poll sees `escrowed`, the next sees terminal.
        if (c.status === 'escrowed') {
          c.status = c.settlesTo;
          c.result =
            c.settlesTo === 'fulfilled'
              ? { ok: true, output: 'service delivered' }
              : { ok: false, dispute: { reason: 'provider_output_rejected' } };
        }
        return send(200, snapshot);
      }

      return send(404, { error: 'not_found', path });
    });
  };

  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    contract: (id: string) => contracts.get(id),
    providerPayTo: opts.providerPayTo,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
