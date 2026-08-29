/**
 * `rawToUsdc(null)` RETURNS 0, AND THAT IS THE WHOLE HAZARD.
 *
 * The backend withholds the authority ceiling for a builder whose path never applied the builder
 * floor, because the figure it computed is one the spend gate would refuse. It returns null, and
 * says `authority_withheld`.
 *
 * Any UI that converts before checking turns that null into 0 and renders "$0.00" — asserting the
 * ceiling WAS measured and came out empty. That is a different false statement from the one the
 * backend is trying to stop telling, and arguably a worse one: "$0.00" looks like a fact.
 *
 * The anchor test below proves the hazard is real before the guard is asserted to close it. A
 * guard tested only against a hazard nobody demonstrated is a guard nobody knows is doing anything.
 */
import { authorityCeilingDisplay, rawToUsdc, type AuthoritySnapshot } from '../lib/repid-engine';

const snap = (over: Partial<AuthoritySnapshot>): AuthoritySnapshot => ({
  builder_id: 'b', stake_total: '100000000', authority: '50000000', basis: 'sqrt', ...over,
});

describe('the hazard, demonstrated first', () => {
  it('rawToUsdc(null) really is 0 — this is what the guard exists to prevent reaching the screen', () => {
    expect(rawToUsdc(null)).toBe(0);
  });
});

describe('authorityCeilingDisplay', () => {
  it('withheld: no figure, flagged, and the backend reason carried through', () => {
    const v = authorityCeilingDisplay(
      snap({ authority: null, authority_withheld: true, authority_is_binding: false,
             authority_detail: 'It is not zero; it is not established.' }),
    );
    expect(v.usd).toBeNull();          // NOT 0
    expect(v.withheld).toBe(true);
    expect(v.nonBinding).toBe(true);
    expect(v.detail).toMatch(/not zero/i);
  });

  it('a null authority from an OLDER backend that never sends the flag is still withheld', () => {
    // Forward-compatibility in the safe direction: absence of the flag must not mean "show 0".
    const v = authorityCeilingDisplay(snap({ authority: null }));
    expect(v.usd).toBeNull();
    expect(v.withheld).toBe(true);
  });

  it('a normal binding ceiling converts as before', () => {
    const v = authorityCeilingDisplay(snap({ authority_is_binding: true }));
    expect(v.usd).toBe(50);
    expect(v.withheld).toBe(false);
    expect(v.nonBinding).toBe(false);
  });

  it("'labelled' mode: the figure shows, but it is marked non-binding", () => {
    const v = authorityCeilingDisplay(
      snap({ authority_is_binding: false, authority_detail: 'Demo figure.' }),
    );
    expect(v.usd).toBe(50);
    expect(v.withheld).toBe(false);
    expect(v.nonBinding).toBe(true);
  });

  it('a measured ZERO from a floor that really ran is shown, not withheld', () => {
    // FAILED is a real result. Hiding it would be the mirror-image dishonesty.
    const v = authorityCeilingDisplay(snap({ authority: '0', authority_is_binding: true }));
    expect(v.usd).toBe(0);
    expect(v.withheld).toBe(false);
  });

  it('no snapshot at all is neither withheld nor zero — nothing was asked yet', () => {
    const v = authorityCeilingDisplay(null);
    expect(v.usd).toBeNull();
    expect(v.withheld).toBe(false);
  });
});
