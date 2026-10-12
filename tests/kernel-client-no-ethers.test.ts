/**
 * A cold install has no `ethers` (it is an optional peer). The kernel client must then REFUSE, and the
 * refusal must say what to run, in its own words, instead of naming an error class. Measured on a
 * fresh `npm i` of this package on 2026-10-12: it refused correctly but said only
 * "the kernel client failed (MissingDependencyError); refusing".
 */
afterEach(() => {
  jest.resetModules();
  jest.dontMock('ethers');
});

describe('kernelDecide on a machine without ethers', () => {
  it('refuses, sends nothing, and says to run npm i ethers@^6', async () => {
    jest.doMock('ethers', () => {
      const e = new Error("Cannot find module 'ethers'") as Error & { code?: string };
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    });
    const { kernelDecide } = await import('../src/lib/kernel-client');
    const fetchImpl = jest.fn();
    const out = await kernelDecide(
      {
        agent: { agent_id: '00000000-0000-4000-8000-000000000001', agent_name: 'cold' },
        tool: { name: 'x402.pay', class: 'spend' },
        origin: 'Cli',
        args: { resource: 'https://example.com/paid' },
        amount_raw: '1000',
        payee: '0x3333333333333333333333333333333333333333',
      },
      { apiUrl: 'https://engine.test', fetch: fetchImpl as never },
    );
    expect(out.allowed).toBe(false);
    if (out.allowed) return;
    expect(out.verdict).toBe('NOT_CHECKED');
    expect(out.source).toBe('client');
    expect(out.reasons).toHaveLength(1);
    expect(out.reasons[0]!.code).toBe('ethers_missing');
    expect(out.reasons[0]!.detail).toMatch(/npm i ethers@\^6/);
    expect(out.http_status).toBeNull();
    // Nothing left the process: it never got as far as asking the kernel.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requireKernelAllow throws with the same reason, so the refusal cannot be ignored', async () => {
    jest.doMock('ethers', () => {
      const e = new Error("Cannot find module 'ethers'") as Error & { code?: string };
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    });
    const { requireKernelAllow } = await import('../src/lib/kernel-client');
    await expect(
      requireKernelAllow(
        { agent: { agent_id: 'a', agent_name: 'a' }, tool: { name: 't', class: 'read' }, origin: 'Cli', args: { x: 1 } },
        { apiUrl: 'https://engine.test', fetch: jest.fn() as never },
      ),
    ).rejects.toMatchObject({ code: 'KERNEL_REFUSED', message: expect.stringContaining('ethers_missing') });
  });
});
