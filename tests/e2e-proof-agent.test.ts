/**
 * proof --verify on a fixture agent id. One flipped proof byte fails.
 * The postcard is local. This file does not call the live engine.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

type ProofFixture = {
  agentId: string;
  proof_bytes: string;
  scheme: string;
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string };
  created_at: string;
};

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/proof-agent.json'), 'utf8'),
) as ProofFixture;

function flipByte(proofBytes: string): string {
  const buf = Buffer.from(proofBytes, 'base64');
  buf[0] ^= 0x01;
  return buf.toString('base64');
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(proofBytes: string): void {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const expected = `${ENGINE}/api/v1/repid/${encodeURIComponent(fixture.agentId)}/proof`;
    if (url !== expected) throw new Error(`unexpected fetch ${url}`);
    return jsonResponse({
      proof_bytes: proofBytes,
      scheme: fixture.scheme,
      statement: fixture.statement,
      created_at: fixture.created_at,
    });
  }) as typeof fetch;
}

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('e2e proof --verify on a fixture agent', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('verifies the fixture and fails when one byte is flipped', async () => {
    const client = new TrustShell({ apiUrl: ENGINE });
    const args = parseArgs(['proof', fixture.agentId, '--verify']);

    installFetch(fixture.proof_bytes);
    const okCap = capture();
    const ok = await run(args, client, okCap.io);
    const okText = okCap.out.join('\n');
    expect(ok).toBe(EXIT.OK);
    expect(okText).toContain(fixture.agentId);
    expect(okText).toMatch(/verified\s+✓/);
    expect(okCap.err.join('\n')).not.toMatch(/NOT verified/);

    installFetch(flipByte(fixture.proof_bytes));
    const badCap = capture();
    const bad = await run(args, client, badCap.io);
    expect(bad).toBe(EXIT.RUNTIME);
    expect(badCap.err.join('\n')).toMatch(/proof was NOT verified/);
    expect(badCap.out.join('\n')).not.toMatch(/verified\s+✓/);
  }, 20000);
});
