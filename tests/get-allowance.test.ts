import { TrustShell } from '../src/lib/trustshell';

describe('getAllowance fail-closed', () => {
  it('throws no_allowance_set — does not invent a cap', async () => {
    const client = new TrustShell();
    await expect(client.getAllowance({ agentId: 'trinity-shofet' })).rejects.toThrow(
      /no_allowance_set/,
    );
  });
});
