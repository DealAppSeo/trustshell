/**
 * MCP server — no-network unit tests.
 *
 * Verifies the server constructs and registers exactly the three advertised tools, and that each
 * tool's handler delegates to the injected SDK client (a mock — NO live backend). Mirrors the CLI
 * test's injectable-client pattern so tool wiring is provable without hitting the network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, makeClient, MCP_VERSION } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';

/** Minimal mock TrustShell — only the methods the MCP tools call. Cast to satisfy the type. */
function mockClient(overrides: Partial<Record<string, any>> = {}): TrustShell {
  return {
    verifyOutput: jest.fn(async () => ({
      ok: true, verdict: 'PASS', trustScore: 90, halScore: 0.1, soft: false,
      signals: {}, decisionReason: 'PASS (mock)', evidence: ['groq:TRUE'],
    })),
    getLeaderboard: jest.fn(async (board: string) =>
      board === 'agents'
        ? { kind: 'agents', agents: [], totalAgents: 0, lastUpdated: 'x' }
        : { kind: 'models', metric: 'm', disclaimer: 'd', lenses: {}, narrative: 'n', lastUpdated: 'x' }),
    getRepID: jest.fn(async (agentId: string) => ({
      agentId, repid: 1000, tier: 'ESTABLISHED', lastAnchorTx: null, latestProofHash: null,
    })),
    presentProof: jest.fn(async (agentId: string, opts?: { verify?: boolean }) => ({
      agentId,
      tier: 'postcard',
      proofBytes: 'Yg==',
      scheme: 'plonky3_range_check',
      statement: { agent_id: agentId, threshold: 999, tier: 'ESTABLISHED' },
      createdAt: null,
      verification: opts?.verify ? { verified: true, error: null, verifierVersion: 'mock' } : undefined,
    })),
    verifyProof: jest.fn(async () => ({ verified: true, error: null, verifierVersion: 'mock' })),
    ...overrides,
  } as unknown as TrustShell;
}

/** Reach into the McpServer's registered-tool map (white-box) to invoke a tool's handler. */
function getTool(server: any, name: string) {
  const tools = server._registeredTools ?? {};
  return tools[name];
}

describe('trustshell MCP server', () => {
  it('registers the advertised tools including present_proof', () => {
    const server: any = createServer(mockClient());
    const names = Object.keys(server._registeredTools ?? {}).sort();
    expect(names).toEqual([
      'evaluate',
      'getLeaderboard',
      'getRepID',
      'get_repid',
      'present_proof',
      'recall',
      'redact',
      'remember',
      'repid',
      'status',
      'verify',
      'verify_output',
      'verify_proof',
    ]);
    expect(names).not.toContain('stake');
  });

  // The camelCase names are PUBLISHED (1.4.0 is live on npm), so dropping one is a breaking
  // change for every agent config already pointing at it. This pins that the snake_case
  // additions did not quietly become renames.
  it('keeps the published camelCase names as aliases, not renames', () => {
    const server: any = createServer(mockClient());
    for (const legacy of ['verify', 'evaluate', 'getLeaderboard', 'getRepID']) {
      expect(getTool(server, legacy)).toBeDefined();
    }
  });

  it('verify_output is the canonical name for verify and hits the same SDK call', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const r = await getTool(server, 'verify_output').handler({ text: 'claim' });
    expect((client as any).verifyOutput).toHaveBeenCalledWith('claim');
    expect(JSON.parse(r.content[0].text).verdict).toBe('PASS');
  });

  it('get_repid passes the agentId through, same as getRepID', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const r = await getTool(server, 'get_repid').handler({ agentId: 'trinity-shofet' });
    expect((client as any).getRepID).toHaveBeenCalledWith('trinity-shofet');
    expect(JSON.parse(r.content[0].text).tier).toBe('ESTABLISHED');
  });

  it('repid is the same lookup as get_repid', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const r = await getTool(server, 'repid').handler({ agentId: 'trinity-shofet' });
    expect((client as any).getRepID).toHaveBeenCalledWith('trinity-shofet');
    expect(JSON.parse(r.content[0].text).repid).toBe(1000);
  });

  it('verify_proof delegates to client.verifyProof for a presentation', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const presentation = { proofBytes: 'Yg==', statement: { agent_id: 'a' } };
    const r = await getTool(server, 'verify_proof').handler({ presentation });
    expect((client as any).verifyProof).toHaveBeenCalledWith(presentation);
    expect(JSON.parse(r.content[0].text).verified).toBe(true);
  });

  it('verify_proof accepts raw proofBytes + statement', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    await getTool(server, 'verify_proof').handler({ proofBytes: 'Yg==', statement: { agent_id: 'a' } });
    expect((client as any).verifyProof).toHaveBeenCalledWith('Yg==', { agent_id: 'a' });
  });

  // Refusing beats guessing: verifyProof(undefined) throws deep in the WASM path with a message
  // that never names the caller's mistake.
  it('verify_proof refuses with a named error when given neither input', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const r = await getTool(server, 'verify_proof').handler({});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/presentation.*proofBytes/);
    expect((client as any).verifyProof).not.toHaveBeenCalled();
  });

  // status calls src/cli/status.ts so the MCP answer and `trustshell status` cannot drift.
  // OFFLINE=1 is that module's own no-network path and returns NOT_CHECKED lines — which must
  // survive as NOT_CHECKED, never be collapsed into a pass.
  it('status reports NOT_CHECKED offline rather than a pass', async () => {
    const prev = process.env.OFFLINE;
    process.env.OFFLINE = '1';
    try {
      const server: any = createServer(mockClient());
      const r = await getTool(server, 'status').handler({});
      expect(r.isError).toBeUndefined();
      expect(JSON.parse(r.content[0].text).status).toContain('NOT_CHECKED');
    } finally {
      if (prev === undefined) delete process.env.OFFLINE;
      else process.env.OFFLINE = prev;
    }
  });

  // Deliberately NOT a hardcoded literal — a literal is exactly the bug this
  // pins against (MCP_VERSION sat at '1.2.0' through the 1.3.0 release,
  // because a hardcoded assertion would have stayed green while it drifted).
  // Reads package.json independently and compares, mirroring cli.test.ts's
  // 'reported version' suite for the same fix on the CLI side.
  it('reports the actual installed package version, not a stale literal', () => {
    const pkgVersion = (
      JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
    ).version;
    expect(MCP_VERSION).toBe(pkgVersion);
    expect(MCP_VERSION).not.toBe('unknown');
  });

  it('makeClient builds a TrustShell without throwing', () => {
    expect(makeClient()).toBeInstanceOf(TrustShell);
  });

  it('evaluate tool is an alias of verify', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const tool = getTool(server, 'evaluate');
    const res = await tool.handler({ text: 'The capital of France is Paris.' });
    expect((client.verifyOutput as jest.Mock)).toHaveBeenCalledWith('The capital of France is Paris.');
    expect(JSON.parse(res.content[0].text).verdict).toBe('PASS');
  });

  it('verify tool delegates to client.verifyOutput and returns a JSON text block', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const tool = getTool(server, 'verify');
    const res = await tool.handler({ text: 'The Eiffel Tower is in Paris.' });
    expect((client.verifyOutput as jest.Mock)).toHaveBeenCalledWith('The Eiffel Tower is in Paris.');
    expect(res.content[0].type).toBe('text');
    expect(JSON.parse(res.content[0].text).verdict).toBe('PASS');
  });

  it('getLeaderboard tool passes the board arg through to the client', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const tool = getTool(server, 'getLeaderboard');
    const res = await tool.handler({ board: 'agents' });
    expect((client.getLeaderboard as jest.Mock)).toHaveBeenCalledWith('agents');
    expect(JSON.parse(res.content[0].text).kind).toBe('agents');
  });

  it('getRepID tool passes the agentId through to the client', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const tool = getTool(server, 'getRepID');
    const res = await tool.handler({ agentId: 'agent-123' });
    expect((client.getRepID as jest.Mock)).toHaveBeenCalledWith('agent-123');
    expect(JSON.parse(res.content[0].text).tier).toBe('ESTABLISHED');
  });

  it('present_proof delegates to client.presentProof with verify', async () => {
    const client = mockClient();
    const server: any = createServer(client);
    const tool = getTool(server, 'present_proof');
    const res = await tool.handler({ agentId: 'trinity-shofet', verify: true });
    expect((client.presentProof as jest.Mock)).toHaveBeenCalledWith('trinity-shofet', { verify: true });
    expect(JSON.parse(res.content[0].text).verification.verified).toBe(true);
  });

  it('surfaces client errors as an isError result (never throws to the transport)', async () => {
    const client = mockClient({
      getRepID: jest.fn(async () => { throw new Error('backend down'); }),
    });
    const server: any = createServer(client);
    const tool = getTool(server, 'getRepID');
    const res = await tool.handler({ agentId: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('backend down');
  });
});
