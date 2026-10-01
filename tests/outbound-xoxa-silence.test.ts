/**
 * Slack app-level tokens starting with `xoxa-` must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const XOXA_TOKEN = 'xoxa-1234567890-1234567890-AbCdEfGhIjKlMnOpQrStUvWx';
const XOXA_PREFIX = /\bxoxa-[A-Za-z0-9_-]/i;

describe('outbound xoxa silence', () => {
  it('packEscalate removes xoxa- tokens from task and claims', () => {
    const packed = packEscalate(`token ${XOXA_TOKEN} done`, [
      `app_token ${XOXA_TOKEN}`,
      `plain xoxa- done`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(XOXA_PREFIX);
    expect(packed.task).toBe('token  done');
    expect(packed.claims).toEqual(['app_token ', 'plain xoxa- done']);
  });

  it('outboundFor escalate removes xoxa- tokens', () => {
    const packed = outboundFor('escalate', `send ${XOXA_TOKEN}`, [`claim ${XOXA_TOKEN}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(XOXA_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${XOXA_TOKEN}`, [`claim ${XOXA_TOKEN}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
