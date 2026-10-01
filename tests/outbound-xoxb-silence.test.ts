/**
 * Slack bot tokens (xoxb-) are stripped from escalate outbound packs.
 * This is outbound-only: the remember path is intentionally not covered here.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';
import { redact } from '../src/memory/redact';

// Assemble the prefix at runtime so the test file does not commit a full token literal.
const TOKEN = ['xoxb', '123456789012', '1234567890123', 'AbCdEfGhIjKlMnOpQrStUvWx'].join('-');

describe('outbound xoxb silence', () => {
  it('redact removes a Slack bot token shape', () => {
    const cleaned = redact(`prefix ${TOKEN} suffix`);
    expect(cleaned).not.toContain('xoxb-');
    expect(cleaned).not.toContain(TOKEN);
    expect(cleaned).toContain('prefix');
    expect(cleaned).toContain('suffix');
  });

  it('packEscalate never emits xoxb- in the packed JSON', () => {
    const packed = packEscalate(`alert ${TOKEN}`, [`token is ${TOKEN} done`]);
    const json = JSON.stringify(packed);
    expect(json).not.toContain('xoxb-');
    expect(json).not.toContain(TOKEN);
    expect(packed.task).toBe('alert ');
    expect(packed.claims).toEqual(['token is  done']);
  });

  it('outboundFor escalate never emits xoxb- in the packed JSON', () => {
    const packed = outboundFor('escalate', `alert ${TOKEN}`, [`token is ${TOKEN} done`]);
    expect(packed).not.toBeNull();
    const json = JSON.stringify(packed);
    expect(json).not.toContain('xoxb-');
    expect(json).not.toContain(TOKEN);
  });
});
