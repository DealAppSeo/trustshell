/**
 * [F2] The PAI chat links to /stake when you talk about budget, spending or stake. It used to call
 * that page "real collateral, not a simulated balance". /stake is a practice stake on the test
 * network, and the engine no longer counts unbacked stake toward spending. The link says so.
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
