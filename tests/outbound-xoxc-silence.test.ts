/**
 * Slack config token shapes starting with `xoxc-` must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const XOXC = 'xoxc-1234567890-1234567890-abcdef-0123456789abcdef0123456789abcdef';
const XOXC_PREFIX = /\bxoxc-[A-Za-z0-9_\-]/i;

describe('outbound xoxc silence', () => {
  it('packEscalate removes xoxc- tokens from task and claims', () => {
    const packed = packEscalate(`token ${XOXC} done`, [
      `slack config ${XOXC}`,
      `plain xoxc-`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(XOXC_PREFIX);
    expect(packed.task).toBe('token  done');
    expect(packed.claims).toEqual(['slack config ', 'plain xoxc-']);
  });

  it('outboundFor escalate removes xoxc- tokens', () => {
    const packed = outboundFor('escalate', `send ${XOXC}`, [`claim ${XOXC}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(XOXC_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${XOXC}`, [`claim ${XOXC}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
