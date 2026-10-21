/**
 * GUARD: the owner's local policy (a subset of the engine kernel's OwnerPolicy), enforced by `trustshell run`
 * before a command starts, with a record of every decision. One allowed and one denied action, both recorded.
 * Every test uses a temp TRUSTSHELL_HOME; the real home is never read or written.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { EXIT_REFUSED, RUN_SCOPE, runGuarded, runRun, type Spawner } from '../src/cli/guard';
import {
  GUARD_CHECKPOINT_FILE,
  GUARD_RECEIPTS_FILE,
  POLICY_FILE,
  decide,
  defaultPolicy,
  guardDecide,
  parsePolicy,
  parsePolicyDocument,
  readLedger,
  readLedgerCheckpointed,
  renderPolicyDocument,
  type GuardRecord,
  type LocalPolicy,
} from '../src/lib/guardrails';
import { canonicalize } from '../src/lib/jcs';

const NOW = 1_800_000_000; // 2027-01-15
const policy = (over: Partial<LocalPolicy> = {}): LocalPolicy => ({ ...defaultPolicy(NOW), ...over });
const SCOPE = { mediated: ['test'], not_mediated: ['test'] };

describe('parsePolicy: the kernel parser rules, field for field', () => {
  it('a limit left out is "0" and is reported; a present malformed one is an error', () => {
    const r = parsePolicy({ subject: 'a', actions: ['tool'], expires_at: NOW, nonce: '1' });
    expect(r.ok && r.policy).toMatchObject({ per_tx_raw: '0', daily_raw: '0', total_raw: '0' });
    expect(r.ok && r.defaulted).toEqual(['per_tx_raw', 'daily_raw', 'total_raw']);
    expect(parsePolicy({ subject: 'a', actions: [], per_tx_raw: '1.5', expires_at: NOW, nonce: '1' }).ok).toBe(false);
  });

  it.each([
    ['an unknown field (a misspelt limit is not a zero limit)', { subject: 'a', actions: [], per_tx: '5', expires_at: NOW, nonce: '1' }],
    ['an action outside spend | post | tool | tool:<name>', { subject: 'a', actions: ['shell'], expires_at: NOW, nonce: '1' }],
    ['an action listed twice', { subject: 'a', actions: ['tool', 'tool'], expires_at: NOW, nonce: '1' }],
    ['expires_at that is not unix seconds', { subject: 'a', actions: [], expires_at: '2030-01-01', nonce: '1' }],
    ['a negative limit', { subject: 'a', actions: [], total_raw: '-1', expires_at: NOW, nonce: '1' }],
    ['a nonce that is not a decimal integer', { subject: 'a', actions: [], expires_at: NOW, nonce: '0x10' }],
    ['no subject', { actions: [], expires_at: NOW, nonce: '1' }],
  ])('%s is an error', (_n, input) => {
    expect(parsePolicy(input).ok).toBe(false);
  });

  it('{ policy, signature } with a byte-order mark parses (PowerShell writes one); a stray field does not', () => {
    expect(parsePolicyDocument('﻿' + renderPolicyDocument({ policy: policy(), signature: null })).ok).toBe(true);
    expect(parsePolicyDocument(JSON.stringify({ policy: policy(), signature: null, note: 'x' })).ok).toBe(false);
  });
});

describe('decide: what the kernel would say', () => {
  const p = policy({ actions: ['tool:git', 'spend'], per_tx_raw: '100', daily_raw: '120', total_raw: '150' });
  const none = { today: BigInt(0), total: BigInt(0) };

  it('a listed tool is allowed; an unlisted one is denied, naming the action', () => {
    expect(decide(p, { tool: 'git', class: 'other' }, none, NOW)).toEqual({ decision: 'ALLOWED', reasons: [] });
    expect(decide(p, { tool: 'shell', class: 'other' }, none, NOW).reasons).toEqual(['the owner policy does not list tool:shell']);
    expect(decide(policy({ actions: ['tool'] }), { tool: 'anything', class: 'read' }, none, NOW).decision).toBe('ALLOWED');
    expect(decide(policy({ actions: ['tool'] }), { tool: 'x', class: 'post' }, none, NOW).reasons).toEqual(['the owner policy does not list post']);
  });

  it('the smallest limit binds: per action, what is left today, what is left in total', () => {
    expect(decide(p, { tool: 'pay', class: 'spend', amount_raw: '101' }, none, NOW).reasons).toEqual(['101 is over per_tx_raw 100']);
    expect(decide(p, { tool: 'pay', class: 'spend', amount_raw: '50' }, { today: BigInt(100), total: BigInt(100) }, NOW).reasons).toEqual([
      '50 is over what daily_raw 120 leaves today (20)',
    ]);
    expect(decide(p, { tool: 'pay', class: 'spend', amount_raw: '60' }, { today: BigInt(0), total: BigInt(100) }, NOW).reasons).toEqual([
      '60 is over what total_raw 150 leaves (50)',
    ]);
  });

  it('expired, broken ledger, zero or decimal amounts: denied', () => {
    expect(decide(policy({ expires_at: NOW }), { tool: 'git', class: 'other' }, none, NOW).reasons[0]).toMatch(/^the policy expired at/);
    expect(decide(p, { tool: 'pay', class: 'spend', amount_raw: '1' }, null, NOW).reasons[0]).toMatch(/ledger is BROKEN/);
    for (const a of ['0', '1.5', '-1', '1e3']) expect(decide(p, { tool: 'pay', class: 'spend', amount_raw: a }, none, NOW).decision).toBe('DENIED');
    expect(decide(null, { tool: 'git', class: 'other' }, none, NOW, ['broken']).decision).toBe('DENIED');
  });
});

describe('the record ledger', () => {
  let home = '';
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-guard-ledger-'));
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: policy({ actions: ['spend', 'tool:git'], per_tx_raw: '100', daily_raw: '1000', total_raw: '150' }), signature: null }));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const text = () => readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8');

  it('chains every decision, counts only ALLOWED amounts, and states its scope', () => {
    expect(guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '100' }, SCOPE, { nowS: NOW })?.decision.decision).toBe('ALLOWED');
    expect(guardDecide(home, { tool: 'shell', class: 'other' }, SCOPE, { nowS: NOW })?.decision.decision).toBe('DENIED');
    expect(guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '60' }, SCOPE, { nowS: NOW })?.decision.reasons).toEqual(['60 is over what total_raw 150 leaves (50)']);
    const l = readLedger(text(), NOW);
    expect(l).toMatchObject({ verdict: 'INTACT', count: 3 });
    expect(l.spent).toEqual({ today: BigInt(100), total: BigInt(100) });
    const r = JSON.parse(text().trim().split('\n')[1] as string) as GuardRecord;
    expect(r).toMatchObject({ kind: 'decision', executed: 'not run', requested: { action: 'tool:shell' }, authorized: { decision: 'DENIED' }, assurance_scope: SCOPE });
    expect(r.authorized.policy_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalize(r)).toBe(text().trim().split('\n')[1]);
  });

  it('an edited old record breaks the chain even through the checkpoint, and then no amount is allowed', () => {
    for (let i = 0; i < 3; i++) guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '10' }, SCOPE, { nowS: NOW });
    expect(readLedgerCheckpointed(text(), readFileSync(join(home, GUARD_CHECKPOINT_FILE), 'utf8'), NOW)).toEqual(readLedger(text(), NOW));
    writeFileSync(join(home, GUARD_RECEIPTS_FILE), text().replace('"amount_raw":"10"', '"amount_raw":"1"'));
    expect(guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '1' }, SCOPE, { nowS: NOW })?.decision.reasons[0]).toMatch(/ledger is BROKEN/);
  });
});

describe('trustshell run: decided and recorded before the command starts', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let started: string[][] = [];
  const spawner: Spawner = (cmd, args) => {
    started.push([cmd, ...args]);
    return { status: 0, signal: null };
  };
  const records = (): GuardRecord[] => readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardRecord);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-guard-run-'));
    process.env.TRUSTSHELL_HOME = home;
    out = [];
    err = [];
    started = [];
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });
  const policyFile = (p: LocalPolicy) => writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: p, signature: null }));
  const runIt = (...argv: string[]) => runRun(argv, io, process.env, spawner);

  it('no policy: nothing is authorized, nothing starts, nothing is recorded', () => {
    expect(runIt('--tool', 'git', '--', 'git', 'status')).toBe(2);
    expect(started).toEqual([]);
    expect(err.join('\n')).toMatch(/^NOT_CHECKED no policy/);
  });

  it('ONE ALLOWED action: the command starts, and a decision and an outcome are recorded', () => {
    policyFile(policy({ actions: ['tool:git'] }));
    expect(runIt('--tool', 'git', '--', 'git', 'status', '--short')).toBe(0);
    expect(started).toEqual([['git', 'status', '--short']]);
    const [d, o] = records();
    expect(d).toMatchObject({ kind: 'decision', authorized: { decision: 'ALLOWED' }, executed: null, assurance_scope: RUN_SCOPE });
    expect(o).toMatchObject({ kind: 'outcome', authorized: { decision: 'ALLOWED' }, executed: { exit_code: 0, signal: null } });
    // The command is recorded by hash, never by its text.
    expect(d?.requested.command_sha256).toBe(createHash('sha256').update(JSON.stringify(['git', 'status', '--short'])).digest('hex'));
    expect(JSON.stringify(records())).not.toContain('--short');
    const card = err.join('\n');
    for (const field of ['requested', 'authorized', 'executed', 'independently observed', 'unknown']) expect(card).toContain(field);
  });

  it('ONE DENIED action: the command NEVER starts (exit 5), and the denial is recorded', () => {
    policyFile(policy({ actions: ['tool:git'] }));
    expect(runIt('--tool', 'shell', '--', 'rm', '-rf', '/')).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ kind: 'decision', authorized: { decision: 'DENIED', reasons: ['the owner policy does not list tool:shell'] }, executed: 'not run' });
    expect(err.join('\n')).toContain('executed              not run');
  });

  it('a spend over the per-action limit is denied before it starts; the command exit code passes through when allowed', () => {
    policyFile(policy({ actions: ['spend'], per_tx_raw: '100', daily_raw: '100', total_raw: '100' }));
    expect(runIt('--tool', 'pay', '--class', 'spend', '--amount', '101', '--', 'pay')).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    const failing: Spawner = () => ({ status: 7, signal: null });
    expect(runRun(['--tool', 'pay', '--class', 'spend', '--amount', '100', '--', 'pay'], io, process.env, failing)).toBe(7);
    expect(records().pop()).toMatchObject({ kind: 'outcome', executed: { exit_code: 7 } });
  });

  it('a policy that does not parse denies everything; an expired one too', () => {
    writeFileSync(join(home, POLICY_FILE), '{ "policy": ');
    expect(runIt('--tool', 'git', '--', 'git')).toBe(EXIT_REFUSED);
    policyFile(policy({ actions: ['tool:git'], expires_at: 1 }));
    expect(runIt('--tool', 'git', '--', 'git')).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
  });

  it('usage: --tool and a command after -- are required', () => {
    policyFile(policy({ actions: ['tool:git'] }));
    expect(runIt('--', 'git')).toBe(2);
    expect(runIt('--tool', 'git')).toBe(2);
    expect(runIt('--tool', 'git', '--class', 'shell', '--', 'git')).toBe(2);
    expect(started).toEqual([]);
  });
});

describe('the gate and the guard verbs', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let calls: string[] = [];
  const client = { verifyOutput: async () => (calls.push('verifyOutput'), { verdict: 'PASS', trustScore: 90 }) } as never;
  const cli = async (...argv: string[]) => {
    out = [];
    err = [];
    const args = parseArgs(argv);
    return runGuarded(args, () => run(args, client, io), io, process.env);
  };
  const doc = () => JSON.parse(readFileSync(join(home, POLICY_FILE), 'utf8')) as { policy: LocalPolicy; signature: unknown };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-guard-cli-'));
    process.env.TRUSTSHELL_HOME = home;
    process.env.TRUSTSHELL_MEMORY = join(home, 'memory.sqlite');
    calls = [];
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  it('no policy file: the gate does nothing and writes nothing', async () => {
    expect(await cli('remember', '--trusted', 'a note')).toBe(0);
    expect(() => readFileSync(join(home, GUARD_RECEIPTS_FILE))).toThrow();
    expect(await cli('guard', 'check', '--tool', 'git')).toBe(2);
  });

  it('with the default policy a local command runs; one it does not list is denied before it runs', async () => {
    expect(await cli('guard', 'init')).toBe(0);
    expect(await cli('remember', '--trusted', 'ship the receipt')).toBe(0);
    expect(await cli('verify', 'Paris is the capital of France.')).toBe(EXIT_REFUSED);
    expect(calls).toEqual([]);
    expect(err.join('\n')).toContain('the owner policy does not list tool:verify');
    const recs = readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardRecord);
    // guard init itself leaves a policy-change record first; then one decision per command.
    expect(recs.map((r) => r.kind)).toEqual(['policy-change', 'decision', 'decision']);
    expect(recs.filter((r) => r.kind === 'decision').map((r) => [r.requested.tool, r.authorized.decision])).toEqual([['remember', 'ALLOWED'], ['verify', 'DENIED']]);
    expect(JSON.stringify(recs)).not.toContain('Paris'); // the action, never its text
  });

  it('every change is a new policy with a higher nonce; an edit drops a now-stale signature; kill allows nothing', async () => {
    await cli('guard', 'init');
    const n0 = BigInt(doc().policy.nonce);
    await cli('guard', 'allow', 'tool:git');
    expect(BigInt(doc().policy.nonce)).toBe(n0 + BigInt(1));
    expect(await cli('guard', 'sign')).toBe(0);
    expect(doc().signature).not.toBeNull();
    await cli('guard', 'limit', 'per-tx', '50');
    expect(doc().signature).toBeNull();
    expect(err.join('\n')).toContain('signature covered the old policy');
    await cli('guard', 'kill');
    expect(doc().policy.actions).toEqual([]);
    expect(await cli('remember', '--trusted', 'x')).toBe(EXIT_REFUSED);
  });

  it('edits are validated; help, version and guard always run; init --pai is denied while a policy exists', async () => {
    await cli('guard', 'init');
    expect(await cli('guard', 'allow', 'shell')).toBe(2);
    expect(await cli('guard', 'limit', 'total', '-1')).toBe(2);
    writeFileSync(join(home, POLICY_FILE), 'broken');
    expect(await cli('--version')).toBe(0);
    expect(await cli('guard', 'show')).toBe(1);
    expect(await cli('recall')).toBe(EXIT_REFUSED);
    await cli('guard', 'init', '--force');
    expect(await cli('init', '--pai', '--name', 'x')).toBe(EXIT_REFUSED);
    expect(err.join('\n')).toContain('init --pai spawns scripts/init-pai.mjs');
  });
});
