/**
 * After verify PASS, print one receipt line and invite another claim, but only when a receipt
 * was actually written. That line is text. It is not a badge image and it does not ask for a
 * wallet. Until 2026-10-05 it printed on every PASS, including runs whose own receipt line said
 * NOT_CHECKED; the second test below used to pin exactly that.
 */
import { formatVerify, run, EXIT, type CliIO } from '../src/cli';
import type { TrustShell, VerifyOutputResult } from '../src/lib/trustshell';

const LINE = 'You have a receipt. Paste another claim when you want.';

function result(verdict: 'PASS' | 'FLAG' | 'VETO'): VerifyOutputResult {
  return {
    verdict,
    trustScore: verdict === 'PASS' ? 100 : 0,
    decisionReason: 'ok',
    evidence: [],
  } as unknown as VerifyOutputResult;
}

function captureIO(): { io: CliIO; out: string[] } {
  const out: string[] = [];
  const io: CliIO = {
    out: (line) => out.push(line),
    err: () => undefined,
  };
  return { io, out };
}

describe('verify success copy', () => {
  const prevFetch = global.fetch;

  beforeEach(() => {
    global.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('PASS with a written receipt says so once, with no badge image and no wallet', () => {
    const text = formatVerify(result('PASS'), { receiptWritten: true });
    expect(text).toContain(LINE);
    expect(text.split(LINE).length - 1).toBe(1);
    expect(text).not.toMatch(/<img|<svg|wallet/i);
    expect(text).not.toMatch(/badge/i);
    expect(formatVerify(result('VETO'), { receiptWritten: true })).not.toContain(LINE);
    expect(formatVerify(result('FLAG'), { receiptWritten: true })).not.toContain(LINE);
    expect(formatVerify(result('PASS'))).not.toContain(LINE);
  });

  it('the CLI does not claim a receipt after a PASS whose receipt was not written', async () => {
    const client = {
      verifyOutput: async () => result('PASS'),
    } as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run({ command: 'verify', operand: 'true claim', json: false, verify: false }, client, io);
    expect(code).toBe(EXIT.OK);
    const text = out.join('\n');
    expect(text).toContain('receipt NOT_CHECKED');
    expect(text).not.toContain(LINE);
  });
});
