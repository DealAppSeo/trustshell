/**
 * Escalate outbound packs must never carry GitHub App server-to-server tokens.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const APP_SERVER_TOKEN = 'ghs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('outbound ghs silence', () => {
  it('packEscalate strips ghs_ from task and claims', () => {
    const packed = packEscalate(
      `rotate ${APP_SERVER_TOKEN} token`,
      [`use ${APP_SERVER_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/ghs_/);
    expect(packed.task).toBe('rotate  token');
    expect(packed.claims).toEqual(['use ', 'ok claim']);
  });

  it('outboundFor escalate strips ghs_ from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${APP_SERVER_TOKEN}`, [
      `app ${APP_SERVER_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/ghs_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['app '],
    });
  });
});
