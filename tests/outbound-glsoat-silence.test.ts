/**
 * Escalate outbound packs must never carry GitLab SCIM / service-account OAuth tokens.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GLSOAT_TOKEN = 'glsoat-aaaaaaaaaaaaaaaaaaaa';

describe('outbound glsoat silence', () => {
  it('packEscalate strips glsoat- from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GLSOAT_TOKEN} token`,
      [`use ${GLSOAT_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/glsoat-/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips glsoat- from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GLSOAT_TOKEN}`, [
      `fine ${GLSOAT_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/glsoat-/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['fine '],
    });
  });
});
