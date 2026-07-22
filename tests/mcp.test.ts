/**
 * MCP server — no-network unit tests.
 *
 * Verifies the server constructs and registers exactly the three advertised tools, and that each
 * tool's handler delegates to the injected SDK client (a mock — NO live backend). Mirrors the CLI
 * test's injectable-client pattern so tool wiring is provable without hitting the network.
 */
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
    ...overrides,
  } as unknown as TrustShell;
}

/** Reach into the McpServer's registered-tool map (white-box) to invoke a tool's handler. */
function getTool(server: any, name: string) {
  const tools = server._registeredTools ?? {};
  return tools[name];
}

describe('trustshell MCP server', () => {
  it('registers exactly the three advertised tools', () => {
    const server: any = createServer(mockClient());
    const names = Object.keys(server._registeredTools ?? {}).sort();
    expect(names).toEqual(['getLeaderboard', 'getRepID', 'verify']);
  });

  it('exposes version 1.2.0', () => {
    expect(MCP_VERSION).toBe('1.2.0');
  });

  it('makeClient builds a TrustShell without throwing', () => {
    expect(makeClient()).toBeInstanceOf(TrustShell);
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
