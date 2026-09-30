/**
 * After verify PASS, print one receipt line and invite another claim.
 * That line is text. It is not a badge image and it does not ask for a wallet.
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

  it('PASS says you have a receipt, with no badge image and no wallet', () => {
    const text = formatVerify(result('PASS'));
    expect(text).toContain(LINE);
    expect(text.split(LINE).length - 1).toBe(1);
    expect(text).not.toMatch(/<img|<svg|wallet/i);
    expect(text).not.toMatch(/badge/i);
    expect(formatVerify(result('VETO'))).not.toContain(LINE);
    expect(formatVerify(result('FLAG'))).not.toContain(LINE);
  });

  it('the CLI prints that line after a PASS', async () => {
    const client = {
      verifyOutput: async () => result('PASS'),
    } as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run({ command: 'verify', operand: 'true claim', json: false, verify: false }, client, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('\n')).toContain(LINE);
  });
});
