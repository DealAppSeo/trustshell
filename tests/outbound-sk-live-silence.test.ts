/**
 * Escalate outbound packs must never carry Stripe live secret key shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const SK_LIVE = 'sk_live_' + 'a'.repeat(24);
const SK_LIVE_PATTERN = /\bsk_live_[A-Za-z0-9]/;

describe('outbound sk_live silence', () => {
  it('packEscalate strips sk_live_ tokens from task and claims', () => {
    const packed = packEscalate(
      `charge ${SK_LIVE} token`,
      [`use ${SK_LIVE}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(SK_LIVE_PATTERN);
    expect(JSON.stringify(packed)).not.toMatch(/sk_live_/);
    expect(packed.task).toBe('charge  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips sk_live_ tokens from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${SK_LIVE}`, [
      `auth ${SK_LIVE}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(SK_LIVE_PATTERN);
    expect(JSON.stringify(packed)).not.toMatch(/sk_live_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['auth '],
    });
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `token ${SK_LIVE}`, [`claim ${SK_LIVE}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
