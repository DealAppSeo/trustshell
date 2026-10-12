/**
 * THE V1 CLIENT LEAF for repid-engine #1330: the passport now FOLDS the live ownerOf read into itself as an
 * additive `onchain` object, so a client gets the verified result in the ONE `GET /passport/:id` it already
 * makes, instead of a SECOND `GET /agents/:id/onchain` per record (trustshell #523 was that interim second call).
 *
 * This suite proves two things, on every client surface (SDK, CLI/MCP via the SDK, the extension popup, the web
 * display lib, the browser passport-client, and the rendered page):
 *   1. SINGLE CALL when `passport.onchain` is present: the verdict is read from it and NO second call is made.
 *   2. FALLBACK when it is absent (an older / not-yet-redeployed engine): the old second `GET /agents/:id/onchain`
 *      still happens for a recorded MINTED, unchanged.
 *
 * The honesty rules survive, three states stay three:
 *   - VERIFIED_ONCHAIN (owner found on the canonical registry) → verified; `verified_at` surfaced where shown.
 *   - MINTED but unverified (check NOT_CHECKED / the chain not reached) → NOT a pass: NOT_CHECKED, recorded beside it.
 *   - a NON-CANONICAL `onchain.registry` NEVER reads as verified, even if the engine's own `verified` says true —
 *     the client judges the registry the read was bound to, it does not trust the word.
 *   - the registry is judged from `onchain.registry`, so an agent whose DB `contract_address` is null is still
 *     verified when the live read (bound to the canonical registry) confirms it — the whole point of #1330.
 */
import {
  IDENTITY_REGISTRY_BASE_SEPOLIA,
  identityFromPassport,
  isVerifiedOnChain,
  onChainReadFromPassport,
  passportCarriesOnChainRead,
} from '../src/lib/identity';
import { TrustShell } from '../src/lib/trustshell';
import { embeddedOnChain, mintVerdictOf, onChainShownFromPassport, twoFieldsOf } from '../lib/erc8004-display';
import { fetchTwoFields } from '../lib/passport-client';

const REG = IDENTITY_REGISTRY_BASE_SEPOLIA;
const UUID = 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271';
const OWNER = '0x1111111111111111111111111111111111111111';
const NEAR_MISS = REG.slice(0, -1) + 'f';
const AT = '2026-10-12T00:00:00Z';

/** The engine's folded-in `onchain` object (PassportOnchain). Defaults to VERIFIED_ONCHAIN. */
const onchain = (over: Record<string, unknown> = {}) => ({
  state: 'VERIFIED_ONCHAIN',
  verified: true,
  owner: OWNER,
  registry: REG,
  chainId: 84532,
  block: 123,
  verified_at: AT,
  check: 'OWNER_FOUND',
  ...over,
});

/**
 * A passport that carries the folded-in read. `contract_address` is null ON PURPOSE: #1330's point is that the
 * DB registry column is unreliable (the engine returns null when it will not vouch for it), and verification must
 * come from the registry the LIVE READ was bound to (`onchain.registry`). Pass `oc: null` to drop the folded-in field.
 */
const passport = (opts: { idOver?: Record<string, unknown>; oc?: Record<string, unknown> | null; token?: unknown } = {}) => {
  const { idOver = {}, oc = onchain(), token = '3747' } = opts;
  const p: Record<string, unknown> = {
    passport_version: '1',
    as_of: AT,
    agent: { agent_id: UUID, agent_name: 'trinity-sophia', display_name: 'Trinity Sophia', created_at: null },
    reputation: { repid_score: 1359, tier: 'ESTABLISHED', activity_30d: 3 },
    identity_erc8004: {
      registered_onchain: 'MINTED',
      token_id: token,
      contract_address: null,
      network: 'base-sepolia',
      mint_tx_hash: '0x' + 'ab'.repeat(32),
      mint_basescan_url: `https://sepolia.basescan.org/tx/0x${'ab'.repeat(32)}`,
      minted_at: '2026-09-01T00:00:00Z',
      conservator_address: OWNER,
      live_verification_endpoint: `/api/v1/agents/${UUID}/onchain`,
      ...idOver,
    },
    payments_x402: { real_settlements: 0, simulated_settlements: 0, last_real_settlement: null, policy: 'p' },
    reputation_onchain: { registry_address: '0x8004B663056A597Dffe9eCcC1965A193B7388713', network: 'base-sepolia', writes: 0, last_write: null },
    zkp: { latest_proof: null, disclosure: 'd', proof_endpoint: '/x', verify_endpoint: '/y' },
  };
  if (oc !== null) p.onchain = oc;
  return p;
};

describe('onChainReadFromPassport: the folded-in read reduces like the second-call body', () => {
  it('OWNER_FOUND with a real non-zero owner', () => {
    expect(onChainReadFromPassport(onchain())).toEqual({ check: 'OWNER_FOUND', owner: OWNER, ownerMatchesRecord: null });
  });
  it.each([
    ['check NOT_CHECKED (chain not reached)', onchain({ check: 'NOT_CHECKED', verified: false, owner: null })],
    ['a check this client does not know', onchain({ check: 'VERIFIED' })],
    ['owner is the zero address', onchain({ owner: '0x' + '0'.repeat(40) })],
    ['owner is not an address', onchain({ owner: 'someone' })],
    ['no owner', onchain({ owner: null })],
    ['not an object', 'OWNER_FOUND'],
    ['null', null],
  ])('%s is NOT_CHECKED', (_label, body) => {
    expect(onChainReadFromPassport(body).check).toBe('NOT_CHECKED');
  });
  it('REVERTED and NO_TOKEN are kept as what the chain/engine said', () => {
    expect(onChainReadFromPassport(onchain({ check: 'REVERTED', verified: false, owner: null })).check).toBe('REVERTED');
    expect(onChainReadFromPassport(onchain({ check: 'NO_TOKEN', verified: false, owner: null })).check).toBe('NO_TOKEN');
  });
});

describe('passportCarriesOnChainRead', () => {
  it('true only for a passport whose `onchain` is the folded-in shape', () => {
    expect(passportCarriesOnChainRead(passport())).toBe(true);
    expect(passportCarriesOnChainRead(passport({ oc: null }))).toBe(false); // older engine
    expect(passportCarriesOnChainRead({ onchain: { check: 'OWNER_FOUND' } })).toBe(false); // no `verified` marker
    expect(passportCarriesOnChainRead(null)).toBe(false);
    expect(passportCarriesOnChainRead('x')).toBe(false);
  });
});

describe('identityFromPassport: the folded-in read confirms a recorded MINTED from ONE call', () => {
  it('VERIFIED_ONCHAIN → MINTED, verified, even with contract_address null (registry judged from onchain.registry)', () => {
    const r = identityFromPassport(passport());
    expect(r.registeredOnchain).toBe('MINTED');
    expect(isVerifiedOnChain(r)).toBe(true);
    expect(r.registry).toEqual({ status: 'CANONICAL', address: REG });
    expect(r.onChain).toEqual({ check: 'OWNER_FOUND', owner: OWNER, ownerMatchesRecord: null });
    expect(r.recordedState).toBeUndefined();
  });

  it('MINTED but the chain was not reached (check NOT_CHECKED) → NOT_CHECKED, never a pass', () => {
    const r = identityFromPassport(passport({ oc: onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED', block: null, verified_at: null }) }));
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.recordedState).toBe('MINTED');
    expect(r.reason).toMatch(/did not confirm/);
    expect(isVerifiedOnChain(r)).toBe(false);
  });

  it('a NON-CANONICAL onchain.registry is NOT verified, even when the engine says verified:true', () => {
    const r = identityFromPassport(passport({ oc: onchain({ registry: NEAR_MISS }) }));
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.recordedState).toBe('MINTED');
    expect(r.reason).toMatch(/not the canonical IdentityRegistry/);
    expect(JSON.stringify(r)).not.toContain(NEAR_MISS); // never echo the engine's string
    expect(isVerifiedOnChain(r)).toBe(false);
  });

  it('REVERTED from the folded-in read → NOT_CHECKED (no such token), never a denial dressed as a pass', () => {
    const r = identityFromPassport(passport({ oc: onchain({ state: 'MINTED', verified: false, owner: null, check: 'REVERTED' }) }));
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.reason).toMatch(/no token with that id exists/);
  });

  it('a non-whole-number token id cannot be verified even with a perfect folded-in read', () => {
    const r = identityFromPassport(passport({ token: '0xabc' }));
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.tokenId).toBeNull();
    expect(r.reason).toMatch(/not a whole number/);
  });

  it('FALLBACK: with no folded-in `onchain`, a recorded MINTED still needs the second-call body (unchanged)', () => {
    const recorded = identityFromPassport(passport({ oc: null, idOver: { contract_address: REG } }));
    expect(recorded.registeredOnchain).toBe('NOT_CHECKED');
    expect(recorded.recordedState).toBe('MINTED');
    expect(recorded.reason).toMatch(/no live ownerOf read was made/);
    // the old second-call body still verifies it
    const confirmed = identityFromPassport(
      passport({ oc: null, idOver: { contract_address: REG } }),
      { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, check: 'OWNER_FOUND' },
    );
    expect(isVerifiedOnChain(confirmed)).toBe(true);
  });
});

describe('TrustShell.getIdentity: ONE call when the passport carries the read, the second call only as fallback', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  let urls: string[] = [];
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const serve = (pp: unknown, oc: unknown = { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, check: 'OWNER_FOUND' }) => {
    urls = [];
    global.fetch = (async (u: string) => {
      const url = String(u);
      urls.push(new URL(url).pathname);
      if (url.includes('/passport/')) return json(200, pp);
      if (url.includes('/onchain')) return json(200, oc);
      if (url.includes('/proof')) return json(404, {});
      return json(200, { score: 1359, tier: 'ESTABLISHED', agent_id: UUID });
    }) as typeof fetch;
  };
  const client = () => new TrustShell({ apiUrl: 'https://engine.test' });

  it('folded-in VERIFIED_ONCHAIN: MINTED, and ONLY the passport is fetched (no /onchain)', async () => {
    serve(passport());
    const id = await client().getIdentity('trinity-sophia');
    expect(isVerifiedOnChain(id)).toBe(true);
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('folded-in but unverified (chain not reached): NOT_CHECKED, and STILL only one call', async () => {
    serve(passport({ oc: onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED' }) }));
    const id = await client().getIdentity('trinity-sophia');
    expect(id.registeredOnchain).toBe('NOT_CHECKED');
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('FALLBACK: no folded-in `onchain` → the second /agents/:id/onchain call is made, as before', async () => {
    serve(passport({ oc: null, idOver: { contract_address: REG } }));
    const id = await client().getIdentity('trinity-sophia');
    expect(isVerifiedOnChain(id)).toBe(true);
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia', `/api/v1/agents/${UUID}/onchain`]);
  });
});

describe('the web display lib reads the folded-in read the same way', () => {
  it('embeddedOnChain extracts the folded-in object, and only that shape', () => {
    expect(embeddedOnChain(passport())).toEqual(onchain());
    expect(embeddedOnChain(passport({ oc: null }))).toBeUndefined();
    expect(embeddedOnChain({ onchain: { check: 'OWNER_FOUND' } })).toBeUndefined();
  });

  it('onChainShownFromPassport reduces to {check, ownerMatchesRecord}', () => {
    expect(onChainShownFromPassport(onchain())).toEqual({ check: 'OWNER_FOUND', ownerMatchesRecord: null });
    expect(onChainShownFromPassport(onchain({ check: 'NOT_CHECKED', owner: null })).check).toBe('NOT_CHECKED');
  });

  it('mintVerdictOf(identity, onchain) is MINTED from the folded-in read, registry from onchain.registry', () => {
    const p = passport();
    const v = mintVerdictOf(p.identity_erc8004, embeddedOnChain(p));
    expect(v.state).toBe('MINTED');
    expect(v.registry).toEqual({ state: 'CANONICAL', address: REG });
    expect(v.onChain).toEqual({ check: 'OWNER_FOUND', ownerMatchesRecord: null });
  });

  it('a non-canonical folded-in registry is NOT verified on the web either', () => {
    const p = passport({ oc: onchain({ registry: NEAR_MISS }) });
    const v = mintVerdictOf(p.identity_erc8004, embeddedOnChain(p));
    expect(v.state).toBe('NOT_CHECKED');
    expect(v.recorded).toBe(true);
  });

  it('the web verdict agrees with the SDK for the folded-in cases', () => {
    for (const oc of [onchain(), onchain({ registry: NEAR_MISS }), onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED' })]) {
      const p = passport({ oc });
      const web = mintVerdictOf(p.identity_erc8004, embeddedOnChain(p));
      const sdk = identityFromPassport(p);
      expect(web.state).toBe(sdk.registeredOnchain);
      expect(web.recorded).toBe(sdk.recordedState === 'MINTED');
    }
  });
});

describe('fetchTwoFields: ONE call when the passport carries the read, the second only as fallback', () => {
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  let paths: string[] = [];
  const serve = (pp: unknown, oc: unknown = { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, check: 'OWNER_FOUND' }) => {
    paths = [];
    return (async (u: string) => {
      const url = new URL(String(u));
      paths.push(url.pathname);
      return json(200, url.pathname.includes('/passport/') ? pp : oc);
    }) as typeof fetch;
  };

  it('folded-in VERIFIED_ONCHAIN: mint MINTED, only the passport fetched', async () => {
    const r = await fetchTwoFields('trinity-sophia', { base: 'https://engine.test', fetchImpl: serve(passport()) });
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'MINTED' } });
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('folded-in but unverified: NOT_CHECKED, still one call', async () => {
    const r = await fetchTwoFields('trinity-sophia', {
      base: 'https://engine.test',
      fetchImpl: serve(passport({ oc: onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED' }) })),
    });
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'NOT_CHECKED', recordedMint: true } });
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('FALLBACK: no folded-in `onchain` → the second /agents/:id/onchain call is made', async () => {
    // Old engine: no folded-in read, so the registry comes from the DB contract_address (canonical here) and the
    // second call confirms ownership.
    const r = await fetchTwoFields('trinity-sophia', { base: 'https://engine.test', fetchImpl: serve(passport({ oc: null, idOver: { contract_address: REG } })) });
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'MINTED' } });
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia', `/api/v1/agents/${UUID}/onchain`]);
  });
});

describe('the extension popup applies the same one rule, from one call', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const agent = require('../extension/agent.js') as {
    checkAgent: (id: unknown, opts?: Record<string, unknown>) => Promise<Record<string, any>>;
    identityOf: (passport: unknown, resolvedId?: string | null, onChainBody?: unknown) => Record<string, any>;
    agentLines: (r: Record<string, any>) => string[];
  };
  const FIXTURE = require('./fixtures/repid-proof-trinity-sophia.json');
  const LIVE = { score: 1334, tier: 'ESTABLISHED', agent_id: UUID };
  const stub = (pp: unknown, oc: unknown) => {
    const seen: string[] = [];
    const impl = async (url: string) => {
      seen.push(String(url).split('?')[0]!);
      const path = String(url).split('?')[0]!;
      const body = path.endsWith('/repid/trinity-sophia') ? LIVE
        : path.endsWith('/proof') ? FIXTURE
        : path.includes('/passport/') ? pp
        : oc;
      return { ok: true, json: async () => body };
    };
    return { impl, seen };
  };

  it('folded-in VERIFIED_ONCHAIN: the popup says on-chain and makes NO /onchain call', async () => {
    const { impl, seen } = stub(passport(), null);
    const r = await agent.checkAgent('trinity-sophia', { fetchImpl: impl, verify: async () => ({ verified: true }) });
    expect(r.identity.state).toBe('MINTED');
    expect(agent.agentLines(r)[1]).toMatch(/on-chain:/);
    expect(seen.some((u) => u.includes('/onchain'))).toBe(false);
  });

  it('identityOf from the folded-in passport EQUALS the SDK identityFromPassport (parity, including onChain)', () => {
    for (const oc of [onchain(), onchain({ registry: NEAR_MISS }), onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED' }), onchain({ check: 'REVERTED', verified: false, owner: null })]) {
      const p = passport({ oc });
      const ext = agent.identityOf(p, null);
      const sdk = identityFromPassport(p);
      expect(ext['state']).toBe(sdk.registeredOnchain);
      expect(ext['tokenId']).toBe(sdk.tokenId);
      expect(ext['recordedState']).toBe(sdk.recordedState);
      expect(ext['registry']).toEqual(sdk.registry);
      expect(ext['onChain']).toEqual(sdk.onChain);
    }
  });
});

describe('the passport page, rendered from ONE call when the read is folded in', () => {
  const prevFetch = global.fetch;
  afterEach(() => { global.fetch = prevFetch; });
  async function render(pp: unknown): Promise<{ html: string; paths: string[] }> {
    const paths: string[] = [];
    global.fetch = (async (u: string) => {
      const url = new URL(String(u), 'https://engine.test');
      paths.push(url.pathname);
      return new Response(JSON.stringify(pp), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let page: ((a: { params: Promise<{ agentId: string }> }) => Promise<unknown>) | undefined;
    let toMarkup: ((el: unknown) => string) | undefined;
    jest.isolateModules(() => {
      toMarkup = (require('react-dom/server') as typeof import('react-dom/server')).renderToStaticMarkup as never;
      page = (require('../app/passport/[agentId]/page') as { default: typeof page }).default;
    });
    const html = toMarkup!(await page!({ params: Promise.resolve({ agentId: 'trinity-sophia' }) }));
    return { html, paths };
  }
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('a folded-in verified mint says Registered on-chain, surfaces verified_at, and makes NO second call', async () => {
    const { html, paths } = await render(passport());
    expect(html).toContain('data-testid="mint-verified"');
    expect(text(html)).toContain('Registered on-chain');
    expect(html).toContain('data-testid="verified-at"');
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']); // no /onchain
    expect(html).toContain(REG);
  });

  it('a folded-in unverified mint (chain not reached) is NOT_CHECKED, not on-chain, still one call', async () => {
    const { html, paths } = await render(passport({ oc: onchain({ state: 'MINTED', verified: false, owner: null, check: 'NOT_CHECKED' }) }));
    expect(text(html)).not.toContain('Registered on-chain');
    expect(html).toContain('data-testid="mint-not-checked"');
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
  });
});
