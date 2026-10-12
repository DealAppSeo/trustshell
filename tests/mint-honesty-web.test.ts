/**
 * E-1 on the web: the passport page and the check-screen two-fields card.
 *
 * Both used to print "Registered on-chain" from the engine's `registered_onchain: 'MINTED'` alone. That word is
 * a RECORD of a mint transaction, not a reading of the chain, and the record behind it is wrong for most squad
 * agents (a placeholder, a transaction hash, another address, a near-miss of the registry in the registry column).
 * Now "Registered on-chain" needs the canonical IdentityRegistry on record AND the engine's live ownership read
 * (GET /api/v1/agents/:id/onchain) finding an owner for exactly this token; otherwise the page shows NOT_CHECKED
 * beside the recorded token id and registry status, and says why.
 *
 * RENDERED, NOT GREPPED: the real async server page is called and its markup rendered, with fetch stubbed.
 */
import { identityFromPassport, IDENTITY_REGISTRY_BASE_SEPOLIA } from '../src/lib/identity';
import { mintVerdictOf, onChainShown, twoFieldsOf, IDENTITY_REGISTRY_BASE_SEPOLIA as WEB_REGISTRY } from '../lib/erc8004-display';
import { fetchTwoFields } from '../lib/passport-client';

const REG = IDENTITY_REGISTRY_BASE_SEPOLIA;
const UUID = 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271';
const OWNER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TX = '0x' + 'ab'.repeat(32);
const NEAR_MISS = REG.slice(0, -1) + 'f';

const identity = (over: Record<string, unknown> = {}, token: unknown = '3747') => ({
  registered_onchain: 'MINTED',
  token_id: token,
  contract_address: REG,
  network: 'base-sepolia',
  mint_tx_hash: TX,
  mint_basescan_url: `https://sepolia.basescan.org/tx/${TX}`,
  minted_at: '2026-09-01T00:00:00Z',
  conservator_address: OWNER,
  live_verification_endpoint: `/api/v1/agents/${UUID}/onchain`,
  ...over,
});
const passport = (over: Record<string, unknown> = {}, token: unknown = '3747') => ({
  passport_version: '1',
  as_of: '2026-10-12T00:00:00Z',
  agent: { agent_id: UUID, agent_name: 'trinity-sophia', display_name: 'Trinity Sophia', created_at: null },
  reputation: { repid_score: 1359, tier: 'ESTABLISHED', activity_30d: 3 },
  identity_erc8004: identity(over, token),
  payments_x402: { real_settlements: 0, simulated_settlements: 0, last_real_settlement: null, policy: 'p' },
  reputation_onchain: { registry_address: '0x8004B663056A597Dffe9eCcC1965A193B7388713', network: 'base-sepolia', writes: 0, last_write: null },
  zkp: { latest_proof: null, disclosure: 'd', proof_endpoint: '/x', verify_endpoint: '/y' },
});
const owned = (over: Record<string, unknown> = {}) => ({ dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND', ...over });

const BAD_REGISTRIES: Array<[string, unknown]> = [
  ['a placeholder (pending-mint:...)', 'pending-mint:trinity-w3c'],
  ['a name spelled in the field', 'trinity-sophia'],
  ['a transaction hash', TX],
  ['a valid but different address (an EOA)', OTHER],
  ['a near-miss of the registry', NEAR_MISS],
  ['one character short', REG.slice(0, -1)],
  ['null', null],
];

describe('mintVerdictOf: MINTED means VERIFIED', () => {
  it('canonical registry AND an owner found for this token', () => {
    const v = mintVerdictOf(identity(), owned());
    expect(v).toMatchObject({ state: 'MINTED', recorded: false, why: null });
    expect(v.registry).toEqual({ state: 'CANONICAL', address: REG });
    expect(v.onChain).toEqual({ check: 'OWNER_FOUND', ownerMatchesRecord: true });
  });

  it.each(BAD_REGISTRIES)('NOT_CHECKED when the registry column holds %s, even with a perfect ownership read', (_label, bad) => {
    const v = mintVerdictOf(identity({ contract_address: bad }), owned());
    expect(v.state).toBe('NOT_CHECKED');
    expect(v.recorded).toBe(true);
    expect(v.why).toMatch(/^the engine records a mint transaction, but /);
    expect(v.registry.state).toBe('NOT_CHECKED');
  });

  it('the word alone is not enough: no ownership read is NOT_CHECKED', () => {
    const v = mintVerdictOf(identity());
    expect(v.state).toBe('NOT_CHECKED');
    expect(v.why).toMatch(/no live ownerOf read was made/);
  });

  it.each([
    ['the read came back empty', null],
    ['the chain was not reached', owned({ check: 'NOT_CHECKED', onChainOwner: null })],
    ['the registry says no such token', owned({ check: 'REVERTED', onChainOwner: null })],
    ['the read was about another token', owned({ dbTokenId: '9' })],
    ['an older engine with no check field', { dbTokenId: '3747', onChainOwner: OWNER }],
    ['the zero address as owner', owned({ onChainOwner: '0x' + '0'.repeat(40) })],
  ])('canonical registry but %s: NOT_CHECKED', (_label, body) => {
    expect(mintVerdictOf(identity(), body).state).toBe('NOT_CHECKED');
  });

  it('UNVERIFIED and NOT_MINTED pass through, with no claim about the chain', () => {
    expect(mintVerdictOf(identity({ registered_onchain: 'UNVERIFIED', contract_address: null })).state).toBe('UNVERIFIED');
    expect(mintVerdictOf(identity({ registered_onchain: 'NOT_MINTED' }, null)).state).toBe('NOT_MINTED');
    expect(mintVerdictOf(null).state).toBe('NOT_CHECKED');
  });

  it('twoFieldsOf carries it: mint is MINTED only when verified, and a recorded mint says so', () => {
    expect(twoFieldsOf(passport(), owned()).mint).toBe('MINTED');
    const f = twoFieldsOf(passport({ contract_address: NEAR_MISS }), owned());
    expect(f.mint).toBe('NOT_CHECKED');
    expect(f.recordedMint).toBe(true);
    expect(f.why).toMatch(/the engine records a mint transaction/);
    expect(f.token).toEqual({ state: 'ID', id: '3747' }); // the recorded token id stays, beside the NOT_CHECKED
    // non-MINTED passports keep their exact old shape (no extra keys)
    expect(twoFieldsOf(passport({ registered_onchain: 'UNVERIFIED' }))).toEqual({ score: 1359, tier: 'ESTABLISHED', mint: 'UNVERIFIED', token: { state: 'ID', id: '3747' } });
  });
});

describe('ONE rule: the web verdict agrees with the SDK (and so with the CLI, the MCP tool and the popup)', () => {
  const CASES: Array<[string, Record<string, unknown>, unknown]> = [
    ['verified', {}, owned()],
    ['no read', {}, undefined],
    ['read empty', {}, null],
    ['reverted', {}, owned({ check: 'REVERTED', onChainOwner: null })],
    ['other token', {}, owned({ dbTokenId: '9' })],
    ['owner differs', {}, owned({ onChainOwner: OTHER, drift: true })],
    ...BAD_REGISTRIES.map(([l, v]) => [`registry ${l}`, { contract_address: v }, owned()] as [string, Record<string, unknown>, unknown]),
    ['UNVERIFIED', { registered_onchain: 'UNVERIFIED', contract_address: null }, undefined],
    ['NOT_MINTED', { registered_onchain: 'NOT_MINTED' }, undefined],
  ];

  it.each(CASES)('%s', (_label, over, onchain) => {
    const web = mintVerdictOf(identity(over), onchain);
    const sdk = identityFromPassport(passport(over), onchain);
    expect(web.state).toBe(sdk.registeredOnchain);
    expect(web.recorded).toBe(sdk.recordedState === 'MINTED');
  });

  it('the ownership read reduces identically', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('../src/lib/identity') as typeof import('../src/lib/identity');
    for (const body of [owned(), null, 'x', owned({ check: 'REVERTED' }), owned({ dbTokenId: 3747 }), owned({ dbTokenId: 3747.5 }), owned({ onChainOwner: OTHER })]) {
      for (const tok of ['3747', null]) {
        const a = onChainShown(body, tok);
        const b = sdk.onChainReadFrom(body, tok);
        expect(a.check).toBe(b.check);
        expect(a.ownerMatchesRecord).toBe(b.ownerMatchesRecord);
      }
    }
  });

  it('the canonical registry is one constant', () => {
    expect(WEB_REGISTRY).toBe(REG);
  });
});

describe('fetchTwoFields: asks the engine for its live ownership read, only for a MINTED record', () => {
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  let paths: string[] = [];
  const serve = (pp: unknown, onchain: unknown | 'down' = owned()) => {
    paths = [];
    return (async (u: string) => {
      const url = new URL(String(u));
      paths.push(url.pathname);
      if (url.pathname.includes('/passport/')) return json(200, pp);
      return onchain === 'down' ? json(500, {}) : json(200, onchain);
    }) as typeof fetch;
  };
  const run = (pp: unknown, onchain?: unknown | 'down') => fetchTwoFields('trinity-sophia', { base: 'https://engine.test', fetchImpl: serve(pp, onchain) });

  it('a verified mint', async () => {
    const r = await run(passport());
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'MINTED' } });
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia', `/api/v1/agents/${UUID}/onchain`]);
  });

  it.each(BAD_REGISTRIES)('NOT_CHECKED when the registry column holds %s', async (_label, bad) => {
    const r = await run(passport({ contract_address: bad }));
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'NOT_CHECKED', recordedMint: true } });
  });

  it('a live read that is down leaves the ID NOT_CHECKED: never confirmed, never denied', async () => {
    const r = await run(passport(), 'down');
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'NOT_CHECKED', recordedMint: true } });
  });

  it('a network error on the live read leaves the ID NOT_CHECKED and does not throw', async () => {
    const base = serve(passport());
    const f = (async (u: string) => {
      if (String(u).includes('/onchain')) throw new TypeError('blocked by CORS');
      return base(u);
    }) as typeof fetch;
    expect(await fetchTwoFields('trinity-sophia', { base: 'https://engine.test', fetchImpl: f })).toMatchObject({ state: 'READ', fields: { mint: 'NOT_CHECKED' } });
  });

  it('UNVERIFIED and NOT_MINTED make no live read', async () => {
    await run(passport({ registered_onchain: 'UNVERIFIED', contract_address: null }));
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
    await run(passport({ registered_onchain: 'NOT_MINTED' }, null));
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('an agent id in the passport that is not a plain id never reaches a URL', async () => {
    const r = await run({ ...passport(), agent: { agent_id: '../agents/x' } });
    expect(r).toMatchObject({ state: 'READ', fields: { mint: 'NOT_CHECKED' } });
    expect(paths).toEqual(['/api/v1/passport/trinity-sophia']);
  });
});

describe('the passport page, rendered', () => {
  const prevFetch = global.fetch;
  afterEach(() => {
    global.fetch = prevFetch;
  });

  async function render(pp: unknown, onchain: unknown | 'down' = owned()): Promise<{ html: string; paths: string[] }> {
    const paths: string[] = [];
    global.fetch = (async (u: string) => {
      // REPID_ENGINE_URL is empty in a test run, so the page's URLs are relative: give them a base.
      const url = new URL(String(u), 'https://engine.test');
      paths.push(url.pathname);
      const body = url.pathname.includes('/passport/') ? pp : onchain === 'down' ? {} : onchain;
      const status = url.pathname.includes('/onchain') && onchain === 'down' ? 500 : 200;
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let html = '';
    let page: ((a: { params: Promise<{ agentId: string }> }) => Promise<unknown>) | undefined;
    let toMarkup: ((el: unknown) => string) | undefined;
    jest.isolateModules(() => {
      toMarkup = (require('react-dom/server') as typeof import('react-dom/server')).renderToStaticMarkup as never;
      page = (require('../app/passport/[agentId]/page') as { default: typeof page }).default;
    });
    html = toMarkup!(await page!({ params: Promise.resolve({ agentId: 'trinity-sophia' }) }));
    return { html, paths };
  }
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  it('a verified mint says Registered on-chain, and says what verified it', async () => {
    const { html, paths } = await render(passport());
    expect(html).toContain('data-testid="mint-verified"');
    expect(text(html)).toContain('Registered on-chain');
    expect(text(html)).toMatch(/live ownerOf\(\) read found an owner for this token/);
    expect(paths).toContain(`/api/v1/agents/${UUID}/onchain`);
    expect(html).toContain(REG);
  });

  it.each(BAD_REGISTRIES)('NEVER says Registered on-chain when the registry column holds %s', async (_label, bad) => {
    const { html } = await render(passport({ contract_address: bad }));
    expect(text(html)).not.toContain('Registered on-chain');
    expect(html).not.toContain('data-testid="mint-verified"');
    expect(html).toContain('data-testid="mint-not-checked"');
    expect(text(html)).toMatch(/Not checked: the engine records a mint transaction, but /);
    expect(text(html)).toMatch(/Recorded, not verified/);
    expect(text(html)).toMatch(/Token ID \(recorded\)/);
    // the engine's raw registry string is never printed
    expect(html).not.toContain(NEAR_MISS);
    expect(html).not.toContain('trinity-w3c');
  });

  it('a canonical registry but a live read that is down is NOT_CHECKED, not on-chain', async () => {
    const { html } = await render(passport(), 'down');
    expect(text(html)).not.toContain('Registered on-chain');
    expect(html).toContain('data-testid="mint-not-checked"');
  });

  it('UNVERIFIED and NOT_MINTED render as before and make no live read', async () => {
    const u = await render(passport({ registered_onchain: 'UNVERIFIED', contract_address: null }));
    expect(text(u.html)).toMatch(/a token id exists; this service has no record of the mint transaction/);
    expect(u.paths.some((p) => p.includes('/onchain'))).toBe(false);
    const n = await render(passport({ registered_onchain: 'NOT_MINTED' }, null));
    expect(text(n.html)).toMatch(/Off-chain only/);
    expect(n.paths.some((p) => p.includes('/onchain'))).toBe(false);
  });
});
