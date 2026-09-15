/**
 * S5 — an action class cannot run without a typed envelope.
 * Synthetic only. No network.
 */
import {
  EnvelopeRequiredError,
  runEnvelopedAction,
} from '../src/lib/action-envelope';

describe('S5 typed action envelope', () => {
  it('refuses to run without a typed envelope', async () => {
    await expect(runEnvelopedAction(undefined, async () => 'ran')).rejects.toBeInstanceOf(
      EnvelopeRequiredError,
    );
    await expect(runEnvelopedAction({}, async () => 'ran')).rejects.toThrow(
      /typed envelope required/,
    );
    await expect(
      runEnvelopedAction({ origin: 'Unknown', actionClass: 'pay', policyId: 'p1' }, async () => 'ran'),
    ).rejects.toBeInstanceOf(EnvelopeRequiredError);
  });

  it('runs when the envelope is typed', async () => {
    const r = await runEnvelopedAction(
      { origin: 'Cli', actionClass: 'verify', policyId: 'p1' },
      async () => 'ran',
    );
    expect(r).toBe('ran');
  });
});
