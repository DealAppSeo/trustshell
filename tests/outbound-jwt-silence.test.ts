/**
 * JWT-shaped tokens starting with `eyJ` must be stripped from escalate packs.
 */
import { packEscalate, outboundFor } from '../src/memory/outbound';

const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxfQ.fake-signature';
const JWT_PREFIX = /\beyJ[A-Za-z0-9_-]/i;

describe('outbound JWT silence', () => {
  it('packEscalate removes bare eyJ JWT shapes from task and claims', () => {
    const packed = packEscalate(`token ${FAKE_JWT} done`, [
      `bearer ${FAKE_JWT}`,
      `plain eyJhbGciOiJub25lIn0`,
    ]);
    expect(JSON.stringify(packed)).not.toMatch(JWT_PREFIX);
    expect(packed.task).toBe('token  done');
    expect(packed.claims).toEqual(['bearer ', 'plain ']);
  });

  it('outboundFor escalate removes JWT shapes', () => {
    const packed = outboundFor('escalate', `send ${FAKE_JWT}`, [`claim ${FAKE_JWT}`]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(JWT_PREFIX);
    expect(packed!.task).toBe('send ');
    expect(packed!.claims).toEqual(['claim ']);
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${FAKE_JWT}`, [`claim ${FAKE_JWT}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
