/**
 * The passport prints the canonical IdentityRegistry or NOT_CHECKED. Never a placeholder, a
 * non-hex string, or a transaction hash in the address column (MEASURED 2026-10-12: 11 of the 12
 * squad agents carried one of those in `identity_erc8004.contract_address`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IDENTITY_REGISTRY_BASE_SEPOLIA,
  REPUTATION_REGISTRY_BASE_SEPOLIA,
  identityRegistryShown,
  mintStateShown,
  mintTxUrlShown,
  reputationRegistryShown,
  tokenIdShown,
  twoFieldsOf,
} from '../lib/erc8004-display';

const ROOT = join(__dirname, '..');
const CANON = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

// Shapes of the garbage the engine held, by KIND (not the agents' real rows).
const GARBAGE: Array<[string, unknown]> = [
  ['non-hex letters', '0x8004NexuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  ['pending-mint placeholder', 'pending-mint:abcdef'],
  ['external placeholder', 'external:agent-card'],
  ['a transaction hash in the address column', `0x${'ab'.repeat(32)}`],
  ['one character short', CANON.slice(0, -1)],
  ['one character long', `${CANON}0`],
  ['a different, valid address (an EOA)', '0x93223C321d2f4c136bf1da64DEb3C6Ad484334E1'],
  ['empty', ''],
  ['whitespace', '   '],
  ['null', null],
  ['undefined', undefined],
  ['a number', 8004],
  ['an object', { a: 1 }],
  ['0x only', '0x'],
];

describe('identityRegistryShown', () => {
  it('pins the canonical addresses', () => {
    expect(IDENTITY_REGISTRY_BASE_SEPOLIA).toBe(CANON);
    expect(REPUTATION_REGISTRY_BASE_SEPOLIA).toBe('0x8004B663056A597Dffe9eCcC1965A193B7388713');
  });

  it('shows OUR constant for the canonical address, whatever casing the engine sent', () => {
    for (const v of [CANON, CANON.toLowerCase(), ` ${CANON} `]) {
      expect(identityRegistryShown(v)).toEqual({ state: 'CANONICAL', address: CANON });
    }
    expect(identityRegistryShown(CANON.toUpperCase().replace('0X', '0x'))).toEqual({ state: 'CANONICAL', address: CANON });
  });

  it.each(GARBAGE)('is NOT_CHECKED for %s, and never echoes it', (_k, raw) => {
    const r = identityRegistryShown(raw);
    expect(r.state).toBe('NOT_CHECKED');
    if (r.state === 'NOT_CHECKED' && typeof raw === 'string' && raw.trim()) expect(r.reason).not.toContain(raw.trim());
  });

  it('guards the reputation registry the same way', () => {
    expect(reputationRegistryShown('0x8004B663056A597Dffe9eCcC1965A193B7388713').state).toBe('CANONICAL');
    expect(reputationRegistryShown(CANON).state).toBe('NOT_CHECKED');
    expect(reputationRegistryShown('pending-mint').state).toBe('NOT_CHECKED');
  });
});

describe('tokenIdShown', () => {
  it('accepts a plain whole number', () => {
    expect(tokenIdShown('3747')).toEqual({ state: 'ID', id: '3747' });
    expect(tokenIdShown(3747)).toEqual({ state: 'ID', id: '3747' });
    expect(tokenIdShown('0')).toEqual({ state: 'ID', id: '0' });
  });
  it.each([null, undefined, '', 'pending-mint', '-1', '1.5', '0x10', '007', '1e5', `0x${'ab'.repeat(32)}`, '9'.repeat(30), NaN, -3, {}])(
    'is NOT_CHECKED for %p',
    (raw) => {
      expect(tokenIdShown(raw).state).toBe('NOT_CHECKED');
    },
  );
});

describe('mintTxUrlShown / mintStateShown', () => {
  const tx = `0x${'a1'.repeat(32)}`;
  it('links only a real Base Sepolia transaction page', () => {
    expect(mintTxUrlShown(`https://sepolia.basescan.org/tx/${tx}`)).toBe(`https://sepolia.basescan.org/tx/${tx}`);
    for (const bad of [
      `http://sepolia.basescan.org/tx/${tx}`,
      `https://evil.example/tx/${tx}`,
      `https://sepolia.basescan.org/address/${tx}`,
      `https://sepolia.basescan.org/tx/${tx}?x=1`,
      'javascript:alert(1)',
      null,
      42,
    ]) {
      expect(mintTxUrlShown(bad)).toBeNull();
    }
  });
  it('keeps the engine\'s three states and turns anything else into NOT_CHECKED', () => {
    expect(['MINTED', 'UNVERIFIED', 'NOT_MINTED'].map(mintStateShown)).toEqual(['MINTED', 'UNVERIFIED', 'NOT_MINTED']);
    for (const v of [true, false, null, undefined, 'minted', '', 'YES']) expect(mintStateShown(v)).toBe('NOT_CHECKED');
  });
});

describe('twoFieldsOf: the score and the ID are two different fields', () => {
  const sophia = {
    reputation: { repid_score: 1359, tier: 'ESTABLISHED' },
    identity_erc8004: { registered_onchain: 'UNVERIFIED', token_id: '3747', contract_address: null },
  };
  it('reads both, separately', () => {
    expect(twoFieldsOf(sophia)).toEqual({
      score: 1359,
      tier: 'ESTABLISHED',
      mint: 'UNVERIFIED',
      token: { state: 'ID', id: '3747' },
    });
  });
  it('a score never implies an ID and an ID never implies a score', () => {
    const noId = twoFieldsOf({ reputation: { repid_score: 200 }, identity_erc8004: { registered_onchain: 'NOT_MINTED', token_id: null } });
    expect(noId.score).toBe(200);
    expect(noId.mint).toBe('NOT_MINTED');
    expect(noId.token.state).toBe('NOT_CHECKED');
    const noScore = twoFieldsOf({ identity_erc8004: { registered_onchain: 'MINTED', token_id: '5' } });
    expect(noScore.score).toBeNull();
    expect(noScore.token).toEqual({ state: 'ID', id: '5' });
  });
  it('is all NOT_CHECKED for a body that is not a passport', () => {
    for (const body of [null, undefined, 'x', 7, [], {}]) {
      const f = twoFieldsOf(body);
      expect(f.score).toBeNull();
      expect(f.mint).toBe('NOT_CHECKED');
      expect(f.token.state).toBe('NOT_CHECKED');
    }
  });
  it('does not turn a non-finite score into a number', () => {
    expect(twoFieldsOf({ reputation: { repid_score: NaN } }).score).toBeNull();
    expect(twoFieldsOf({ reputation: { repid_score: '1359' } }).score).toBeNull();
  });
});

describe('the passport page', () => {
  const src = readFileSync(join(ROOT, 'app/passport/[agentId]/page.tsx'), 'utf8').replace(/\r/g, '');
  it('never prints a registry address, a token id or a mint link from the engine verbatim', () => {
    expect(src).not.toMatch(/>\s*\{id\.contract_address\}\s*</);
    expect(src).not.toMatch(/>\s*\{p\.reputation_onchain\.registry_address\}\s*</);
    expect(src).not.toMatch(/>\s*\{id\.token_id\}\s*</);
    expect(src).toContain('<TokenValue raw={id.token_id} />');
    expect(src).not.toMatch(/href=\{id\.mint_basescan_url\}/);
    expect(src).toContain('identityRegistryShown(id.contract_address)');
    expect(src).toContain('reputationRegistryShown(p.reputation_onchain.registry_address)');
    expect(src).toContain('mintTxUrlShown(id.mint_basescan_url)');
  });
  it('shows the score and the ID as two labelled fields', () => {
    expect(src).toContain('Field 1 · Score');
    expect(src).toContain('Field 2 · ERC-8004 ID');
    expect(src).toContain('data-testid="two-fields"');
  });
});
