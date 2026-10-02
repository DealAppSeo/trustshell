/**
 * Escalate outbound packs must never carry GitLab pipeline trigger-token shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const TRIGGER = 'glptt-' + 'a'.repeat(20);

describe('outbound glptt silence', () => {
  it('packEscalate strips glptt- from task and claims', () => {
    const packed = packEscalate(
      `trigger ${TRIGGER} pipeline`,
      [`use ${TRIGGER}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/glptt-/);
    expect(packed.task).toBe('trigger  pipeline');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips glptt- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${TRIGGER}`, [
      `trigger ${TRIGGER}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/glptt-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['trigger '],
    });
  });
});
