/**
 * Escalate outbound packs must never carry GitHub PAT shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const CLASSIC_PAT = 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FINE_PAT = 'github_pat_11ABCD1234567890_abcdefghijklmnop';

describe('outbound github pat silence', () => {
  it('packEscalate strips ghp_ and github_pat_ from task and claims', () => {
    const packed = packEscalate(
      `rotate ${CLASSIC_PAT} token`,
      [`use ${FINE_PAT}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/ghp_/);
    expect(JSON.stringify(packed)).not.toMatch(/github_pat_/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips ghp_ and github_pat_ from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${CLASSIC_PAT}`, [
      `fine ${FINE_PAT}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/ghp_/);
    expect(JSON.stringify(packed)).not.toMatch(/github_pat_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['fine '],
    });
  });
});
