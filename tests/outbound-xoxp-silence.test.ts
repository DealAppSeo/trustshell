/**
 * Slack user tokens (`xoxp-...`) must never leave escalate outbound packs.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

describe('outbound xoxp silence', () => {
  it('packEscalate strips xoxp- Slack user tokens from task and claims', () => {
    const token = 'xoxp-123456789012-1234567890123-1234567890123456789012345678';
    const packed = packEscalate(`notify ${token}`, [`use ${token} carefully`]);

    expect(packed.task).toBe('notify ');
    expect(packed.claims).toEqual(['use  carefully']);
    expect(JSON.stringify(packed)).not.toMatch(/xoxp-/i);
  });

  it('outboundFor escalate strips xoxp- Slack user tokens', () => {
    const token = 'xoxp-xoxp-xoxp-xoxp-xoxp';
    const packed = outboundFor('escalate', `token: ${token}`, [`${token} is leaked`]);

    expect(packed).toEqual({
      task: 'token: ',
      claims: [' is leaked'],
    });
    expect(JSON.stringify(packed)).not.toMatch(/xoxp-/i);
  });

  it('non-escalate routes still send nothing', () => {
    expect(outboundFor('cheap')).toBeNull();
    expect(outboundFor('ask', 'xoxp-ignored', ['xoxp-ignored'])).toBeNull();
  });
});
