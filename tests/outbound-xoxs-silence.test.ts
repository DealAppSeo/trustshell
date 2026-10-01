/**
 * Slack session tokens starting with `xoxs-` must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const FAKE_XOXS = 'xoxs-fake-test-token-not-real-00000000';
const XOXS_PREFIX = /\bxoxs-[A-Za-z0-9_-]/i;

describe('outbound xoxs silence', () => {
  it('packEscalate removes xoxs- session tokens from task and claims', () => {
    const packed = packEscalate(`session ${FAKE_XOXS} done`, [
      `token ${FAKE_XOXS}`,
      `plain xoxsredacted`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(XOXS_PREFIX);
    expect(packed.task).toBe('session  done');
    expect(packed.claims).toEqual(['token ', 'plain xoxsredacted']);
  });

  it('outboundFor escalate removes xoxs- session tokens', () => {
    const packed = outboundFor('escalate', `send ${FAKE_XOXS}`, [`claim ${FAKE_XOXS}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(XOXS_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${FAKE_XOXS}`, [`claim ${FAKE_XOXS}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
