/**
 * GitHub OAuth access tokens (`gho_`) must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const FAKE_GHO = 'gho_16C7e42F292c6912E7710c838347Ae178B4B';
const GHO_PREFIX = /\bgho_[A-Za-z0-9]/i;

describe('outbound gho silence', () => {
  it('packEscalate removes gho_ tokens from task and claims', () => {
    const packed = packEscalate(`token ${FAKE_GHO} done`, [
      `oauth ${FAKE_GHO}`,
      `plain gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(GHO_PREFIX);
    expect(packed.task).toBe('token  done');
    expect(packed.claims).toEqual(['oauth ', 'plain ']);
  });

  it('outboundFor escalate removes gho_ tokens', () => {
    const packed = outboundFor('escalate', `send ${FAKE_GHO}`, [`claim ${FAKE_GHO}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(GHO_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${FAKE_GHO}`, [`claim ${FAKE_GHO}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
