import { assertPaymentCap } from '../src/lib/index';

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
