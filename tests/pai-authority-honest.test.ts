/**
 * [F2] The PAI chat links to /stake when you talk about budget, spending or stake. It used to call
 * that page "real collateral, not a simulated balance". /stake is a practice stake on the test
 * network with no real funds behind it. The link says so, in words that stay true whether or not
 * repid-engine#1246 (the payment gate stops counting unbacked stake) has merged.
 */
import { relevantKernelRead } from '../lib/pai';

describe('the Authority link from the PAI chat', () => {
  const link = relevantKernelRead('how much can my agent spend?');

  it('is offered when you ask about spending', () => {
    expect(link?.href).toBe('/stake');
  });

  it('never claims the stake is real collateral', () => {
    expect(link?.answers).not.toMatch(/real collateral/i);
    expect(link?.answers).toMatch(/practice/i);
    expect(link?.answers).toMatch(/no real funds/i);
  });
});
