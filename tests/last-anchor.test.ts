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
    const r = await client.getRepID('trinity-shofet');
    expect(r.lastAnchorTx).toBe('NOT_ANCHORED');
  });
});
