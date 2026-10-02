/**
 * Escalate outbound packs must never carry GitLab runner authentication tokens.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GLRT_TOKEN = 'glrt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('outbound glrt silence', () => {
  it('packEscalate strips glrt- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GLRT_TOKEN} token`,
      [`use ${GLRT_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/glrt-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips glrt- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GLRT_TOKEN}`, [
      `fine ${GLRT_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/glrt-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['fine '],
    });
  });
});
