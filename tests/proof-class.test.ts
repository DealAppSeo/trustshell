/**
 * `trustshell proof`, `proof --json`, the MCP `present_proof` tool and the badge all say what today's proof
 * shows: a validity proof, the score is public, agent binding is weak. Before this, they printed
 * `verified ✓` (and the badge `✓ ZK-verified`) with nothing saying how little that covers.
 *
 * The second half re-measures the class with the REAL WASM verifier on a real proof
 * (fixtures/proof-agent.json), so the words go red when the verifier changes instead of going stale.
 * Only the engine route is mocked.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { createServer } from '../src/mcp/index';
import { proofBadgeStatus, renderProofBadge, renderProofBadgeMarkdown } from '../src/lib/badge';
import { proofClassOf } from '../src/lib/proof-class';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures/proof-agent.json'), 'utf8')) as {
  proof_bytes: string;
  scheme: string;
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string };
  created_at: string;
};
const AGENT = fixture.statement.agent_id;
const PHRASE = 'validity proof; the score is public; agent binding is weak (about 1 in 256 foreign agent ids verify)';

function installEngine(): void {
  global.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/proof')) {
      return new Response(
        JSON.stringify({ proof_bytes: fixture.proof_bytes, scheme: fixture.scheme, statement: fixture.statement, created_at: fixture.created_at }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 503 });
  }) as typeof fetch;
}

function cli(): { io: CliIO; out: string[] } {
  const out: string[] = [];
  return { io: { out: (s) => out.push(s), err: () => {} }, out };
}

describe('proofClassOf says what each proof shows', () => {
  const { repid_score, ...noScore } = fixture.statement;

  it('a statement with the score: the required phrase, the score public, weak binding, tier and time not proven', () => {
    const c = proofClassOf({ scheme: 'plonky3_range_check', proofBytes: 'AQ==', statement: fixture.statement });
    expect(c.summary.startsWith(PHRASE)).toBe(true);
    expect(c).toMatchObject({ kind: 'validity', scoreHidden: false, agentBinding: 'weak', notProven: ['tier', 'time'] });
  });

  it('a statement without the score: leaving it out is not hiding it', () => {
    expect(repid_score).toBeGreaterThan(0);
    const c = proofClassOf({ scheme: 'plonky3_range_check', proofBytes: 'AQ==', statement: noScore });
    expect(c.scoreHidden).toBe(false);
    expect(c.summary).toContain('is not hidden');
  });

  it('no proof bytes is no proof, whatever the scheme says', () => {
    expect(proofClassOf({ scheme: 'plonky3_range_check', proofBytes: '', statement: fixture.statement }).kind).toBe('none');
  });

  it('an unknown or prototype-named scheme gets no class, never a stronger one', () => {
    for (const scheme of ['plonky3_private_eligibility', 'constructor', '__proto__', null]) {
      const c = proofClassOf({ scheme, proofBytes: 'AQ==', statement: fixture.statement });
      expect(c).toMatchObject({ kind: 'unknown', scoreHidden: false, agentBinding: 'unknown' });
    }
  });
});

describe('every surface that presents a proof carries the class', () => {
  const prevFetch = global.fetch;
  afterEach(() => {
    global.fetch = prevFetch;
  });

  // The wording follows the RETURNED statement, not the tier name (Codex on #728): only envelope strips the score.
  it('presentProof sets proofClass from the statement it returns', async () => {
    installEngine();
    const client = new TrustShell({ apiUrl: ENGINE });
    expect((await client.presentProof(AGENT)).proofClass?.summary.startsWith(PHRASE)).toBe(true);
    const env = await client.presentProof(AGENT, { tier: 'envelope' });
    expect(env.statement).not.toHaveProperty('repid_score');
    expect(env.proofClass?.summary).toContain('is not hidden');
    const letter = await client.presentProof(AGENT, { tier: 'letter', allowExperimentalTiers: true });
    expect(letter.statement?.repid_score).toBe(fixture.statement.repid_score);
    expect(letter.proofClass?.summary.startsWith(PHRASE)).toBe(true);
  });

  it('trustshell proof prints a class line, and --json carries the field', async () => {
    installEngine();
    const human = cli();
    expect(await run(parseArgs(['proof', AGENT]), new TrustShell({ apiUrl: ENGINE }), human.io)).toBe(0);
    expect(human.out.join('\n')).toContain(`class     ${PHRASE}`);

    const machine = cli();
    expect(await run(parseArgs(['proof', AGENT, '--json']), new TrustShell({ apiUrl: ENGINE }), machine.io)).toBe(0);
    expect(JSON.parse(machine.out.join('')).proofClass).toMatchObject({ kind: 'validity', scoreHidden: false, agentBinding: 'weak' });
  });

  it('the MCP present_proof result carries the class', async () => {
    installEngine();
    const server: any = createServer(new TrustShell({ apiUrl: ENGINE }));
    const res = await server._registeredTools.present_proof.handler({ agentId: AGENT });
    expect(JSON.parse(res.content[0].text).untrusted_data.proofClass.summary.startsWith(PHRASE)).toBe(true);
  });

  it('the verified badge says verified, not ZK-verified, and carries the class in its caption', async () => {
    installEngine();
    const p = await new TrustShell({ apiUrl: ENGINE }).presentProof(AGENT, { verify: true });
    expect(proofBadgeStatus(p).state).toBe('verified');
    for (const out of [renderProofBadge(p), renderProofBadgeMarkdown(p)]) {
      expect(out).not.toMatch(/ZK|zero[- ]knowledge/i);
      expect(out).toContain(PHRASE);
    }
  }, 30000);
});

describe('the class is re-measured against the real verifier', () => {
  let verify: (bytes: string, st: object) => Promise<{ verified: boolean }>;
  beforeAll(async () => {
    const pkg = '@hyperdag/proof-verifier';
    verify = (await import(pkg)).verify;
  });
  const ok = async (st: object) => (await verify(fixture.proof_bytes, st)).verified;

  it('control: the honest statement verifies', async () => {
    expect(await ok(fixture.statement)).toBe(true);
  }, 30000);

  // Deterministic ids, so the count is a fixed number for a fixed verifier (0.2.0: 4 of 1024).
  // If this reaches 0 the verifier binds the agent, and the class text must change with it.
  it('about 1 in 256 foreign agent ids verify', async () => {
    const id = (i: number) => {
      const h = createHash('sha256').update(`foreign-agent-${i}`).digest('hex');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    };
    let hits = 0;
    for (let i = 0; i < 1024; i += 1) if (await ok({ ...fixture.statement, agent_id: id(i) })) hits += 1;
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(16);
  }, 120000);

  it('the score is bound (only the true score verifies nearby) and so recoverable by search', async () => {
    const s = fixture.statement.repid_score;
    const found: number[] = [];
    for (let k = s - 50; k <= s + 50; k += 1) if (await ok({ ...fixture.statement, repid_score: k })) found.push(k);
    expect(found).toEqual([s]);
  }, 60000);

  it('the tier label and a time are not proven: changing or adding them still verifies', async () => {
    expect(Object.keys(fixture.statement).sort()).toEqual(['agent_id', 'repid_score', 'threshold', 'tier']);
    expect(await ok({ ...fixture.statement, tier: 'VETERAN' })).toBe(true);
    expect(await ok({ ...fixture.statement, valid_until: '2000-01-01T00:00:00Z' })).toBe(true);
  }, 30000);
});
