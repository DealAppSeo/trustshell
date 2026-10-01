/**
 * Slack enterprise token shapes (`xoxe-...`) must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const FAKE_XOXE =
  'xoxe-1234567890123-1234567890123-1234567890123-1234567890abcdef1234567890abcdef';
const XOXE_PREFIX = /\bxoxe-[A-Za-z0-9_-]/i;

describe('outbound xoxe silence', () => {
  it('packEscalate removes xoxe- tokens from task and claims', () => {
    const packed = packEscalate(`token ${FAKE_XOXE} done`, [
      `enterprise ${FAKE_XOXE}`,
      `plain xoxe-legacy`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(XOXE_PREFIX);
    expect(packed.task).toBe('token  done');
    expect(packed.claims).toEqual(['enterprise ', 'plain ']);
  });

  it('outboundFor escalate removes xoxe- tokens', () => {
    const packed = outboundFor('escalate', `send ${FAKE_XOXE}`, [`claim ${FAKE_XOXE}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(XOXE_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${FAKE_XOXE}`, [`claim ${FAKE_XOXE}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
