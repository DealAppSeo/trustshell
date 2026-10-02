/**
 * Escalate outbound packs must never carry GitLab OAuth application secret shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GLOAS_SECRET = 'gloas-' + 'a'.repeat(36);

describe('outbound gloas silence', () => {
  it('packEscalate strips gloas- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GLOAS_SECRET} token`,
      [`use ${GLOAS_SECRET}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/gloas-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips gloas- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GLOAS_SECRET}`, [
      `secret ${GLOAS_SECRET}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/gloas-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['secret '],
    });
  });
});
