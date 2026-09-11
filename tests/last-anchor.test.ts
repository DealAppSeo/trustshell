import { TrustShell } from '../src/lib/trustshell';

describe('getRepID lastAnchorTx', () => {
  it('trinity-shofet returns a tx or NOT_ANCHORED — never silent null', async () => {
    const { client, health } = await TrustShell.init({ timeout: 60_000 });
    expect(health.ok).toBe(true);
    const r = await client.getRepID('trinity-shofet');
    expect(r.lastAnchorTx).not.toBeNull();
    expect(r.lastAnchorTx === 'NOT_ANCHORED' || /^0x[0-9a-fA-F]{64}$/.test(r.lastAnchorTx)).toBe(
      true,
    );
  });
});
