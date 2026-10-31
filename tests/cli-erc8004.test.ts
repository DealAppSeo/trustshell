/**
 * `trustshell erc8004 <txHash>` through the CLI: argument rules, exit codes, and OFFLINE=1.
 * The grounding facts themselves are tested offline in erc8004-grounding.test.ts.
 */
import { parseArgs, run, EXIT, type CliIO } from '../src/cli/index';
import type { TrustShell } from '../src/lib/trustshell';

const TX = '0x' + 'a'.repeat(64);
const NO_CLIENT = {} as TrustShell;

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

afterEach(() => {
  delete (globalThis as any).fetch;
  delete process.env.OFFLINE;
});

describe('parseArgs erc8004', () => {
  it('defaults to Base mainnet and takes the aliases', () => {
    expect(parseArgs(['erc8004', TX])).toMatchObject({ command: 'erc8004', operand: TX, network: 'eip155:8453' });
    expect(parseArgs(['erc8004', TX, '--network', 'base-sepolia'])).toMatchObject({ network: 'eip155:84532' });
    expect(parseArgs(['erc8004', TX, '--payment', TX])).toMatchObject({ payment: TX });
  });

  it('refuses a bad hash, an unknown chain, a bad payment and a stray word', () => {
    expect(parseArgs(['erc8004', '0x1234']).error).toMatch(/transaction hash/);
    expect(parseArgs(['erc8004', TX, '--network', 'ethereum']).error).toMatch(/--network/);
    expect(parseArgs(['erc8004', TX, '--payment', 'abc']).error).toMatch(/--payment/);
    expect(parseArgs(['erc8004', TX, 'extra']).error).toMatch(/one feedback transaction hash/);
  });
});

describe('run erc8004', () => {
  it('OFFLINE=1 asks nobody and does not exit 0', async () => {
    const calls: unknown[] = [];
    (globalThis as any).fetch = async (...a: unknown[]) => {
      calls.push(a);
      throw new Error('no network in this test');
    };
    process.env.OFFLINE = '1';
    const { io, out } = captureIO();
    const code = await run(parseArgs(['erc8004', TX]), NO_CLIENT, io);
    expect(code).toBe(EXIT.NOT_CHECKED);
    expect(out.join('\n')).toMatch(/NOT_CHECKED/);
    expect(calls).toEqual([]);
  });

  it('an RPC that cannot be reached is not measured, never a pass', async () => {
    (globalThis as any).fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const { io, out } = captureIO();
    const code = await run(parseArgs(['erc8004', TX, '--json']), NO_CLIENT, io);
    expect(code).toBe(EXIT.NOT_CHECKED);
    expect(JSON.parse(out.join('\n')).grounded).toBe('not_measured');
  });
});
