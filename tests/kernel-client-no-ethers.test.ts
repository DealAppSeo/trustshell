/**
 * A cold install has no `ethers`: it is an OPTIONAL peer, needed only for on-chain reads and payment
 * signing — never for hashing. keccak256 now comes from @noble/hashes (audited, bundled with the SDK),
 * so on a bare `npm i @hyperdag/trustshell` the client can hash arguments, recompute a receipt's hash,
 * and verify a receipt offline. Before 2026-11-06 the hash path loaded ethers, so a cold install could
 * do none of that and the decide path refused with `ethers_missing`. This pins the new reality: with
 * ethers absent, hashing and the decide flow work, and nothing reports `ethers_missing`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'kernel-receipt-v2.golden.json'), 'utf8'));
const HEX32 = /^0x[0-9a-f]{64}$/;

afterEach(() => {
  jest.resetModules();
  jest.dontMock('ethers');
});

/** Make any attempt to load `ethers` fail, exactly as it would on a cold install. */
const hideEthers = () =>
  jest.doMock('ethers', () => {
    const e = new Error("Cannot find module 'ethers'") as Error & { code?: string };
    e.code = 'MODULE_NOT_FOUND';
    throw e;
  });

describe('kernel-client on a machine without ethers', () => {
  it('recomputes a signed receipt hash bit-for-bit (keccak is bundled, not from ethers)', async () => {
    hideEthers();
    const { kernelReceiptHash } = await import('../src/lib/kernel-client');
    const receipt = golden.receipt_response.receipt;
    expect(await kernelReceiptHash(receipt)).toBe(receipt.header.receipt_hash);
  });

  it('hashes args locally and reaches the kernel — no ethers_missing refusal', async () => {
    hideEthers();
    const { kernelDecide } = await import('../src/lib/kernel-client');
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline'); // the network is down; the point is the client GOT this far
    });
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
    // It hashed the arguments without ethers (a real 0x+64 hex args_hash) and then actually tried the network.
    expect(out.args_hash).toMatch(HEX32);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The refusal is about the network, NOT a missing peer.
    expect(out.reasons.map((r) => r.code)).not.toContain('ethers_missing');
    expect(out.reasons[0]!.code).toBe('network_error');
  });
});
