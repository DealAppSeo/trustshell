import { guardedX402Payment } from '../src/lib/index';

// Disposable local-sign key only — never a funded wallet, never logged.
const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';
const BASE = { privateKey: TEST_KEY, to: TEST_TO, amount: 100, cap: 1000, agentId: 'trinity-test' };

function sink() {
  const lines: string[] = [];
  return { stream: { write: (s: string) => lines.push(s) }, lines };
}

describe('guardedX402Payment — origin gate + audit-before-act around the signer', () => {
  it('REFUSES an undefined origin BEFORE writing any intent row (never signs)', async () => {
    const s = sink();
    await expect(
      guardedX402Payment({ ...BASE, origin: undefined as any, policy: { allow: true } }, { stream: s.stream }),
    ).rejects.toThrow(/origin_refused/);
    expect(s.lines).toHaveLength(0); // origin is checked before the intent row
  });

  it('REFUSES an Unknown origin', async () => {
    await expect(
      guardedX402Payment({ ...BASE, origin: 'Unknown', policy: { allow: true } }),
    ).rejects.toThrow(/origin_refused/);
  });

  it('REFUSES a missing policy, but records the intent row first', async () => {
    const s = sink();
    await expect(
      guardedX402Payment({ ...BASE, origin: 'Cli', policy: undefined }, { stream: s.stream, now: 't0' }),
    ).rejects.toThrow(/policy_required/);
    expect(s.lines).toHaveLength(1);
    expect(JSON.parse(s.lines[0])).toEqual({
      origin: 'Cli', amount: '100', cap: '1000', agentId: 'trinity-test', ts: 't0', event: 'intent',
    });
  });

  it('records the cap WITHOUT re-reading the allowance (no divergence, no pre-audit throw)', async () => {
    const s = sink();
    let reads = 0;
    const readAllowance = () => { reads++; return BigInt(500); }; // signer's read is authoritative
    await expect(
      guardedX402Payment({ ...BASE, cap: 1000, readAllowance, origin: 'Cli', policy: { allow: false } }, { stream: s.stream, now: 't' }),
    ).rejects.toThrow(/policy_denied/);
    // Declared cap recorded verbatim + a flag; the audit path never called the allowance reader.
    expect(JSON.parse(s.lines[0]).cap).toBe('1000 (or lower, per allowance at sign time)');
    expect(reads).toBe(0);
  });

  it('audits the attempt even when the allowance reader would throw (audit-before-act holds)', async () => {
    const s = sink();
    const readAllowance = () => { throw new Error('reader down'); };
    // Missing declared cap + a throwing reader: the OLD code threw before writing the row. Now the
    // intent row is written first (policy refuses after), so the attempt is still audited.
    await expect(
      guardedX402Payment({ privateKey: '0x' + '1'.repeat(64), to: TEST_TO, amount: 100, agentId: 'a', readAllowance, origin: 'Cli', policy: undefined }, { stream: s.stream, now: 't' }),
    ).rejects.toThrow(/policy_required/);
    expect(s.lines).toHaveLength(1);
    expect(JSON.parse(s.lines[0]).cap).toBe('from_allowance');
  });

  it('signs via buildX402Payment when origin is pay-capable and policy allows', async () => {
    const s = sink();
    const header = await guardedX402Payment({ ...BASE, origin: 'Cli', policy: { allow: true } }, { stream: s.stream });
    expect(typeof header).toBe('string');
    expect(header.length).toBeGreaterThan(0);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    expect(decoded.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(s.lines).toHaveLength(1); // intent recorded before signing
  });
});
