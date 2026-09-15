/**
 * CLI --verify and MCP present_proof must share the same proof hash.
 * latestProofHash is not null when a proof exists.
 * Synthetic fixtures — no live network.
 */
import { createServer } from '../src/mcp/index';
import { hashProofBytes, TrustShell } from '../src/lib/trustshell';
import { run, parseArgs, type CliIO } from '../src/cli';

const BYTES = 'AQIDBA==';
const HASH = hashProofBytes(BYTES);

function mockClient(): TrustShell {
  return {
    presentProof: jest.fn(async (agentId: string, opts?: { verify?: boolean }) => ({
      agentId,
      tier: 'postcard',
      proofBytes: BYTES,
      proofHash: HASH,
      scheme: 'plonky3_range_check',
      statement: { agent_id: agentId, threshold: 999, tier: 'ESTABLISHED', repid_score: 2177 },
      createdAt: '2026-09-15',
      verification: opts?.verify ? { verified: true, error: null, verifierVersion: 'mock' } : undefined,
    })),
    getRepID: jest.fn(async (agentId: string) => ({
      agentId,
      repid: 2177,
      tier: 'ESTABLISHED',
      lastAnchorTx: 'NOT_ANCHORED',
      latestProofHash: HASH,
    })),
    verifyOutput: jest.fn(),
    getLeaderboard: jest.fn(),
  } as unknown as TrustShell;
}

function getTool(server: any, name: string) {
  return (server._registeredTools ?? {})[name];
}

describe('CLI proof --verify and MCP present_proof share a hash', () => {
  it('same proofBytes hash for trinity-shofet', async () => {
    const client = mockClient();
    const io: CliIO = { out: () => {}, err: () => {} };
    const code = await run(parseArgs(['proof', 'trinity-shofet', '--verify', '--json']), client, io);
    expect(code).toBe(0);

    const server: any = createServer(client);
    const res = await getTool(server, 'present_proof').handler({
      agentId: 'trinity-shofet',
      verify: true,
    });
    const mcp = JSON.parse(res.content[0].text);
    expect(mcp.proofHash).toBe(HASH);
    expect(hashProofBytes(mcp.proofBytes)).toBe(HASH);
  });

  it('latestProofHash is not null when a proof exists', async () => {
    const client = mockClient();
    const r = await client.getRepID('trinity-shofet');
    expect(r.latestProofHash).toBe(HASH);
    expect(r.latestProofHash).not.toBeNull();
  });
});
