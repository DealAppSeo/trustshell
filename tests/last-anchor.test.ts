import { TrustShell } from '../src/lib/trustshell';

describe('getRepID lastAnchorTx', () => {
  it('maps a missing on-chain anchor to NOT_ANCHORED — never silent null', async () => {
    const client = new TrustShell();
    (client as any).verify = async () => ({
      repid: 1,
      tier: 'PROBATIONARY',
      lastAnchorTx: null,
      latestProofHash: null,
    });
    (client as any).presentProof = async () => ({
      proofBytes: '',
      proofHash: null,
    });
    // getRepID now also reads the ERC-8004 ID (the second field). Stubbed here so a unit test never
    // touches the network; its own behaviour is pinned in tests/identity.test.ts.
    (client as any).getIdentity = async () => ({ registeredOnchain: 'NOT_CHECKED', tokenId: null });
    const r = await client.getRepID('trinity-shofet');
    expect(r.lastAnchorTx).toBe('NOT_ANCHORED');
  });
});
