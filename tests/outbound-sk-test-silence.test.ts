/**
 * Escalate outbound packs must never carry Stripe test secret key shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const SK_TEST_TOKEN = 'sk_test_' + 'a'.repeat(24);

describe('outbound sk_test_ silence', () => {
  it('packEscalate strips sk_test_ tokens from task and claims', () => {
    const packed = packEscalate(
      `charge ${SK_TEST_TOKEN} card`,
      [`stripe ${SK_TEST_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/sk_test_/);
    expect(packed.task).toBe('charge  card');
    expect(packed.claims).toEqual(['stripe ', 'ok claim']);
  });

  it('outboundFor escalate strips sk_test_ tokens from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${SK_TEST_TOKEN}`, [
      `auth ${SK_TEST_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/sk_test_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['auth '],
    });
  });
});
