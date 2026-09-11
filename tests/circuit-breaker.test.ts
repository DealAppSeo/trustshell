import { CircuitBreaker } from '../src/lib/index';

describe('CircuitBreaker — halt after 3 identical failures, no screensaver loop', () => {
  it('trips on the 3rd identical key, not before', () => {
    const b = new CircuitBreaker();
    expect(b.record('VETO:rome')).toBeNull();
    expect(b.record('VETO:rome')).toBeNull();
    const halt = b.record('VETO:rome');
    expect(halt).toMatch(/circuit_halt: 3× identical 'VETO:rome'/);
    expect(b.trippedKey).toBe('VETO:rome');
  });

  it('a different key resets the streak (progress clears it)', () => {
    const b = new CircuitBreaker();
    b.record('cap_refuse:9/5');
    b.record('cap_refuse:9/5');
    expect(b.record('VETO:paris')).toBeNull(); // different → resets to 1
    expect(b.record('VETO:paris')).toBeNull();
    expect(b.record('VETO:paris')).toMatch(/circuit_halt/);
  });

  it('reset() clears a tripped breaker', () => {
    const b = new CircuitBreaker();
    b.record('no_progress');
    b.record('no_progress');
    expect(b.record('no_progress')).toMatch(/circuit_halt/);
    b.reset();
    expect(b.trippedKey).toBeUndefined();
    expect(b.record('no_progress')).toBeNull();
  });

  it('honors a custom threshold and rejects a bad one', () => {
    const b = new CircuitBreaker(2);
    expect(b.record('x')).toBeNull();
    expect(b.record('x')).toMatch(/2× identical/);
    expect(() => new CircuitBreaker(0)).toThrow(/>= 1/);
  });
});
