/**
 * A miss never reads as a pass.
 *
 * Until 1.5.0, score() mapped every HAL answer except 'vetoed' and 'flagged' to PASS: an
 * 'abstain', a missing decision, an unknown one, and the extractor fallback that consulted no
 * provider all printed "✓ PASS trust 100/100" and exited 0. ok was true, and wrapExecute with
 * onUnavailable:'withhold' released the output. These tests pin the fourth state, NOT_CHECKED,
 * through every place that decides something from a verdict.
 */
import { TrustShell, verdictFromHal, type ScoreResult } from '../src/lib/trustshell';
import { wrapExecute, type HalScorer } from '../src/lib/wrap-execute';
import { parseArgs, run, EXIT, verdictExitCode, formatVerdictLine, formatVerify, type CliIO } from '../src/cli';

const ENGINE = 'https://engine.test';

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function halReturns(body: unknown): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const realFetch = global.fetch;
const realLaya = process.env.TRUSTSHELL_LAYA;
beforeEach(() => {
  delete process.env.TRUSTSHELL_LAYA;
});
afterAll(() => {
  global.fetch = realFetch;
  if (realLaya === undefined) delete process.env.TRUSTSHELL_LAYA;
  else process.env.TRUSTSHELL_LAYA = realLaya;
});

describe('verdictFromHal: only decisions HAL made are verdicts', () => {
  it.each([
    [{ decision: 'vetoed' }, 'VETO'],
    [{ decision: 'flagged' }, 'FLAG'],
    [{ decision: 'clean' }, 'PASS'],
    [{ hal_verdict: 'PASS' }, 'PASS'],
    [{ hal_verdict: 'VETO' }, 'VETO'],
  ])('%j → %s', (body, want) => {
    expect(verdictFromHal(body)).toBe(want);
  });

  it.each([
    [{ decision: 'abstain' }],
    [{}],
    [{ decision: 'something-new' }],
    [{ decision: null }],
    [{ decision: 'clean', mode: 'extractor-fallback' }],
    [{ decision: 'flagged', mode: 'extractor' }],
    [{ decision: 'clean', degraded_mode: true }],
  ])('%j → NOT_CHECKED, never PASS', (body) => {
    expect(verdictFromHal(body)).toBe('NOT_CHECKED');
  });
});

describe('a veto nobody voted for is not a veto', () => {
  // The audit's case: all three checkers answered UNCERTAIN, the server's score mode turned that
  // into hal_score 0.5 >= its 0.5 threshold, and `verify` printed VETO 50/100 for a claim nobody
  // judged false.
  const uncertain = (n: number) => Array.from({ length: n }, (_, i) => ({ provider: `p${i}`, verdict: 'UNCERTAIN' }));

  it('all UNCERTAIN, decision vetoed → NOT_CHECKED', () => {
    expect(verdictFromHal({ decision: 'vetoed', hal_score: 0.5, provider_responses: uncertain(3) } as never)).toBe('NOT_CHECKED');
  });
  it('all UNCERTAIN or ERROR, decision clean → NOT_CHECKED, never PASS', () => {
    expect(verdictFromHal({ decision: 'clean', provider_responses: [...uncertain(2), { provider: 'x', verdict: 'ERROR' }] })).toBe('NOT_CHECKED');
  });
  it('one real FALSE vote keeps the veto', () => {
    expect(verdictFromHal({ decision: 'vetoed', provider_responses: [...uncertain(2), { provider: 'x', verdict: 'FALSE' }] })).toBe('VETO');
  });
  it('one real TRUE vote keeps the pass (lower-case verdicts too)', () => {
    expect(verdictFromHal({ decision: 'clean', provider_responses: [{ provider: 'x', verdict: 'true' }] })).toBe('PASS');
  });
  it('no provider list says nothing either way: the decision stands', () => {
    expect(verdictFromHal({ decision: 'vetoed' })).toBe('VETO');
    expect(verdictFromHal({ decision: 'vetoed', provider_responses: [] })).toBe('VETO');
  });

  it('`verify` on the audit\'s all-UNCERTAIN answer exits 2 and never prints VETO', async () => {
    halReturns({ decision: 'vetoed', hal_score: 0.5, mode: 'fact-check', provider_responses: uncertain(3) });
    const { io, out } = capture();
    const code = await run(parseArgs(['verify', 'paste your own claim']), new TrustShell({ apiUrl: ENGINE }), io);
    expect(code).toBe(EXIT.NOT_CHECKED);
    expect(out.join('\n')).not.toMatch(/VETO/);
  });

  it('the extension verify door agrees', async () => {
    const verify = require('../extension/verify.js') as {
      verifyLastReply: (text: string, options: Record<string, unknown>) => Promise<string>;
    };
    const fetchImpl = async () => ({ status: 200, json: async () => ({ decision: 'vetoed', provider_responses: uncertain(3) }) });
    expect(await verify.verifyLastReply('a claim', { baseUrl: 'http://localhost:9', fetchImpl })).toBe('not-checked');
    const voted = async () => ({ status: 200, json: async () => ({ decision: 'vetoed', provider_responses: [{ verdict: 'FALSE' }] }) });
    expect(await verify.verifyLastReply('a claim', { baseUrl: 'http://localhost:9', fetchImpl: voted })).toBe('veto');
  });
});

describe('score() and verifyOutput() on an answer that is not a decision', () => {
  it('an abstain is NOT_CHECKED with no trust earned, and not ok', async () => {
    halReturns({ decision: 'abstain', hal_score: 0.5, mode: 'fact-check' });
    const shell = new TrustShell({ apiUrl: ENGINE });
    const s = await shell.score('The moon has a population.');
    expect(s.verdict).toBe('NOT_CHECKED');
    expect(s.trustScore).toBe(0);
    const v = await shell.verifyOutput('The moon has a population.');
    expect(v.verdict).toBe('NOT_CHECKED');
    expect(v.ok).toBe(false);
  });

  it('a body with no decision and no score is NOT_CHECKED, not PASS 100/100', async () => {
    halReturns({});
    const v = await new TrustShell({ apiUrl: ENGINE }).verifyOutput('anything');
    expect(v.verdict).toBe('NOT_CHECKED');
    expect(v.trustScore).toBe(0);
    expect(v.ok).toBe(false);
  });

  it('a real clean decision is still PASS and ok', async () => {
    halReturns({ decision: 'clean', hal_score: 0.1, mode: 'fact-check' });
    const v = await new TrustShell({ apiUrl: ENGINE }).verifyOutput('Paris is the capital of France.');
    expect(v.verdict).toBe('PASS');
    expect(v.trustScore).toBe(90);
    expect(v.ok).toBe(true);
  });
});

describe('the CLI: NOT_CHECKED exits 2 and shows no check mark', () => {
  it('maps every verdict to its exit code', () => {
    expect(verdictExitCode('PASS')).toBe(EXIT.OK);
    expect(verdictExitCode('FLAG')).toBe(EXIT.OK);
    expect(verdictExitCode('VETO')).toBe(EXIT.VETO);
    expect(verdictExitCode('NOT_CHECKED')).toBe(EXIT.NOT_CHECKED);
    expect(EXIT.NOT_CHECKED).not.toBe(EXIT.OK);
  });

  it('prints NOT_CHECKED with no ✓ and no trust number', () => {
    const line = formatVerdictLine({ verdict: 'NOT_CHECKED', trustScore: 0 });
    expect(line).toContain('NOT_CHECKED');
    expect(line).not.toContain('✓');
    expect(line).not.toMatch(/trust \d+/);
  });

  it('says "You have a receipt." only when a receipt was written', () => {
    const pass = { verdict: 'PASS', trustScore: 90, decisionReason: '', evidence: [] } as any;
    expect(formatVerify(pass)).not.toContain('You have a receipt');
    expect(formatVerify(pass, { receiptWritten: false })).not.toContain('You have a receipt');
    expect(formatVerify(pass, { receiptWritten: true })).toContain('You have a receipt');
  });

  it('`verify` on an abstain exits 2, not 0, and never prints PASS', async () => {
    halReturns({ decision: 'abstain', hal_score: 0.5, mode: 'fact-check' });
    const cap = capture();
    const code = await run(parseArgs(['verify', 'Is pizza the best food?']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(EXIT.NOT_CHECKED);
    const out = cap.out.join('\n');
    expect(out).toContain('NOT_CHECKED');
    expect(out).not.toMatch(/✓|\bPASS\b/);
  });
});

describe('wrapExecute: an answer that is not a decision is unchecked', () => {
  const notChecked: HalScorer = {
    async score(): Promise<ScoreResult> {
      return {
        trustScore: 0, halScore: 0.5,
        signals: { harmProbability: 0, epistemicUncertainty: 0, evidenceQuality: 0, scopeAppropriateness: 0, certaintyAtClaim: 0 },
        verdict: 'NOT_CHECKED', flaggedHallucination: false, provider: 'test', model: 'test',
        decisionReason: 'no family judged this', evidence: [],
      };
    },
  };

  it('withholds when blocking is on and onUnavailable is withhold', async () => {
    const r = await wrapExecute(notChecked, () => 'draft', { blockAtOrAbove: 'VETO', onUnavailable: 'withhold' });
    expect(r.checked).toBe(false);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.blocked).toBe(true);
    expect(r.output).toBeUndefined();
    expect(r.decisionReason).toContain('NOT a pass');
  });

  it('releases, still unchecked, when onUnavailable is release or blocking is off', async () => {
    const released = await wrapExecute(notChecked, () => 'draft', { blockAtOrAbove: 'VETO', onUnavailable: 'release' });
    expect(released.blocked).toBe(false);
    expect(released.checked).toBe(false);
    const recorded = await wrapExecute(notChecked, () => 'draft');
    expect(recorded.checked).toBe(false);
    expect(recorded.trustScore).toBeNull();
  });
});
