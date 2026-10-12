/**
 * E-1, the reproduction: uses ONLY the public surface that existed before the fix, so it runs unchanged against
 * the old code (where it FAILS: a placeholder, a transaction hash and a near-miss registry each came out as
 * "on-chain" / MINTED / `minted: true`) and against the new code (where it passes). The full contract is in
 * tests/mint-honesty.test.ts; this file is the before/after pair.
 */
import { formatRepid, run, parseArgs, EXIT, type CliIO } from '../src/cli';
import { identityFromPassport } from '../src/lib/identity';
import { repidHonesty } from '../src/lib/honest-contract';
import { TrustShell } from '../src/lib/trustshell';

const REG = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const UUID = 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271';
const OWNER = '0x1111111111111111111111111111111111111111';
const TX = '0x' + 'ab'.repeat(32);
const NEAR_MISS = REG.slice(0, -1) + 'f';

const passport = (contract_address: unknown) => ({
  agent: { agent_id: UUID },
  reputation: { repid_score: 1359, tier: 'ESTABLISHED' },
  identity_erc8004: { registered_onchain: 'MINTED', token_id: '3747', contract_address, mint_tx_hash: TX, conservator_address: OWNER },
});

const REGISTRY_RECORDS: Array<[string, unknown]> = [
  ['a placeholder', 'pending-mint:trinity-w3c'],
  ['a transaction hash', TX],
  ['a near-miss of the registry', NEAR_MISS],
];

describe.each(REGISTRY_RECORDS)('a MINTED record whose registry column holds %s', (_label, address) => {
  it('is not printed as on-chain by the CLI line', () => {
    const line = formatRepid('sophia', 1359, 'ESTABLISHED', identityFromPassport(passport(address)));
    expect(line).not.toMatch(/\(on-chain/);
    expect(line).toMatch(/NOT_CHECKED/);
  });

  it('is not MINTED in the identity the SDK, the CLI --json and the MCP tool return', async () => {
    const realFetch = global.fetch;
    global.fetch = (async (u: string) => {
      const url = String(u);
      const body = url.includes('/passport/')
        ? passport(address)
        : url.includes('/onchain')
          ? { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND' }
          : { score: 1359, tier: 'ESTABLISHED', minted: true, agent_id: UUID };
      return new Response(JSON.stringify(body), { status: url.includes('/proof') ? 404 : 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const client = new TrustShell({ apiUrl: 'https://engine.test' });
      const r = await client.getRepID('trinity-sophia');
      expect(r.identity?.registeredOnchain).not.toBe('MINTED');
      expect(r.minted).not.toBe(true);
      const out: string[] = [];
      const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
      expect(await run(parseArgs(['repid', 'trinity-sophia', '--json']), client, io)).toBe(EXIT.OK);
      const parsed = JSON.parse(out.join('\n'));
      expect(parsed.identity.registeredOnchain).not.toBe('MINTED');
      expect(parsed.minted).not.toBe(true);
    } finally {
      global.fetch = realFetch;
    }
  });
});

it('repidHonesty does not turn an address-shaped string in the registry column into minted: true', () => {
  for (const addr of ['0xabc123', NEAR_MISS, TX]) {
    expect(repidHonesty({ erc8004_address: addr, erc8004_token_id: '6705' }).minted).not.toBe(true);
  }
});

// ---- the extension popup, through its original surface only (checkAgent + agentLines) ----
describe.each(REGISTRY_RECORDS)('the popup, for a MINTED record whose registry column holds %s', (_label, address) => {
  it('does not say on-chain', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const agent = require('../extension/agent.js') as {
      checkAgent: (id: unknown, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      agentLines: (r: Record<string, unknown>) => string[];
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fixture = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'repid-proof-trinity-sophia.json'), 'utf8'));
    const routes: Record<string, unknown> = {
      '/api/v1/repid/trinity-sophia': { score: 1334, tier: 'ESTABLISHED', agent_id: fixture.statement.agent_id },
      '/api/v1/repid/trinity-sophia/proof': fixture,
      '/api/v1/passport/trinity-sophia': { ...passport(address), agent: { agent_id: fixture.statement.agent_id } },
      // a perfect live ownership read, for the code that makes one
      [`/api/v1/agents/${fixture.statement.agent_id}/onchain`]: { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND' },
    };
    const impl = async (url: string) => {
      const path = url.split('?')[0]!;
      const key = Object.keys(routes).find((k) => path.endsWith(k));
      return key ? { ok: true, json: async () => routes[key] } : { ok: false, json: async () => ({}) };
    };
    const r = await agent.checkAgent('trinity-sophia', { fetchImpl: impl, verify: async () => ({ verified: true }) });
    const line = agent.agentLines(r)[1]!;
    expect(line).not.toMatch(/\(on-chain/);
    expect(line).toMatch(/NOT_CHECKED/);
  });
});

// ---- the web passport page, rendered, through its original surface only (the async page + fetch) ----
describe.each(REGISTRY_RECORDS)('the web passport page, for a MINTED record whose registry column holds %s', (_label, address) => {
  it('does not say Registered on-chain', async () => {
    const prevFetch = global.fetch;
    global.fetch = (async (u: string) => {
      const url = new URL(String(u), 'https://engine.test');
      const body = url.pathname.includes('/passport/')
        ? {
            passport_version: '1',
            as_of: '2026-10-12T00:00:00Z',
            agent: { agent_id: UUID, agent_name: 'trinity-sophia', display_name: 'Trinity Sophia', created_at: null },
            reputation: { repid_score: 1359, tier: 'ESTABLISHED', activity_30d: 3 },
            identity_erc8004: { registered_onchain: 'MINTED', token_id: '3747', contract_address: address, network: 'base-sepolia', mint_tx_hash: TX, mint_basescan_url: null, minted_at: null, conservator_address: OWNER, live_verification_endpoint: `/api/v1/agents/${UUID}/onchain` },
            payments_x402: { real_settlements: 0, simulated_settlements: 0, last_real_settlement: null, policy: 'p' },
            reputation_onchain: { registry_address: '0x8004B663056A597Dffe9eCcC1965A193B7388713', network: 'base-sepolia', writes: 0, last_write: null },
            zkp: { latest_proof: null, disclosure: 'd', proof_endpoint: '/x', verify_endpoint: '/y' },
          }
        : { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      let page: ((a: { params: Promise<{ agentId: string }> }) => Promise<unknown>) | undefined;
      let toMarkup: ((el: unknown) => string) | undefined;
      jest.isolateModules(() => {
        toMarkup = (require('react-dom/server') as typeof import('react-dom/server')).renderToStaticMarkup as never;
        page = (require('../app/passport/[agentId]/page') as { default: typeof page }).default;
      });
      const html = toMarkup!(await page!({ params: Promise.resolve({ agentId: 'trinity-sophia' }) }));
      expect(html.replace(/<[^>]+>/g, ' ')).not.toContain('Registered on-chain');
    } finally {
      global.fetch = prevFetch;
    }
  });
});
