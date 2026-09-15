import {
  classifySigners,
  verifySigner,
  HYPERDAG_REPID_SIGNERS,
  type SignerEntry,
} from '../src/lib/verify-signer';

const WRITER = '0xb24268884472E7613aA58D38C8813f7Af1667382';
const ATTESTOR = '0xf6eE1768868c3266868edcA78bC41C50309cb22A';
const STRANGER = '0x000000000000000000000000000000000000dEaD';

describe('signer-aware verification (T6) — never a silent drop', () => {
  it('A1: presents BOTH of our signers, correctly labelled (writer + attestor)', () => {
    const out = classifySigners([WRITER, ATTESTOR]);
    expect(out).toEqual([
      { address: WRITER, status: 'in-allowlist', role: 'writer' },
      { address: ATTESTOR, status: 'in-allowlist', role: 'attestor' },
    ]);
  });

  it('A2: an unknown signer is SURFACED and FLAGGED, never dropped', () => {
    const out = classifySigners([WRITER, STRANGER, ATTESTOR]);
    expect(out).toHaveLength(3); // length preserved — nothing discarded
    expect(out.map((s) => s.status)).toEqual(['in-allowlist', 'unknown', 'in-allowlist']);
    const unknown = out.find((s) => s.address === STRANGER);
    expect(unknown).toEqual({ address: STRANGER, status: 'unknown', role: null });
  });

  it('address comparison is case-insensitive (a lowercased writer still matches)', () => {
    const out = classifySigners([WRITER.toLowerCase()]);
    expect(out[0].status).toBe('in-allowlist');
    expect(out[0].role).toBe('writer');
  });

  it('A3: the allowlist is CONFIG — changing it re-labels with no code change', () => {
    const custom: SignerEntry[] = [{ address: STRANGER, role: 'my-own-signer' }];
    const out = classifySigners([WRITER, STRANGER], custom);
    // With the custom allowlist, the stranger is now known and OUR writer is now the unknown one.
    expect(out.find((s) => s.address === STRANGER)).toEqual({ address: STRANGER, status: 'in-allowlist', role: 'my-own-signer' });
    expect(out.find((s) => s.address === WRITER)?.status).toBe('unknown');
  });

  it('the default allowlist ships as data (exported, editable) with both roles', () => {
    expect(HYPERDAG_REPID_SIGNERS.map((s) => s.role).sort()).toEqual(['attestor', 'writer']);
  });

  it('verifySigner is keyless via an injected fetch — labels every client, flags unknowns', async () => {
    const r = await verifySigner({
      tokenId: '6705',
      fetchClients: async () => [WRITER, ATTESTOR, STRANGER], // no network, no API key
    });
    expect(r.tokenId).toBe('6705');
    expect(r.signers).toHaveLength(3);
    expect(r.signers.filter((s) => s.status === 'unknown').map((s) => s.address)).toEqual([STRANGER]);
    expect(r.reasons).toEqual({}); // clean read → no reasons
  });

  it('verifySigner records a reason on a failed read — never a silent empty', async () => {
    const r = await verifySigner({
      tokenId: '6705',
      fetchClients: async () => {
        throw new Error('rpc down');
      },
    });
    expect(r.signers).toEqual([]);
    expect(r.reasons.fetch).toMatch(/rpc down/);
  });
});
