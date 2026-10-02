/**
 * Escalate outbound packs must never carry npm access token shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const NPM_TOKEN = 'npm_' + 'a'.repeat(36);

describe('outbound npm silence', () => {
  it('packEscalate strips npm_ tokens from task and claims', () => {
    const packed = packEscalate(
      `publish ${NPM_TOKEN} package`,
      [`registry ${NPM_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/npm_/);
    expect(packed.task).toBe('publish  package');
    expect(packed.claims).toEqual(['registry ', 'ok claim']);
  });

  it('outboundFor escalate strips npm_ tokens from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${NPM_TOKEN}`, [
      `auth ${NPM_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/npm_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['auth '],
    });
  });
});
