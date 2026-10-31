/**
 * A valid proof is not proof about the agent you ASKED about.
 *
 * The WASM verifier answers "does this proof match this statement". It does not know who the caller
 * meant. Before this was bound, `presentProof('B', { verify: true })` against a proof whose statement
 * names agent A verified, and `trustshell badge B` rendered "RepID >= N ✓ ZK-verified" in green under
 * B's name with exit 0. The browser extension had the right check (extension/agent.js,
 * `statement_for_other_agent`); this pins the SDK, the badge and the CLI to the same behavior.
 *
 * Real WASM verifier, real proof (fixtures/proof-agent.json: valid for agent PROVEN). Only the engine
 * routes are mocked, so a green here can only come from the code under test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { proofBadgeStatus, renderProofBadge } from '../src/lib/badge';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures/proof-agent.json'), 'utf8')) as {
  agentId: string;
  proof_bytes: string;
  scheme: string;
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string };
  created_at: string;
};
const PROVEN = fixture.statement.agent_id; // the agent the proof is genuinely about
const OTHER = 'the-agent-you-asked-about';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** `resolves`: what `/api/v1/repid/<id>?with=id` answers for the asked id (undefined = the engine cannot say). */
function installEngine(resolves: Record<string, string | undefined> = {}): string[] {
  const seen: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith('/proof')) {
      return json(200, {
        agent_id: PROVEN,
        proof_bytes: fixture.proof_bytes,
        scheme: fixture.scheme,
        statement: fixture.statement,
        created_at: fixture.created_at,
      });
    }
    const m = url.match(/\/api\/v1\/repid\/([^/?]+)\?with=id$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      return resolves[id] ? json(200, { score: 1, tier: 'ESTABLISHED', agent_id: resolves[id] }) : json(404, {});
    }
    return json(503, {});
  }) as typeof fetch;
  return seen;
}

function cli(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const client = () => new TrustShell({ apiUrl: ENGINE });

describe('presentProof / verifyProof bind the statement to the agent that was asked about', () => {
  const prevFetch = global.fetch;
  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('a valid proof for ANOTHER agent is not verified: statement_for_other_agent', async () => {
    installEngine({ [OTHER]: OTHER });
    const p = await client().presentProof(OTHER, { verify: true });
    expect(p.verification?.verified).toBe(false);
    expect(p.verification?.reason).toBe('statement_for_other_agent');
    expect(p.verification?.error).toContain('statement_for_other_agent');
  }, 30000);

  it('the same proof is verified for the agent it is about, named by its id (no extra lookup)', async () => {
    const seen = installEngine();
    const p = await client().presentProof(PROVEN, { verify: true });
    expect(p.verification?.verified).toBe(true);
    expect(seen.some((u) => u.includes('?with=id'))).toBe(false);
  }, 30000);

  it('and for the agent it is about, named by a slug the engine resolves to that id', async () => {
    const seen = installEngine({ 'trinity-slug': PROVEN });
    const p = await client().presentProof('trinity-slug', { verify: true });
    expect(p.verification?.verified).toBe(true);
    expect(seen).toContain(`${ENGINE}/api/v1/repid/trinity-slug?with=id`);
  }, 30000);

  it('a slug the engine cannot resolve is NOT_CHECKED (binding_unavailable), never verified', async () => {
    installEngine({}); // 404 for the slug
    const p = await client().presentProof('trinity-slug', { verify: true });
    expect(p.verification?.verified).toBe(false);
    expect(p.verification?.reason).toBe('binding_unavailable');
  }, 30000);

  it('a lookup that throws is also NOT_CHECKED, never verified', async () => {
    installEngine();
    const real = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('?with=id')) throw new Error('network down');
      return real(input, init);
    }) as typeof fetch;
    const p = await client().presentProof('trinity-slug', { verify: true });
    expect(p.verification).toMatchObject({ verified: false, reason: 'binding_unavailable' });
  }, 30000);

  it('ids are normalized like the extension does: surrounding whitespace is not a mismatch', async () => {
    installEngine();
    const v = await client().verifyProof({
      agentId: `  ${PROVEN}  `,
      tier: 'postcard',
      proofBytes: fixture.proof_bytes,
      scheme: fixture.scheme,
      statement: fixture.statement,
      createdAt: fixture.created_at,
      signer: null,
      note: 'not a registry aggregate',
      reasons: {},
    });
    expect(v.verified).toBe(true);
  }, 30000);

  it('verifyProof(presentation) enforces the same binding', async () => {
    installEngine({ [OTHER]: OTHER });
    const v = await client().verifyProof({
      agentId: OTHER,
      tier: 'postcard',
      proofBytes: fixture.proof_bytes,
      scheme: fixture.scheme,
      statement: fixture.statement,
      createdAt: fixture.created_at,
      signer: null,
      note: 'not a registry aggregate',
      reasons: {},
    });
    expect(v).toMatchObject({ verified: false, reason: 'statement_for_other_agent' });
  }, 30000);

  it('verifyProof(bytes, statement) names no agent, so there is nothing to bind: unchanged', async () => {
    installEngine();
    const v = await client().verifyProof(fixture.proof_bytes, fixture.statement);
    expect(v.verified).toBe(true);
  }, 30000);
});

describe('badge never renders green for a proof about a different agent', () => {
  const prevFetch = global.fetch;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  it('badge state: other agent -> failed/red; binding unavailable -> unverified/grey', async () => {
    installEngine({ [OTHER]: OTHER });
    const other = await client().presentProof(OTHER, { verify: true });
    const red = proofBadgeStatus(other);
    expect(red.state).toBe('failed');
    expect(red.color).toBe('#d1242f');
    expect(red.detail).toContain('statement_for_other_agent');
    expect(renderProofBadge(other)).not.toContain('ZK-verified');

    const unresolved = await client().presentProof('trinity-slug', { verify: true });
    const grey = proofBadgeStatus(unresolved);
    expect(grey.state).toBe('unverified');
    expect(grey.value).not.toMatch(/✓/);
  }, 30000);

  it('CLI badge for another agent: no green, non-zero exit, says why', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    installEngine({ [OTHER]: OTHER });
    const { io, out, err } = cli();
    const code = await run(parseArgs(['badge', OTHER]), client(), io);
    expect(code).toBe(EXIT.RUNTIME);
    expect(out.join('')).not.toContain('ZK-verified');
    expect(out.join('')).not.toContain('#3fb950');
    expect(err.join('\n')).toContain('statement_for_other_agent');
  }, 30000);

  it('CLI badge for an agent that cannot be resolved: no green, non-zero exit', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    installEngine({});
    const { io, out } = cli();
    const code = await run(parseArgs(['badge', 'trinity-slug']), client(), io);
    expect(code).not.toBe(EXIT.OK);
    expect(out.join('')).not.toContain('ZK-verified');
  }, 30000);

  it('CLI proof --verify for another agent exits non-zero too', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    installEngine({ [OTHER]: OTHER });
    const { io, err } = cli();
    const code = await run(parseArgs(['proof', OTHER, '--verify']), client(), io);
    expect(code).toBe(EXIT.RUNTIME);
    expect(err.join('\n')).toMatch(/NOT verified/);
  }, 30000);

  it('CLI badge for the agent the proof is about is still green, exit 0', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    installEngine();
    const { io, out } = cli();
    const code = await run(parseArgs(['badge', PROVEN]), client(), io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('')).toContain('ZK-verified');
  }, 30000);
});
