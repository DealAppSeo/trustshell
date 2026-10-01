/**
 * Secret shapes never leave in a vendor JSON body.
 * The values below are fakes.
 */
import { TrustShell } from '../src/lib/trustshell';
import { createServer } from '../src/mcp';

const SECRET = 'sb_secret_FAKE';
const POSTGRES = 'postgresql://fake:fake@localhost/db';
const EYJ = 'eyJhbGciOiJub25lIn0';
const CLAIM = `ship the receipt ${SECRET} ${POSTGRES} ${EYJ} done`;

function halOk(): Response {
  return new Response(
    JSON.stringify({
      decision: 'clean',
      hal_score: 0.1,
      mode: 'fact-check',
      signals: { families_used: 1, providers_used: 1 },
      provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function getTool(server: { _registeredTools?: Record<string, { handler: (args: unknown) => Promise<unknown> }> }, name: string) {
  const tool = server._registeredTools?.[name];
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe('vendor packets drop secret shapes', () => {
  const prevFetch = global.fetch;
  let bodies: string[] = [];

  beforeEach(() => {
    bodies = [];
    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body);
      return halOk();
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
  });

  function expectClean(raw: string): void {
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('sb_secret_');
    expect(raw).not.toContain('postgresql://');
    expect(raw).not.toContain('eyJ');
    expect(raw).toContain('ship the receipt');
    expect(raw).toContain('done');
  }

  it('strips a fake secret from the verify POST body', async () => {
    const shell = new TrustShell({ apiUrl: 'https://engine.test' });
    await shell.score(CLAIM);
    expect(bodies).toHaveLength(1);
    expectClean(bodies[0] as string);
    expect(JSON.parse(bodies[0] as string).strictness).toBe(2);
  });

  it('strips a fake secret from MCP verify_output args before the outbound JSON', async () => {
    const server = createServer(new TrustShell({ apiUrl: 'https://engine.test' })) as unknown as {
      _registeredTools?: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
    };
    await getTool(server, 'verify_output').handler({ text: CLAIM });
    expect(bodies).toHaveLength(1);
    expectClean(bodies[0] as string);
  });

  it('strips a fake secret from the MCP verify claim before the posted body', async () => {
    const server = createServer(new TrustShell({ apiUrl: 'https://engine.test' })) as unknown as {
      _registeredTools?: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
    };
    await getTool(server, 'verify').handler({ text: CLAIM });
    expect(bodies).toHaveLength(1);
    expectClean(bodies[0] as string);
  });
});
