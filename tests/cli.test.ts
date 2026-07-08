/**
 * CLI unit tests — arg parsing + exit-code logic. NO live network.
 *
 * These cover the two things that make `trustshell` usable as a CI gate:
 *   1. parseArgs() routes commands/options and reports usage errors (pure).
 *   2. verdictExitCode() / run() map a HAL verdict to the right process exit code
 *      (VETO → 1, PASS/FLAG → 0) — with the SDK client MOCKED so no request is made.
 */
import {
  parseArgs,
  verdictExitCode,
  run,
  EXIT,
  type CliIO,
  type ParsedArgs,
} from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';

// A no-op IO sink that records what the CLI would print.
function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('parseArgs', () => {
  it('routes `verify "<text>"` with the text as operand', () => {
    const a = parseArgs(['verify', 'The sky is blue.']);
    expect(a.command).toBe('verify');
    expect(a.operand).toBe('The sky is blue.');
    expect(a.error).toBeUndefined();
  });

  it('routes `repid <id>` and `proof <id>`', () => {
    expect(parseArgs(['repid', 'sophia']).command).toBe('repid');
    expect(parseArgs(['proof', 'sophia']).operand).toBe('sophia');
  });

  it('parses --json and --verify flags', () => {
    const a = parseArgs(['proof', 'sophia', '--verify', '--json']);
    expect(a.verify).toBe(true);
    expect(a.json).toBe(true);
  });

  it('reports a usage error when verify has no text', () => {
    const a = parseArgs(['verify']);
    expect(a.error).toMatch(/requires "<text>"/);
  });

  it('reports a usage error when repid has no agent id', () => {
    const a = parseArgs(['repid']);
    expect(a.error).toMatch(/requires <agentIdOrSlug>/);
  });

  it('routes bare invocation and --help to help (no error)', () => {
    expect(parseArgs([]).command).toBe('help');
    expect(parseArgs(['--help']).command).toBe('help');
    expect(parseArgs(['-h']).command).toBe('help');
  });

  it('routes --version to version, even bare', () => {
    expect(parseArgs(['--version']).command).toBe('version');
    expect(parseArgs(['-v']).command).toBe('version');
  });

  it('flags an unknown command', () => {
    expect(parseArgs(['frobnicate']).error).toMatch(/unknown command/);
  });

  it('flags an unknown option', () => {
    expect(parseArgs(['verify', 'x', '--nope']).error).toMatch(/unknown option/);
  });
});

describe('verdictExitCode', () => {
  it('VETO → 1 (fail the build)', () => {
    expect(verdictExitCode('VETO')).toBe(EXIT.VETO);
    expect(verdictExitCode('VETO')).toBe(1);
  });
  it('PASS → 0 and FLAG → 0 (soft flag is not a gate failure)', () => {
    expect(verdictExitCode('PASS')).toBe(EXIT.OK);
    expect(verdictExitCode('FLAG')).toBe(EXIT.OK);
  });
});

describe('run() exit codes (mocked SDK — no network)', () => {
  const base: ParsedArgs = { command: 'verify', json: false, verify: false };

  it('verify PASS → exit 0', async () => {
    const client = {
      verifyOutput: async () => ({ verdict: 'PASS', trustScore: 100, evidence: [], decisionReason: 'ok' }),
    } as unknown as TrustShell;
    const { io } = captureIO();
    const code = await run({ ...base, operand: 'true claim' }, client, io);
    expect(code).toBe(EXIT.OK);
  });

  it('verify VETO → exit 1 (the CI gate)', async () => {
    const client = {
      verifyOutput: async () => ({ verdict: 'VETO', trustScore: 0, evidence: ['x:FALSE'], decisionReason: 'nope' }),
    } as unknown as TrustShell;
    const { io } = captureIO();
    const code = await run({ ...base, operand: 'false claim' }, client, io);
    expect(code).toBe(EXIT.VETO);
  });

  it('verify FLAG → exit 0 (soft flag passes)', async () => {
    const client = {
      verifyOutput: async () => ({ verdict: 'FLAG', trustScore: 60, evidence: [], decisionReason: 'soft' }),
    } as unknown as TrustShell;
    const { io } = captureIO();
    const code = await run({ ...base, operand: 'opinion' }, client, io);
    expect(code).toBe(EXIT.OK);
  });

  it('verify network failure → exit 3 (runtime), never a false PASS', async () => {
    const client = {
      verifyOutput: async () => {
        throw new Error('Network error: down');
      },
    } as unknown as TrustShell;
    const { io, err } = captureIO();
    const code = await run({ ...base, operand: 'x' }, client, io);
    expect(code).toBe(EXIT.RUNTIME);
    expect(err.join('\n')).toMatch(/verify failed/);
  });

  it('usage error → exit 2', async () => {
    const client = {} as unknown as TrustShell;
    const { io } = captureIO();
    const code = await run(parseArgs(['verify']), client, io);
    expect(code).toBe(EXIT.USAGE);
  });

  it('repid → exit 0 and prints score + tier', async () => {
    const client = {
      getRepID: async () => ({ agentId: 'sophia', repid: 1585, tier: 'ESTABLISHED', lastAnchorTx: null, latestProofHash: null }),
    } as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run({ command: 'repid', operand: 'sophia', json: false, verify: false }, client, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('\n')).toMatch(/1585/);
    expect(out.join('\n')).toMatch(/ESTABLISHED/);
  });

  it('proof --verify: a NOT-verified proof → exit 3 (never reads as verified success)', async () => {
    const client = {
      presentProof: async () => ({
        agentId: 'sophia',
        tier: 'postcard',
        proofBytes: 'AAAA',
        scheme: 'plonky3_range_check',
        statement: null,
        createdAt: null,
        verification: { verified: false, error: 'bad proof', verifierVersion: '0.2.0' },
      }),
    } as unknown as TrustShell;
    const { io, err } = captureIO();
    const code = await run({ command: 'proof', operand: 'sophia', json: false, verify: true }, client, io);
    expect(code).toBe(EXIT.RUNTIME);
    expect(err.join('\n')).toMatch(/NOT verified/);
  });

  it('proof --verify: a verified proof → exit 0', async () => {
    const client = {
      presentProof: async () => ({
        agentId: 'sophia',
        tier: 'postcard',
        proofBytes: 'AAAA',
        scheme: 'plonky3_range_check',
        statement: { agent_id: 'sophia', repid_score: 1585, threshold: 1000, tier: 'ESTABLISHED' },
        createdAt: '2026-07-08',
        verification: { verified: true, error: null, verifierVersion: '0.2.0' },
      }),
    } as unknown as TrustShell;
    const { io } = captureIO();
    const code = await run({ command: 'proof', operand: 'sophia', json: false, verify: true }, client, io);
    expect(code).toBe(EXIT.OK);
  });

  it('help → exit 0', async () => {
    const client = {} as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run({ command: 'help', json: false, verify: false }, client, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('\n')).toMatch(/USAGE/);
  });
});
