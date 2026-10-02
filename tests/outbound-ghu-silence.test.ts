/**
 * Escalate outbound packs must never carry GitHub App user-to-server tokens.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const GHU_TOKEN = 'ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('outbound ghu silence', () => {
  it('packEscalate strips ghu_ from task and claims', () => {
    const packed = packEscalate(
      `rotate ${GHU_TOKEN} token`,
      [`use ${GHU_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/ghu_/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips ghu_ from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${GHU_TOKEN}`, [
      `fine ${GHU_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/ghu_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['fine '],
    });
  });
});
