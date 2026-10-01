/**
 * Slack refresh tokens starting with `xoxr-` must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const XOXR_TOKEN =
  'xoxr-1234567890123-1234567890123-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const XOXR_PREFIX = /\bxoxr-[A-Za-z0-9_-]/i;

describe('outbound xoxr silence', () => {
  it('packEscalate removes xoxr- refresh tokens from task and claims', () => {
    const packed = packEscalate(`refresh ${XOXR_TOKEN} done`, [
      `token ${XOXR_TOKEN}`,
      'plain slack refresh',
    ]);
    expect(JSON.stringify(packed)).not.toMatch(XOXR_PREFIX);
    expect(packed.task).toBe('refresh  done');
    expect(packed.claims).toEqual(['token ', 'plain slack refresh']);
  });

  it('outboundFor escalate removes xoxr- refresh tokens', () => {
    const packed = outboundFor('escalate', `send ${XOXR_TOKEN}`, [`claim ${XOXR_TOKEN}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(XOXR_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${XOXR_TOKEN}`, [`claim ${XOXR_TOKEN}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
