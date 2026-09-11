import { assertPaymentCap, buildX402Payment } from '../src/lib/index';

// Disposable local-sign key only — never a funded wallet, never logged.
const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';

// The ONE cap export is `assertPaymentCap({ amount, cap })` (src/lib/trustshell.ts), throwing
// TrustShellError `cap_exceeded` when amount > cap. This test hits that export only.
// No BigInt literals — the root tsconfig targets < ES2020 (they are a tsc error there); use
// number / string, both of which assertPaymentCap coerces via BigInt() at runtime (uint256-safe).
describe('assertPaymentCap — a cap below the amount MUST refuse', () => {
  it('REFUSES when amount exceeds cap', () => {
    expect(() => assertPaymentCap({ amount: 1000, cap: 500 })).toThrow(/cap_exceeded/);
  });

  it('allows amount at or below cap', () => {
    expect(assertPaymentCap({ amount: 500, cap: 500 })).toBe(true);
    expect(assertPaymentCap({ amount: 499, cap: 500 })).toBe(true);
  });

  it('is uint256-safe via string — no precision loss beyond Number.MAX_SAFE_INTEGER', () => {
    expect(() => assertPaymentCap({ amount: '9007199254740993', cap: '9007199254740992' })).toThrow(/cap_exceeded/);
    expect(assertPaymentCap({ amount: '9007199254740992', cap: '9007199254740993' })).toBe(true);
  });

  it('accepts string and number raw amounts', () => {
    expect(() => assertPaymentCap({ amount: '1000000', cap: '999999' })).toThrow(/cap_exceeded/);
    expect(assertPaymentCap({ amount: 100, cap: 1000 })).toBe(true);
  });
});

describe('buildX402Payment must assert cap before signing', () => {
  it('REFUSES when cap is missing', async () => {
    await expect(
      buildX402Payment({ privateKey: TEST_KEY, to: TEST_TO, amount: 1 } as any),
    ).rejects.toThrow(/cap required/);
  });

  it('REFUSES amount above cap before signing', async () => {
    await expect(
      buildX402Payment({ privateKey: TEST_KEY, to: TEST_TO, amount: 1000, cap: 500 }),
    ).rejects.toThrow(/cap_exceeded/);
  });

  it('signs when amount is at or below cap', async () => {
    const hdr = await buildX402Payment({
      privateKey: TEST_KEY,
      to: TEST_TO,
      amount: 500,
      cap: 500,
    });
    expect(typeof hdr).toBe('string');
    expect(hdr.length).toBeGreaterThan(10);
  });
});

