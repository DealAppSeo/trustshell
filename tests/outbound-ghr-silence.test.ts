/**
 * Escalate outbound packs must never carry GitHub refresh-token shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const REFRESH = 'ghr_' + 'a'.repeat(36);

describe('outbound ghr silence', () => {
  it('packEscalate strips ghr_ from task and claims', () => {
    const packed = packEscalate(
      `rotate ${REFRESH} token`,
      [`use ${REFRESH}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/ghr_/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips ghr_ from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${REFRESH}`, [
      `refresh ${REFRESH}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/ghr_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['refresh '],
    });
  });
});
