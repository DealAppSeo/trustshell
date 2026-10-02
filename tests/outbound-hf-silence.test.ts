/**
 * Escalate outbound packs must never carry Hugging Face API token shapes.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const HF_TOKEN = 'hf_' + 'a'.repeat(34);

describe('outbound huggingface silence', () => {
  it('packEscalate strips hf_ tokens from task and claims', () => {
    const packed = packEscalate(
      `download ${HF_TOKEN} model`,
      [`auth ${HF_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/hf_/);
    expect(packed.task).toBe('download  model');
    expect(packed.claims).toEqual(['auth ', 'ok claim']);
  });

  it('outboundFor escalate strips hf_ tokens from the packed JSON', () => {
    const packed = outboundFor('escalate', `token ${HF_TOKEN}`, [
      `auth ${HF_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/hf_/);
    expect(packed).toEqual({
      task: 'token ',
      claims: ['auth '],
    });
  });
});
