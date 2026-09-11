import { TrustShell } from '../src/lib/trustshell';

describe('getAllowance fail-closed', () => {
  it('throws no_allowance_set — does not invent a cap', async () => {
    const client = new TrustShell();
    await expect(client.getAllowance({ agentId: 'trinity-shofet' })).rejects.toThrow(
      /no_allowance_set/,
    );
  });

  it('returns the TrustKeys readAllowance cap when one is set', async () => {
    const store = new Map<string, bigint>();
    store.set('trinity-shofet', BigInt(500));
    const client = new TrustShell({
      readAllowance: (agentId) => store.get(agentId),
    });
    await expect(client.getAllowance({ agentId: 'trinity-shofet' })).resolves.toEqual({
      agentId: 'trinity-shofet',
      cap: '500',
    });
    await expect(client.getAllowance({ agentId: 'nobody' })).rejects.toThrow(/no_allowance_set/);
  });
});
