import { assertOriginCanPay, canPay, PAY_CAPABLE_ORIGINS, AgentTurnOrigin } from '../src/lib/index';

// Fail-closed origins: a turn without a stamped, recognized origin is Unknown, and Unknown
// may never pay. Same posture as buildX402Payment's missing-cap refusal (tested in x402-cap).
describe('assertOriginCanPay — an unstamped or Unknown turn MUST refuse to pay', () => {
  it('REFUSES undefined origin (unstamped never inherits max trust)', () => {
    expect(() => assertOriginCanPay(undefined)).toThrow(/origin_refused/);
  });

  it('REFUSES an explicit Unknown origin', () => {
    expect(() => assertOriginCanPay('Unknown')).toThrow(/origin_refused/);
  });

  it('REFUSES an unrecognized origin string', () => {
    // Cast: exercises the runtime guard against a value the type system would reject.
    expect(() => assertOriginCanPay('Api' as AgentTurnOrigin)).toThrow(/origin_refused/);
  });

  it('allows each known pay-capable origin', () => {
    for (const o of PAY_CAPABLE_ORIGINS) {
      expect(() => assertOriginCanPay(o)).not.toThrow();
      expect(canPay(o)).toBe(true);
    }
  });

  it('canPay is false for undefined / Unknown', () => {
    expect(canPay(undefined)).toBe(false);
    expect(canPay('Unknown')).toBe(false);
  });
});
