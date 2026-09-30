/**
 * redact strips secrets. The packet builder runs redact and does not call a vendor.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from '../src/memory/redact';
import { buildPacket } from '../src/memory/packet';

const ROOT = join(__dirname, '..');
const ADDRESS = `0x${'ab'.repeat(20)}`;

describe('memory redact', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('strips sb_secret_, a 0x address, a JWT, and postgresql://', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP';
    const raw = `before sb_secret_abcDEF123 ${ADDRESS} ${jwt} postgresql://user:pass@db.example/app after 0xabc sb_publishable_keep`;
    const cleaned = redact(raw);
    expect(cleaned).not.toMatch(/sb_secret_/);
    expect(cleaned).not.toMatch(/0x[0-9a-fA-F]{40}\b/);
    expect(cleaned).not.toMatch(/postgresql:\/\//i);
    expect(cleaned).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(cleaned).toContain('before');
    expect(cleaned).toContain('after');
    expect(cleaned).toContain('0xabc');
    expect(cleaned).toContain('sb_publishable_keep');
    const bare = redact('prefix eyJhbGciOiJub25lIn0 suffix');
    expect(bare).toContain('prefix');
    expect(bare).toContain('suffix');
    expect(bare).not.toContain('eyJ');
  });

  it('packet builder redacts and does not call a vendor', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('vendor HTTP');
    }) as typeof fetch;
    const sources = ['src/memory/redact.ts', 'src/memory/packet.ts']
      .map((file) => readFileSync(join(ROOT, file), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/fetch\(|https?:\/\/|openai|anthropic|googleapis|from ['"]node:http/);

    const packet = buildPacket({
      kind: 'note',
      body: `note ${ADDRESS} sb_secret_token postgresql://role:pw@localhost/db`,
    });
    expect(packet.kind).toBe('note');
    expect(packet.body).toContain('note');
    expect(packet.body).not.toMatch(/sb_secret_|postgresql:\/\/|0x[0-9a-fA-F]{40}/i);
    expect(calls).toEqual([]);
  });
});
