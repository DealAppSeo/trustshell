/**
 * Escalate outbound packs must never carry GitLab Agent for Kubernetes tokens.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GLAGENT = 'glagent-' + 'a'.repeat(20);

describe('outbound glagent silence', () => {
  it('packEscalate strips glagent- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GLAGENT} token`,
      [`use ${GLAGENT}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/glagent-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips glagent- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GLAGENT}`, [
      `refresh ${GLAGENT}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/glagent-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['refresh '],
    });
  });
});
