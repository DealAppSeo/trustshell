/**
 * The faucet screen POINTS at a public Base Sepolia faucet and READS the balance back. It never
 * dispenses. A balance that could not be read is NOT_CHECKED, never 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BALANCE_NOT_CHECKED_WHY, fetchFaucetBalance, parseFaucetBalance, safeFaucetLinks } from '../lib/faucet';

const ROOT = join(__dirname, '..');
const ADDR = '0x1111111111111111111111111111111111111111';

const body = (over: Record<string, unknown> = {}) => ({
  address: ADDR,
  chain_id: 84532,
  network: 'Base Sepolia',
  eth_balance: '0.002',
  usdc_balance: '25.0',
  staking_min_eth: '0.0001',
  staking_suggested_eth: '0.001',
  enough_to_stake: true,
  enough_for_gas: true,
  next_step: 'You have enough to stake.',
  ...over,
});
const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('safeFaucetLinks', () => {
  const ok = { name: 'Coinbase Base Sepolia Faucet', url: 'https://www.coinbase.com/faucets/base-sepolia', assets: ['ETH', 'USDC'], note: 'Free.' };
  it('keeps https links with a real host', () => {
    expect(safeFaucetLinks({ faucets: [ok] })).toEqual([
      { name: ok.name, url: 'https://www.coinbase.com/faucets/base-sepolia', assets: ['ETH', 'USDC'], note: 'Free.' },
    ]);
  });
  it('drops anything that is not a safe https link', () => {
    const bad = [
      { ...ok, url: 'javascript:alert(1)' },
      { ...ok, url: 'http://faucet.example.com' },
      { ...ok, url: 'https://user:pw@faucet.example.com' },
      { ...ok, url: 'https://localhost/x' },
      { ...ok, url: 'not a url' },
      { name: 5, url: 'https://a.example.com', assets: [] },
      null,
    ] as never[];
    expect(safeFaucetLinks({ faucets: bad })).toEqual([]);
    expect(safeFaucetLinks(null)).toEqual([]);
    expect(safeFaucetLinks({ faucets: 'x' as never })).toEqual([]);
  });
});

describe('parseFaucetBalance', () => {
  it('reads the engine\'s answer as strings, never as a bare number it invented', () => {
    expect(parseFaucetBalance(body(), ADDR)).toEqual({
      state: 'READ',
      address: ADDR,
      eth: '0.002',
      usdc: '25.0',
      enoughToStake: true,
      enoughForGas: true,
      minEth: '0.0001',
      nextStep: 'You have enough to stake.',
    });
  });
  it.each([
    ['another network', body({ chain_id: 1 }), 'wrong_network'],
    ['no chain id', body({ chain_id: undefined }), 'wrong_network'],
    ['a balance that is not a number', body({ eth_balance: 'lots' }), 'bad_response'],
    ['a negative balance', body({ usdc_balance: '-1' }), 'bad_response'],
    ['a missing balance', body({ usdc_balance: undefined }), 'bad_response'],
    ['a verdict that is not a boolean', body({ enough_to_stake: 'yes' }), 'bad_response'],
    ['an answer about someone else', body({ address: '0x2222222222222222222222222222222222222222' }), 'bad_response'],
    ['not an object', 'ok', 'bad_response'],
    ['null', null, 'bad_response'],
  ])('is NOT_CHECKED for %s', (_n, b, reason) => {
    expect(parseFaucetBalance(b, ADDR)).toEqual({ state: 'NOT_CHECKED', reason });
  });
  it('matches the address case-insensitively', () => {
    expect(parseFaucetBalance(body({ address: ADDR.toUpperCase().replace('0X', '0x') }), ADDR).state).toBe('READ');
  });
});

describe('fetchFaucetBalance', () => {
  it('does not call the network for something that is not an address', async () => {
    const f = jest.fn();
    for (const a of ['', 'abc', '0x123', `${ADDR}00`, 'vitalik.eth']) {
      expect(await fetchFaucetBalance(a, { base: 'https://e.test', fetchImpl: f as never })).toEqual({ state: 'NOT_CHECKED', reason: 'bad_address' });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('asks the engine\'s balance route for exactly that address', async () => {
    const urls: string[] = [];
    const r = await fetchFaucetBalance(` ${ADDR} `, {
      base: 'https://e.test/',
      fetchImpl: (async (u: string) => {
        urls.push(String(u));
        return json(200, body());
      }) as never,
    });
    expect(urls).toEqual([`https://e.test/api/v1/faucet/balance?address=${ADDR}`]);
    expect(r.state).toBe('READ');
  });
  it('an unreachable engine is NOT_CHECKED, never a balance of zero', async () => {
    const r = await fetchFaucetBalance(ADDR, { base: 'https://e.test', fetchImpl: (async () => { throw new TypeError('network'); }) as never });
    expect(r).toEqual({ state: 'NOT_CHECKED', reason: 'unreachable' });
    expect(JSON.stringify(r)).not.toMatch(/"eth"|"usdc"/);
  });
  it('maps the engine\'s refusals and bad bodies without inventing a balance', async () => {
    const mk = (res: () => Response | Promise<Response>) => fetchFaucetBalance(ADDR, { base: 'https://e.test', fetchImpl: (async () => res()) as never });
    expect(await mk(() => json(400, { error: 'INVALID_ADDRESS' }))).toEqual({ state: 'NOT_CHECKED', reason: 'rejected' });
    expect(await mk(() => json(503, { error: 'down' }))).toEqual({ state: 'NOT_CHECKED', reason: 'unreachable' });
    expect(await mk(() => new Response('<html>', { status: 200 }))).toEqual({ state: 'NOT_CHECKED', reason: 'bad_response' });
    expect(await mk(() => json(200, { hello: 1 }))).toEqual({ state: 'NOT_CHECKED', reason: 'wrong_network' });
  });
  it('is NOT_CHECKED with no engine configured', async () => {
    expect(await fetchFaucetBalance(ADDR, { base: '' })).toEqual({ state: 'NOT_CHECKED', reason: 'no_engine' });
  });
  it('has a plain sentence for every NOT_CHECKED reason', () => {
    for (const reason of ['bad_address', 'no_engine', 'unreachable', 'rejected', 'bad_response', 'wrong_network'] as const) {
      expect(BALANCE_NOT_CHECKED_WHY[reason].length).toBeGreaterThan(20);
    }
  });
});

describe('the faucet screen does not dispense', () => {
  const panel = readFileSync(join(ROOT, 'components/faucet-panel.tsx'), 'utf8');
  const lib = readFileSync(join(ROOT, 'lib/faucet.ts'), 'utf8');
  const page = readFileSync(join(ROOT, 'app/faucet/page.tsx'), 'utf8');
  const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('says so before it lists anything, and says the faucets are third-party', () => {
    expect(panel).toContain('We do not hand out tokens');
    expect(panel).toContain('TrustShell does not send you test tokens and never will');
    expect(panel.indexOf('We do not hand out tokens')).toBeLessThan(panel.indexOf('links.map('));
    expect(panel).toContain('cannot vouch for their uptime');
  });
  it('only reads: no POST, no signing, no key', () => {
    for (const s of [code(panel), code(lib)]) {
      for (const bad of ["method: 'POST'", 'method: "POST"', 'signMessage', 'signTypedData', 'eth_sendTransaction', 'eth_requestAccounts', 'privateKey', 'mnemonic', '.transfer(', 'sendTransaction']) {
        expect(s.includes(bad)).toBe(false);
      }
    }
  });
  it('requires dispenses to be exactly false before it trusts the list', () => {
    expect(panel).toContain('f.dispenses === false');
  });
  it('only reads the balance on a click, not on load', () => {
    expect(panel).toContain('onSubmit={read}');
    // the only call sits inside the submit handler, after its definition
    expect(panel.split('fetchFaucetBalance(address)')).toHaveLength(2);
    expect(panel.indexOf('fetchFaucetBalance(address)')).toBeGreaterThan(panel.indexOf('async function read('));
  });
  it('is the Fund stage and carries the Practice label', () => {
    expect(page).toContain('<PracticeBadge />');
    expect(page).toContain('current="fund"');
  });
});
