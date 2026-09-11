import { TrustShell, TrustShellError } from '../src/lib/trustshell';

describe('getAllowance fail-closed', () => {
  it('throws no_allowance_set — does not invent a cap', async () => {
    const { client } = await TrustShell.init({ timeout: 15_000 });
    await expect(client.getAllowance({ agentId: 'trinity-shofet' })).rejects.toThrow(
      /no_allowance_set/,
    );
  });
});
