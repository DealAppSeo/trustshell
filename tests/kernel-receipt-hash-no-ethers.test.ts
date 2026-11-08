/**
 * Sealing and verifying a receipt must work on a cold install, where the optional `ethers` is absent.
 * The hash is compared with real ethers, because a receipt sealed by one must verify under the other.
 */
const receipt = {
  header: { schema: 'kernel-receipt/2', receipt_id: 'r-1', receipt_hash: '0xignored', note: 'café ✓ 雪' },
  decision: { verdict: 'ALLOW', checks: [{ name: 'b' }, { name: 'a' }] },
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock('ethers');
});

describe('kernelReceiptHash', () => {
  it('matches ethers byte for byte, including non-ASCII text', async () => {
    const { keccak256, toUtf8Bytes } = jest.requireActual<typeof import('ethers')>('ethers');
    const { kernelCanonicalJson, kernelReceiptHash } = await import('../src/lib/kernel-client');
    const { receipt_hash: _omit, ...header } = receipt.header;
    const expected = keccak256(toUtf8Bytes(kernelCanonicalJson({ ...receipt, header })));
    expect(await kernelReceiptHash(receipt as never)).toBe(expected);
  });

  it('runs with no ethers at all', async () => {
    jest.doMock('ethers', () => {
      const e = new Error("Cannot find module 'ethers'") as Error & { code?: string };
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    });
    await expect(import('ethers')).rejects.toThrow(/Cannot find module/);
    const { kernelReceiptHash } = await import('../src/lib/kernel-client');
    expect(await kernelReceiptHash(receipt as never)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('changes when the receipt changes', async () => {
    const { kernelReceiptHash } = await import('../src/lib/kernel-client');
    const other = { ...receipt, decision: { ...receipt.decision, verdict: 'DENY' } };
    expect(await kernelReceiptHash(other as never)).not.toBe(await kernelReceiptHash(receipt as never));
  });
});
