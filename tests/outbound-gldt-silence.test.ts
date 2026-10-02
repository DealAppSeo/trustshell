/**
 * Escalate outbound packs must never carry GitLab deploy token shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GLDT = 'gldt-aaaaaaaaaaaaaaaaaaaa';

describe('outbound gldt silence', () => {
  it('packEscalate strips gldt- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GLDT} token`,
      [`use ${GLDT}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/gldt-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips gldt- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GLDT}`, [
      `deploy ${GLDT}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/gldt-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['deploy '],
    });
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${GLDT}`, [`claim ${GLDT}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
