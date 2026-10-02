/**
 * Escalate outbound packs must never carry GitLab PAT shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GL_PAT = 'glpat-aaaaaaaaaaaaaaaaaaaa';

describe('outbound glpat silence', () => {
  it('packEscalate strips glpat- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GL_PAT} token`,
      [`use ${GL_PAT}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/glpat-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips glpat- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GL_PAT}`, [
      `fine ${GL_PAT}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/glpat-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['fine '],
    });
  });
});
