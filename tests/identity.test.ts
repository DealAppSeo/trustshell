/**
 * The SECOND RepID field, the ERC-8004 ID, as the SDK, the CLI and the MCP tools return it. The score
 * and the ID are two fields; an unreadable passport is NOT_CHECKED, never NOT_MINTED and never "no ID".
 */
import { formatIdentity, identityFromPassport, notCheckedIdentity } from '../src/lib/identity';
import { formatRepid, parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const passport = (registered_onchain: unknown, token_id: unknown) => ({
  reputation: { repid_score: 1359 },
  identity_erc8004: { registered_onchain, token_id },
});

describe('identityFromPassport', () => {
  it('keeps the three states and a plain whole-number token id', () => {
    expect(identityFromPassport(passport('MINTED', '3747'))).toEqual({ registeredOnchain: 'MINTED', tokenId: '3747' });
    expect(identityFromPassport(passport('UNVERIFIED', 3747))).toEqual({ registeredOnchain: 'UNVERIFIED', tokenId: '3747' });
    expect(identityFromPassport(passport('NOT_MINTED', null))).toEqual({ registeredOnchain: 'NOT_MINTED', tokenId: null });
  });

  it('withholds a token id that is not a whole number, and says why', () => {
    for (const bad of ['pending-mint', '0xabc', '-1', '1.5', `0x${'ab'.repeat(32)}`, '007']) {
      const r = identityFromPassport(passport('MINTED', bad));
      expect(r.tokenId).toBeNull();
      expect(r.registeredOnchain).toBe('MINTED');
      expect(r.reason).toMatch(/not a whole number/);
    }
  });

  it('anything unclear is NOT_CHECKED, never NOT_MINTED', () => {
    for (const body of [null, undefined, 'x', 7, {}, { identity_erc8004: null }, passport(true, '1'), passport('minted', '1'), passport(undefined, '1')]) {
      const r = identityFromPassport(body);
      expect(r.registeredOnchain).toBe('NOT_CHECKED');
      expect(r.tokenId).toBeNull();
      expect(r.reason).toBeTruthy();
    }
  });
});

describe('TrustShell.getIdentity', () => {
  const client = new TrustShell({ apiUrl: 'https://engine.test' });

  it('reads the public passport route for that agent', async () => {
    const urls: string[] = [];
    global.fetch = (async (u: string) => {
      urls.push(String(u));
      return json(200, passport('UNVERIFIED', '3747'));
    }) as never;
    expect(await client.getIdentity('trinity-sophia')).toEqual({ registeredOnchain: 'UNVERIFIED', tokenId: '3747' });
    expect(urls).toEqual(['https://engine.test/api/v1/passport/trinity-sophia']);
  });

  it('never throws: 404, 5xx and a dead network are NOT_CHECKED with a reason', async () => {
    global.fetch = (async () => json(404, {})) as never;
    expect((await client.getIdentity('x')).registeredOnchain).toBe('NOT_CHECKED');
    global.fetch = (async () => json(503, {})) as never;
    expect((await client.getIdentity('x')).reason).toMatch(/503/);
    global.fetch = (async () => {
      throw new TypeError('network');
    }) as never;
    expect(await client.getIdentity('x')).toEqual(notCheckedIdentity('the passport lookup did not finish'));
  });

  it('getRepID returns the score and the ID as two separate fields', async () => {
    const c = new TrustShell({ apiUrl: 'https://engine.test' });
    (c as unknown as { verify: unknown }).verify = async () => ({ repid: 1359, tier: 'ESTABLISHED', lastAnchorTx: null, latestProofHash: 'h', minted: null, signer: null, scoreLane: null, reasons: {} });
    global.fetch = (async () => json(200, passport('UNVERIFIED', '3747'))) as never;
    const r = await c.getRepID('trinity-sophia');
    expect(r.repid).toBe(1359);
    expect(r.identity).toEqual({ registeredOnchain: 'UNVERIFIED', tokenId: '3747' });
    // the score field does not carry the id, and the id field does not carry the score
    expect(JSON.stringify(r.identity)).not.toContain('1359');
  });
});

describe('the CLI prints the score and the ID as two lines', () => {
  const cap = () => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
    return { io, out, err };
  };

  it('formatRepid: score line first, ID line second, with the three states in plain words', () => {
    const base = ['sophia', 1359, 'ESTABLISHED'] as const;
    const a = formatRepid(...base, { registeredOnchain: 'UNVERIFIED', tokenId: '3747' }).split('\n');
    expect(a[0]).toBe('sophia');
    expect(a[1]).toBe('  RepID 1359  (ESTABLISHED)');
    expect(a[2]).toMatch(/^  ERC-8004 ID  #3747  \(has a token id; no record of the mint transaction here, which is not the same as not minted\)$/);
    expect(formatRepid(...base, { registeredOnchain: 'MINTED', tokenId: '5' })).toMatch(/ERC-8004 ID {2}#5 {2}\(on-chain\)/);
    expect(formatRepid(...base, { registeredOnchain: 'NOT_MINTED', tokenId: null })).toMatch(/ERC-8004 ID {2}none yet {2}\(off-chain only\)/);
    expect(formatRepid(...base, notCheckedIdentity('the engine has no passport for this agent'))).toMatch(/ERC-8004 ID {2}not checked {2}\(the engine has no passport for this agent\)/);
    expect(formatRepid(...base)).toMatch(/ERC-8004 ID {2}not checked/);
    expect(formatIdentity(undefined)).toBe('  ERC-8004 ID  not checked');
  });

  it('`repid` prints both fields and --json carries identity next to repid', async () => {
    const client = {
      getRepID: async () => ({ agentId: 'sophia', repid: 1359, tier: 'ESTABLISHED', lastAnchorTx: 'NOT_ANCHORED', latestProofHash: null, identity: { registeredOnchain: 'UNVERIFIED', tokenId: '3747' } }),
    } as unknown as TrustShell;
    const h = cap();
    expect(await run({ command: 'repid', operand: 'sophia', json: false, verify: false }, client, h.io)).toBe(EXIT.OK);
    expect(h.out.join('\n')).toMatch(/RepID 1359/);
    expect(h.out.join('\n')).toMatch(/ERC-8004 ID {2}#3747/);
    const j = cap();
    await run(parseArgs(['repid', 'sophia', '--json']), client, j.io);
    const parsed = JSON.parse(j.out.join('\n'));
    expect(parsed.repid).toBe(1359);
    expect(parsed.identity).toEqual({ registeredOnchain: 'UNVERIFIED', tokenId: '3747' });
  });
});
