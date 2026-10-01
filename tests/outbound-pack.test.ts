/**
 * Escalate packing returns redacted task and claims. Ask returns nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outboundFor, packEscalate } from '../src/memory/outbound';

const src = readFileSync(join(__dirname, '../src/memory/outbound.ts'), 'utf8');
const ADDRESS = `0x${'ab'.repeat(20)}`;

describe('outbound pack', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('escalate gets task and claims, ask gets nothing, and nothing is sent', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${String(input)}`);
      throw new Error('network');
    }) as typeof fetch;
    expect(src).not.toMatch(/\bPOST\b|fetch\(|https?:\/\/|writeFile/);
    expect(src).not.toMatch(/stake live|stake now/i);

    const packed = packEscalate(`ship ${ADDRESS}`, [
      `claim sb_secret_token postgresql://role:pw@localhost/db`,
    ]);
    expect(Object.keys(packed).sort()).toEqual(['claims', 'task']);
    expect(packed.task).toBe('ship ');
    expect(packed.claims).toEqual(['claim  ']);
    expect(JSON.stringify(packed)).not.toMatch(/sb_secret_|postgresql:\/\/|0x[0-9a-fA-F]{40}/i);
    expect(packed).not.toHaveProperty('id');
    expect(packed).not.toHaveProperty('kind');
    expect(packed).not.toHaveProperty('body');
    expect(packed).not.toHaveProperty('created_at');
    expect(outboundFor('cheap')).toBeNull();
    expect(outboundFor('ask', 'ignored', ['ignored'])).toBeNull();
    expect(outboundFor('escalate', `ship ${ADDRESS}`, [`claim sb_secret_token`])).toEqual({
      task: 'ship ',
      claims: ['claim '],
    });
    expect(calls).toEqual([]);
  });

  it('redacts Authorization: Bearer tokens and sk- keys from escalate packs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP';
    const sk = 'sk-live-abc123def456';
    const task = `call api Authorization: Bearer ${jwt}`;
    const claims = [`apiKey: ${sk}`, `token Bearer ${jwt} done`];

    const packed = packEscalate(task, claims);
    expect(packed.task).not.toMatch(/\bBearer\s+\S+/);
    expect(packed.task).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(packed.claims[0]).not.toMatch(/\bsk-[A-Za-z0-9_\-]+/);
    expect(packed.claims[1]).not.toMatch(/\bBearer\s+\S+/);
    expect(JSON.stringify(packed)).not.toMatch(/\bBearer\s+\S+/);
    expect(JSON.stringify(packed)).not.toMatch(/\bsk-[A-Za-z0-9_\-]+/);
    expect(JSON.stringify(packed)).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);

    const viaOutbound = outboundFor('escalate', task, claims);
    expect(viaOutbound).toEqual(packed);
    expect(JSON.stringify(viaOutbound)).not.toMatch(/\bBearer\s+\S+/);
    expect(JSON.stringify(viaOutbound)).not.toMatch(/\bsk-[A-Za-z0-9_\-]+/);
  });
});
