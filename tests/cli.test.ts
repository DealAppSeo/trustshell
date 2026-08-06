/**
 * CLI unit tests — arg parsing + exit-code logic. NO live network.
 *
 * These cover the two things that make `trustshell` usable as a CI gate:
 *   1. parseArgs() routes commands/options and reports usage errors (pure).
 *   2. verdictExitCode() / run() map a HAL verdict to the right process exit code
 *      (VETO → 1, PASS/FLAG → 0) — with the SDK client MOCKED so no request is made.
 */
import {
  explainFailure,
  parseArgs,
  verdictExitCode,
  run,
  EXIT,
  VERSION,
  type CliIO,
  type ParsedArgs,
} from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A no-op IO sink that records what the CLI would print.
function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

/**
 * The check that expires by itself.
 *
 * The old failure could not be caught by a test that hardcoded the expected
 * version, because that test would have had to be edited on every release —
 * i.e. it would have drifted in exactly the same way as the thing it guarded.
 * This reads package.json independently and compares, so the NEXT version bump
 * fails this test if the CLI ever stops tracking it.
 */
describe('reported version', () => {
  const pkgVersion = (
    JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
  ).version;

  it('matches package.json exactly', () => {
    expect(VERSION).toBe(pkgVersion);
  });

  it('is never the literal that was hardcoded through two releases', () => {
    // Guards the specific regression: 1.0.0 shipped on the 1.1.0 and 1.2.0 packages.
    expect(VERSION).not.toBe('unknown');
    expect(pkgVersion).not.toBe('1.0.0');
  });

  it('is printed by the version command', async () => {
    const { io, out } = captureIO();
    // Go through parseArgs so this also proves `--version` routes to the
    // version command, not just that the constant is right.
    const code = await run(parseArgs(['--version']), {} as unknown as TrustShell, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('\n')).toContain(pkgVersion);
  });
});

describe('explainFailure — a transport fault must not read like a broken install', () => {
  it('a 429 says the install is FINE and names what still works', () => {
    const m = explainFailure('verify', new Error('HAL evaluation failed: 429 Too Many Requests'));
    // The exact first impression a new user gets when they hit the public cap.
    expect(m).toContain('your install is fine');
    expect(m).toContain('not a bug');
    expect(m).toContain('trustshell repid');
    expect(m).toContain('TRUSTSHELL_API_URL');
    // It must NOT lead with a bare HTTP code the way it used to.
    expect(m.split(String.fromCharCode(10))[0]).not.toMatch(/^verify failed:/);
  });

  it('a network fault is UNKNOWN, never a pass or a veto', () => {
    const m = explainFailure('verify', new Error('fetch failed'));
    expect(m).toContain('UNKNOWN');
    expect(m).toContain('not a verdict');
  });

  it('a timeout explicitly refuses to be read as a pass', () => {
    expect(explainFailure('verify', new Error('The operation timed out'))).toContain('do NOT treat a timeout as a pass');
  });

  it('an unrecognised error still surfaces its message', () => {
    expect(explainFailure('repid', new Error('boom'))).toBe('repid failed: boom');
  });
});

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
    // Explained, not raw: a transport fault must read as UNKNOWN, never as a
    // pass or a veto.
    expect(err.join(' ')).toMatch(/could not reach the engine/);
    expect(err.join(' ')).toMatch(/UNKNOWN/);
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
