/**
 * E-1 (red-team ledger): MINT-STATUS HONESTY, on the SDK, the CLI and the MCP tool.
 *
 * THE DEFECT. The engine's `registered_onchain: 'MINTED'` is BOOKKEEPING: "we hold a mint transaction for this
 * agent". It is not a reading of the chain, and the record behind it is wrong for most squad agents: the registry
 * column holds a placeholder, a transaction-hash-shaped value, a name, a valid but different address, or a
 * near-miss of the real registry. Engine #1322 and web #518 stopped the raw string from printing. But the STATUS
 * WORD was still asserted from that same record: `trustshell repid`, the MCP `get_repid` result and the SDK all
 * said "on-chain" / MINTED / `minted: true` from the word alone, never from a read of the registry.
 *
 * THE RULE. MINTED, "on-chain" and `minted: true` need BOTH: the recorded registry is the canonical
 * IdentityRegistry, AND the engine's live ownership read (GET /api/v1/agents/:id/onchain) found an owner for
 * exactly this token. Otherwise the engine's MINTED is NOT_CHECKED, carried with `recordedState: 'MINTED'` so
 * nothing the engine said is lost. This client consumes the engine's read; it does not read the chain.
 * UNVERIFIED and NOT_MINTED make no claim about the chain and are unchanged.
 */
import { formatIdentity, identityFromPassport, isVerifiedOnChain, onChainReadFrom, registryReading, IDENTITY_REGISTRY_BASE_SEPOLIA } from '../src/lib/identity';
import { repidHonesty } from '../src/lib/honest-contract';
import { formatRepid, run, parseArgs, EXIT, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';
import { createServer } from '../src/mcp/index';

const REG = IDENTITY_REGISTRY_BASE_SEPOLIA;
const UUID = 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271';
const OWNER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TX = '0x' + 'ab'.repeat(32);
// The squad's real record shapes [MEASURED 2026-10-12 against production, see the E-1 row]: what sits in the registry column.
const NEAR_MISS = REG.slice(0, -1) + (REG.endsWith('e') ? 'f' : 'e');
const ONE_SHORT = REG.slice(0, -1);

const passport = (over: Record<string, unknown> = {}, token: unknown = '3747') => ({
  agent: { agent_id: UUID },
  reputation: { repid_score: 1359, tier: 'ESTABLISHED' },
  identity_erc8004: {
    registered_onchain: 'MINTED',
    token_id: token,
    contract_address: REG,
    mint_tx_hash: TX,
    conservator_address: OWNER,
    live_verification_endpoint: `/api/v1/agents/${UUID}/onchain`,
    ...over,
  },
});
const owned = (over: Record<string, unknown> = {}) => ({ dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND', ...over });

const BAD_REGISTRIES: Array<[string, unknown]> = [
  ['a placeholder (external:...)', 'external:trinity-sophia'],
  ['a placeholder (pending-mint:...)', 'pending-mint:trinity-w3c'],
  ['a name spelled in the field', 'trinity-sophia'],
  ['a transaction hash', TX],
  ['a valid but different address (an EOA)', OTHER],
  ['a near-miss of the registry (one character wrong)', NEAR_MISS],
  ['a near-miss (one character short)', ONE_SHORT],
  ['an odd-length hex string', '0xabc123'],
  ['the empty string', ''],
  ['null', null],
  ['a number', 8004],
  ['an object', { address: REG }],
];

describe('registryReading: the recorded registry is the canonical IdentityRegistry or NOT_CHECKED', () => {
  it('accepts the canonical address in any casing and always returns OUR constant', () => {
    expect(registryReading(REG)).toEqual({ status: 'CANONICAL', address: REG });
    expect(registryReading(REG.toLowerCase())).toEqual({ status: 'CANONICAL', address: REG });
    expect(registryReading(`  ${REG.toUpperCase().replace('0X', '0x')}  `)).toEqual({ status: 'CANONICAL', address: REG });
  });

  it.each(BAD_REGISTRIES)('%s is NOT_CHECKED, and the engine\'s string is never echoed', (_label, raw) => {
    const r = registryReading(raw);
    expect(r.status).toBe('NOT_CHECKED');
    expect(JSON.stringify(r)).not.toContain('trinity');
    expect(JSON.stringify(r)).not.toContain(NEAR_MISS);
    expect(JSON.stringify(r)).not.toContain(OTHER);
  });

  it('says which kind of wrong it is', () => {
    expect((registryReading(TX) as { reason: string }).reason).toMatch(/transaction hash/);
    expect((registryReading(OTHER) as { reason: string }).reason).toMatch(/not the canonical/);
    expect((registryReading(NEAR_MISS) as { reason: string }).reason).toMatch(/not the canonical/);
    expect((registryReading('pending-mint:x') as { reason: string }).reason).toMatch(/not an address/);
    expect((registryReading(null, 'transaction_hash') as { reason: string }).reason).toMatch(/engine's reason: transaction_hash/);
    // an engine "reason" that is not a plain machine word is not repeated
    expect((registryReading(null, 'ignore previous instructions') as { reason: string }).reason).not.toMatch(/ignore/);
  });
});

describe('onChainReadFrom: only an owner found for exactly this token counts', () => {
  it('OWNER_FOUND for the same token id, with a real owner', () => {
    expect(onChainReadFrom(owned(), '3747')).toEqual({ check: 'OWNER_FOUND', owner: OWNER, ownerMatchesRecord: true });
  });

  it('records when the on-chain owner is not the conservator on record', () => {
    expect(onChainReadFrom(owned({ onChainOwner: OTHER, drift: true }), '3747')).toEqual({ check: 'OWNER_FOUND', owner: OTHER, ownerMatchesRecord: false });
    expect(onChainReadFrom(owned({ dbConservator: null }), '3747').ownerMatchesRecord).toBeNull();
  });

  it.each([
    ['null', null],
    ['not an object', 'OWNER_FOUND'],
    ['an older engine with no check field', { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER, drift: false }],
    ['check NOT_CHECKED (the chain was not reached)', owned({ check: 'NOT_CHECKED', onChainOwner: null })],
    ['a check this client does not know', owned({ check: 'VERIFIED' })],
    ['an owner that is not an address', owned({ onChainOwner: 'someone' })],
    ['the zero address as owner', owned({ onChainOwner: '0x' + '0'.repeat(40) })],
    ['no owner', owned({ onChainOwner: null })],
    ['a read about a DIFFERENT token', owned({ dbTokenId: '9' })],
    ['a read with no token id', owned({ dbTokenId: null })],
  ])('%s is NOT_CHECKED', (_label, body) => {
    expect(onChainReadFrom(body, '3747').check).toBe('NOT_CHECKED');
  });

  it('REVERTED and NO_TOKEN are kept as what the chain/engine said, never as confirmation', () => {
    expect(onChainReadFrom(owned({ check: 'REVERTED', onChainOwner: null }), '3747').check).toBe('REVERTED');
    expect(onChainReadFrom(owned({ check: 'NO_TOKEN' }), '3747').check).toBe('NO_TOKEN');
  });

  it('with no token id to compare against, nothing is confirmed', () => {
    expect(onChainReadFrom(owned(), null).check).toBe('NOT_CHECKED');
  });
});

describe('identityFromPassport: MINTED is the engine\'s RECORD; it becomes MINTED here only with evidence', () => {
  it.each(BAD_REGISTRIES)('a record whose registry is %s is NOT_CHECKED even with a perfect ownership read', (_label, raw) => {
    const r = identityFromPassport(passport({ contract_address: raw }), owned());
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.recordedState).toBe('MINTED');
    expect(r.tokenId).toBe('3747'); // the recorded token id is kept, beside the NOT_CHECKED
    expect(r.reason).toMatch(/the engine records a mint transaction, but the (recorded registry|engine sent no registry)/);
    expect(isVerifiedOnChain(r)).toBe(false);
  });

  it('the word alone is not enough: a MINTED record with the canonical registry and NO ownership read is NOT_CHECKED', () => {
    const r = identityFromPassport(passport());
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.recordedState).toBe('MINTED');
    expect(r.reason).toMatch(/no live ownerOf read was made/);
    expect(r.registry).toEqual({ status: 'CANONICAL', address: REG });
    expect(r.onChain).toBeUndefined();
  });

  it.each([
    ['the read did not reach the chain', owned({ check: 'NOT_CHECKED', onChainOwner: null }), /did not confirm/],
    ['the read came back empty', null, /did not confirm/],
    ['the registry says no such token', owned({ check: 'REVERTED', onChainOwner: null }), /no token with that id exists/],
    ['the engine had no token to read', owned({ check: 'NO_TOKEN' }), /no token id to read/],
    ['the read was about another token', owned({ dbTokenId: '5' }), /did not confirm/],
    ['an older engine with no check field', { dbTokenId: '3747', onChainOwner: OWNER, dbConservator: OWNER }, /did not confirm/],
  ])('canonical registry but %s: NOT_CHECKED', (_label, onchain, why) => {
    const r = identityFromPassport(passport(), onchain);
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.recordedState).toBe('MINTED');
    expect(r.reason).toMatch(why);
  });

  it('canonical registry AND an owner found for this token: MINTED, with the evidence attached', () => {
    const r = identityFromPassport(passport(), owned());
    expect(r).toEqual({
      registeredOnchain: 'MINTED',
      tokenId: '3747',
      registry: { status: 'CANONICAL', address: REG },
      onChain: { check: 'OWNER_FOUND', owner: OWNER, ownerMatchesRecord: true },
    });
    expect(isVerifiedOnChain(r)).toBe(true);
    expect(r.recordedState).toBeUndefined();
  });

  it('a token id that is not a whole number cannot be verified', () => {
    const r = identityFromPassport(passport({}, '0xabc'), owned({ dbTokenId: '0xabc' }));
    expect(r.registeredOnchain).toBe('NOT_CHECKED');
    expect(r.tokenId).toBeNull();
    expect(r.reason).toMatch(/not a whole number/);
  });

  it('UNVERIFIED and NOT_MINTED make no claim about the chain and are unchanged', () => {
    expect(identityFromPassport(passport({ registered_onchain: 'UNVERIFIED', contract_address: null }))).toEqual({ registeredOnchain: 'UNVERIFIED', tokenId: '3747' });
    expect(identityFromPassport(passport({ registered_onchain: 'NOT_MINTED' }, null))).toEqual({ registeredOnchain: 'NOT_MINTED', tokenId: null });
  });

  it('isVerifiedOnChain does not trust the word: a hand-built MINTED with no evidence is not verified', () => {
    expect(isVerifiedOnChain({ registeredOnchain: 'MINTED', tokenId: '5' })).toBe(false);
    expect(isVerifiedOnChain({ registeredOnchain: 'MINTED', tokenId: '5', registry: { status: 'CANONICAL', address: REG } })).toBe(false);
    expect(isVerifiedOnChain({ registeredOnchain: 'MINTED', tokenId: '5', onChain: { check: 'OWNER_FOUND', owner: OWNER, ownerMatchesRecord: true } })).toBe(false);
    expect(isVerifiedOnChain(undefined)).toBe(false);
  });
});

describe('what the CLI prints', () => {
  const base = ['sophia', 1359, 'ESTABLISHED'] as const;
  const verified = identityFromPassport(passport(), owned());
  const printed = (bad: unknown) => formatRepid(...base, identityFromPassport(passport({ contract_address: bad }), owned()));

  it('says on-chain for a verified mint, and names why', () => {
    const line = formatRepid(...base, verified).split('\n')[2]!;
    expect(line).toMatch(/^ {2}ERC-8004 ID {2}#3747 {2}\(on-chain: the engine's ownerOf read found an owner for this token, and the recorded registry is the canonical IdentityRegistry 0x8004A818BFB912233c491871b3d84c89A494BD9e\)$/);
  });

  it('says the owner differs when it does', () => {
    const drift = identityFromPassport(passport(), owned({ onChainOwner: OTHER, drift: true }));
    expect(formatRepid(...base, drift)).toMatch(/on-chain: .*the on-chain owner is NOT the conservator the engine has on record/);
  });

  it.each(BAD_REGISTRIES)('NEVER says on-chain for a record whose registry is %s', (_label, bad) => {
    const out = printed(bad);
    expect(out).toMatch(/ERC-8004 ID {2}#3747 {2}\(NOT_CHECKED: the engine records a mint transaction, but /);
    expect(out).not.toMatch(/\(on-chain/);
    expect(out).toMatch(/Recorded, not verified/);
  });

  it('a MINTED record with no ownership read says NOT_CHECKED too', () => {
    expect(formatRepid(...base, identityFromPassport(passport()))).toMatch(/NOT_CHECKED: .*no live ownerOf read was made/);
  });

  it('a hand-built MINTED object with no evidence is NOT printed as on-chain', () => {
    const out = formatRepid(...base, { registeredOnchain: 'MINTED', tokenId: '5' });
    expect(out).not.toMatch(/\(on-chain/);
    expect(out).toMatch(/NOT_CHECKED/);
    expect(formatIdentity({ registeredOnchain: 'MINTED', tokenId: '5' })).toMatch(/NOT_CHECKED: recorded as minted/);
  });

  it('the other states read as before', () => {
    expect(formatRepid(...base, { registeredOnchain: 'UNVERIFIED', tokenId: '3747' })).toMatch(/#3747 {2}\(has a token id; no record of the mint transaction here/);
    expect(formatRepid(...base, { registeredOnchain: 'NOT_MINTED', tokenId: null })).toMatch(/none yet {2}\(off-chain only\)/);
  });
});

describe('minted: true needs a verified read', () => {
  it('repidHonesty never says true from a record: not for a near-miss, a hex stub, or the engine\'s own boolean', () => {
    for (const addr of [NEAR_MISS, OTHER, TX, '0xabc123', REG]) {
      const h = repidHonesty({ erc8004_address: addr, erc8004_token_id: '6705' });
      expect(h.minted).toBeNull();
      expect(h.reasons.minted).toMatch(/not a reading of the chain/);
    }
    const fromBool = repidHonesty({ minted: true });
    expect(fromBool.minted).toBeNull();
    expect(fromBool.reasons.minted).toMatch(/not a reading of the chain/);
  });

  it('a record that says "not a mint" is still false', () => {
    expect(repidHonesty({ erc8004_address: 'external:foo' }).minted).toBe(false);
    expect(repidHonesty({ erc8004_address: 'pending-mint:x', erc8004_token_id: '1' }).minted).toBe(false);
    expect(repidHonesty({ erc8004_address: REG }).minted).toBe(false); // no token id
    expect(repidHonesty({ minted: false }).minted).toBe(false);
  });
});

describe('TrustShell.getIdentity / getRepID, end to end with fetch stubbed', () => {
  const realFetch = global.fetch;
  let urls: string[] = [];
  afterEach(() => {
    global.fetch = realFetch;
  });
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const serve = (pp: unknown, onchain: unknown | 'down' = owned(), repid: Record<string, unknown> = { score: 1359, tier: 'ESTABLISHED', minted: true, registered_onchain: 'MINTED', agent_id: UUID }) => {
    urls = [];
    global.fetch = (async (u: string) => {
      const url = String(u);
      urls.push(new URL(url).pathname);
      if (url.includes('/passport/')) return json(200, pp);
      if (url.includes('/onchain')) return onchain === 'down' ? json(500, { error: 'rpc' }) : json(200, onchain);
      if (url.includes('/proof')) return json(404, {});
      return json(200, repid);
    }) as typeof fetch;
  };
  const client = () => new TrustShell({ apiUrl: 'https://engine.test' });

  it('a verified mint: the passport, then the live read keyed by the agent\'s UUID from the passport', async () => {
    serve(passport());
    const id = await client().getIdentity('trinity-sophia');
    expect(id.registeredOnchain).toBe('MINTED');
    expect(isVerifiedOnChain(id)).toBe(true);
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia', `/api/v1/agents/${UUID}/onchain`]);
  });

  it.each(BAD_REGISTRIES)('a record whose registry is %s: NOT_CHECKED, even though the chain read succeeded', async (_label, bad) => {
    serve(passport({ contract_address: bad }));
    const id = await client().getIdentity('trinity-sophia');
    expect(id.registeredOnchain).toBe('NOT_CHECKED');
    expect(id.recordedState).toBe('MINTED');
  });

  it('the live read being down is NOT_CHECKED, never a denial and never a confirmation', async () => {
    serve(passport(), 'down');
    const id = await client().getIdentity('trinity-sophia');
    expect(id.registeredOnchain).toBe('NOT_CHECKED');
    expect(id.reason).toMatch(/did not confirm/);
  });

  it('an unreachable live read (network error) is NOT_CHECKED and does not throw', async () => {
    serve(passport());
    const base = global.fetch;
    global.fetch = (async (u: string) => {
      if (String(u).includes('/onchain')) throw new TypeError('network');
      return base(u);
    }) as typeof fetch;
    expect((await client().getIdentity('trinity-sophia')).registeredOnchain).toBe('NOT_CHECKED');
  });

  it('UNVERIFIED and NOT_MINTED make no live read at all', async () => {
    serve(passport({ registered_onchain: 'UNVERIFIED', contract_address: null }));
    await client().getIdentity('trinity-sophia');
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia']);
    serve(passport({ registered_onchain: 'NOT_MINTED' }, null));
    await client().getIdentity('trinity-sophia');
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('an agent id in the passport that is not a plain id never reaches a URL', async () => {
    serve({ ...passport(), agent: { agent_id: '../agents/x/export' } });
    const id = await client().getIdentity('trinity-sophia');
    expect(id.registeredOnchain).toBe('NOT_CHECKED');
    expect(urls).toEqual(['/api/v1/passport/trinity-sophia']);
  });

  it('getRepID: minted is true ONLY with a verified read, and the two fields cannot disagree', async () => {
    serve(passport());
    const ok = await client().getRepID('trinity-sophia');
    expect(ok.identity?.registeredOnchain).toBe('MINTED');
    expect(ok.minted).toBe(true);
    expect(ok.reasons['minted']).toBeUndefined();

    serve(passport({ contract_address: NEAR_MISS }));
    const bad = await client().getRepID('trinity-sophia');
    expect(bad.identity?.registeredOnchain).toBe('NOT_CHECKED');
    expect(bad.minted).toBeNull(); // the engine's /repid said minted:true; that is a record, not a reading
    expect(bad.reasons['minted']).toMatch(/not a reading of the chain|no live ownership read/);
  });

  it('`trustshell repid` on a placeholder/near-miss/tx-hash record prints NOT_CHECKED, and --json says so', async () => {
    for (const bad of [TX, NEAR_MISS, 'pending-mint:trinity-w3c', OTHER]) {
      serve(passport({ contract_address: bad }));
      const out: string[] = [];
      const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
      expect(await run(parseArgs(['repid', 'trinity-sophia']), client(), io)).toBe(EXIT.OK);
      expect(out.join('\n')).toMatch(/ERC-8004 ID {2}#3747 {2}\(NOT_CHECKED: /);
      expect(out.join('\n')).not.toMatch(/\(on-chain/);

      const j: string[] = [];
      await run(parseArgs(['repid', 'trinity-sophia', '--json']), client(), { out: (s) => j.push(s), err: () => undefined });
      const parsed = JSON.parse(j.join('\n'));
      expect(parsed.identity.registeredOnchain).toBe('NOT_CHECKED');
      expect(parsed.identity.recordedState).toBe('MINTED');
      expect(parsed.minted).toBeNull();
    }
  });

  it('the MCP get_repid result carries NOT_CHECKED for the same records, and MINTED only when verified', async () => {
    const tool = () => (createServer(client()) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }> }> })._registeredTools['get_repid']!;
    for (const bad of [TX, NEAR_MISS, 'pending-mint:trinity-w3c']) {
      serve(passport({ contract_address: bad }));
      const res = await tool().handler({ agentId: 'trinity-sophia' });
      const body = JSON.parse(res.content[0]!.text).untrusted_data;
      expect(body.identity.registeredOnchain).toBe('NOT_CHECKED');
      expect(body.minted).toBeNull();
    }
    serve(passport());
    const good = JSON.parse((await tool().handler({ agentId: 'trinity-sophia' })).content[0]!.text).untrusted_data;
    expect(good.identity.registeredOnchain).toBe('MINTED');
    expect(good.minted).toBe(true);
  });
});
