/**
 * A flipped proof byte must exit 3.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
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

describe('proof --verify flipped byte', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('exits 3', async () => {
    const buf = Buffer.from(fixture.proof_bytes, 'base64');
    buf[0] ^= 0x01;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          proof_bytes: buf.toString('base64'),
          scheme: fixture.scheme,
          statement: fixture.statement,
          created_at: fixture.created_at,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const err: string[] = [];
    const io: CliIO = { out: () => undefined, err: (s) => err.push(s) };
    const code = await run(
      parseArgs(['proof', fixture.agentId, '--verify']),
      new TrustShell({ apiUrl: ENGINE }),
      io,
    );
    expect(code).toBe(3);
    expect(err.join('\n')).toMatch(/NOT verified/);
  }, 20000);
});
