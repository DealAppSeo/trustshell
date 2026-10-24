/**
 * AUTONOMY LEVELS, SHADOW FIRST (src/lib/autonomy.ts): an agent's autonomy under Guard rises with checked evidence
 * and falls on incidents. Four promises, each its own block below:
 *   promotion          N Inspect records SUPPORTED in full, one per commit, raise the level one step
 *   demotion           a CONTRADICTED record or an out-of-lane refusal drops one; revocation drops to L0
 *   NOT_CHECKED        never promotes, alone or padded next to SUPPORTED claims
 *   shadow             changes nothing Guard decides, even when the level would refuse everything
 * Inspect records are built from the recorded GitHub answers in tests/fixtures/action-evidence, replayed with no
 * network. Runs on other commits are DERIVED from the green run (run id and commit changed, nothing else).
 * Every test uses a temp TRUSTSHELL_HOME; the real home is never read or written.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { EXIT_REFUSED, runGuarded, runRun, type Spawner } from '../src/cli/guard';
import { buildRecord, digestRecord, inspectRunClaims, tallyClaims, type Observation } from '../src/lib/action-evidence';
import { AUTONOMY_FILE, levelAllows, readAutonomy, type AutonomyRecord, type Level } from '../src/lib/autonomy';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, guardDecide, parsePolicy, policySha256, renderPolicyDocument, type GuardRecord, type GuardRequest, type LocalPolicy } from '../src/lib/guardrails';
import { jcsSha256 } from '../src/lib/jcs';

const NOW = 1_800_000_000; // 2027-01-15
const FX = join(__dirname, 'fixtures', 'action-evidence');
const SCOPE = { mediated: ['test'], not_mediated: ['test'] };
const SHADOW = { mode: 'shadow' as const, promote_after: { L1: 2, L2: 3, L3: 4 } };

async function observe(name: string): Promise<Observation> {
  const fx = JSON.parse(readFileSync(join(FX, name), 'utf8')) as { run_url: string; responses: Record<string, { status: number; body: unknown }> };
  (globalThis as any).fetch = async (url: string) => {
    const u = new URL(url);
    const r = fx.responses[u.pathname + u.search];
    if (u.host !== 'api.github.com' || !r) throw new Error(`unrecorded request: ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  try {
    return (await inspectRunClaims(fx.run_url, 'x', { env: {}, now: () => new Date('2026-10-19T22:10:00.000Z') })).record.observation;
  } finally {
    delete (globalThis as any).fetch;
  }
}

let GREEN: Observation;
let FAILED: Observation;
beforeAll(async () => {
  GREEN = await observe('green-run.json');
  FAILED = await observe('failed-run.json');
});

/** DERIVED: the green run, as if it had run as run `GREEN.run_id + i` on commit `sha1(commit ?? i)`. */
function green(i: number, commit: number = i): Observation {
  const sha = createHash('sha1').update(`commit-${commit}`).digest('hex');
  const id = GREEN.run_id + i;
  return { ...GREEN, run_id: id, url: GREEN.url.replace(String(GREEN.run_id), String(id)), head_sha: sha, jobs: { ...GREEN.jobs, items: GREEN.jobs.items.map((j) => ({ ...j, head_sha: sha })) } };
}
const narrow = (o: Observation) => `The check workflow passed on ${o.head_sha.slice(0, 12)}, run ${o.run_id}, attempt 1.`;

describe('the autonomy block and the level presets', () => {
  const base = { ...defaultPolicy(NOW) };

  it('a policy without the block hashes exactly as before; a malformed block is an error, so the file denies everything', () => {
    const r = parsePolicy(base);
    expect(r.ok && 'autonomy' in r.policy).toBe(false);
    expect(r.ok && policySha256(r.policy)).toBe(jcsSha256(base));
    expect(parsePolicy({ ...base, autonomy: SHADOW }).ok).toBe(true);
    for (const bad of [{ ...SHADOW, mode: 'on' }, { mode: 'shadow' }, { ...SHADOW, promote_after: { L1: 0, L2: 1, L3: 1 } }, { ...SHADOW, promote_after: { L1: 1, L2: 1 } }, { ...SHADOW, extra: 1 }, null]) {
      expect(parsePolicy({ ...base, autonomy: bad }).ok).toBe(false);
    }
  });

  it.each([
    [0, [false, false, false, false, false, false]],
    [1, [true, true, false, false, false, false]],
    [2, [true, true, true, true, false, false]],
    [3, [true, true, true, true, true, true]],
  ] as [Level, boolean[]][])('L%s allows %j of: read, `trustshell recall`, `trustshell remember`, run other, post, spend', (level, want) => {
    const reqs: GuardRequest[] = [
      { tool: 'cat', class: 'read', executable: 'cat' },
      { tool: 'recall', class: 'other' },
      { tool: 'remember', class: 'other' },
      { tool: 'recall', class: 'other', executable: 'recall' }, // a `run` executable named like a read-only command is not one
      { tool: 'gh', class: 'post' },
      { tool: 'pay', class: 'spend', amount_raw: '1' },
    ];
    expect(reqs.map((r) => levelAllows(level, r))).toEqual(want);
  });
});

describe('guard level, from the CLI', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let started: string[][] = [];
  const spawner: Spawner = (cmd, args) => (started.push([cmd, ...args]), { status: 0, signal: null });
  const client = { verifyOutput: async () => ({ verdict: 'PASS', trustScore: 90 }) } as never;
  const cli = async (...argv: string[]) => {
    out = [];
    err = [];
    const args = parseArgs(argv);
    return runGuarded(args, () => run(args, client, io), io, process.env);
  };
  const auto = (): AutonomyRecord[] => readAutonomy(readFileSync(join(home, AUTONOMY_FILE), 'utf8')).records;
  const level = async (): Promise<{ level: Level; supported: number; reason: string; chain: string }> => {
    expect(await cli('guard', 'level', '--json')).toBe(0);
    return JSON.parse(out.join('\n'));
  };
  let n = 0;
  /** Write an Inspect record as `check --out` writes record.json, and record it. */
  const evidence = async (o: Observation, claims: string) => {
    const record = buildRecord(o, claims);
    const f = join(home, `record-${n++}.json`);
    writeFileSync(f, JSON.stringify({ record, digest: digestRecord(record) }));
    return { code: await cli('guard', 'level', 'record', f), tally: tallyClaims(record.claims) };
  };

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'ts-autonomy-'));
    process.env.TRUSTSHELL_HOME = home;
    process.env.TRUSTSHELL_MEMORY = join(home, 'memory.sqlite');
    started = [];
    expect(await cli('guard', 'init')).toBe(0);
    expect(await cli('guard', 'level', 'shadow')).toBe(0);
    for (const [l, k] of Object.entries(SHADOW.promote_after)) expect(await cli('guard', 'level', 'after', l, String(k))).toBe(0);
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  describe('promotion', () => {
    it('L1 -> L2 after promote_after.L2 records SUPPORTED in full, one per commit, as its own hashed record', async () => {
      expect(await level()).toMatchObject({ level: 1, supported: 0, reason: 'every agent starts at L1' });
      for (let i = 1; i <= 2; i++) expect((await evidence(green(i), narrow(green(i)))).code).toBe(0);
      expect(await level()).toMatchObject({ level: 1, supported: 2 });
      const last = await evidence(green(3), narrow(green(3)));
      expect(last.tally).toEqual({ SUPPORTED: 4, CONTRADICTED: 0, NOT_CHECKED: 0 });
      expect(out.join('\n')).toMatch(/level {7}L1 -> L2: 3 Inspect records SUPPORTED in full/);
      expect(await level()).toMatchObject({ level: 2, supported: 0, chain: 'INTACT' });
      const change = auto().filter((r) => r.kind === 'level-change');
      expect(change).toHaveLength(1);
      expect(change[0]).toMatchObject({ from: 1, to: 2, mode: 'shadow', schema: 'trustshell.autonomy-record/0.1-draft' });
      const { hash, ...body } = change[0] as AutonomyRecord;
      expect(hash).toBe(jcsSha256(body));
    });

    it('one commit counts once, and one run is recorded once', async () => {
      await evidence(green(1, 7), narrow(green(1, 7)));
      expect((await evidence(green(2, 7), narrow(green(2, 7)))).code).toBe(0); // another run, same commit
      expect(out.join('\n')).toMatch(/does not count: .*was already counted/);
      expect(await level()).toMatchObject({ level: 1, supported: 1 });
      expect((await evidence(green(1, 7), 'The check workflow passed.')).code).toBe(2); // the same run again
      expect(err.join('\n')).toMatch(/already recorded .*one record per run/);
    });

    it('an edited record is refused: its digest no longer matches', async () => {
      const record = buildRecord(green(1), 'The fix works.');
      const digest = digestRecord(record);
      record.claims = record.claims.map((c) => ({ ...c, status: 'SUPPORTED' }));
      writeFileSync(join(home, 'forged.json'), JSON.stringify({ record, digest }));
      expect(await cli('guard', 'level', 'record', join(home, 'forged.json'))).toBe(2);
      expect(err.join('\n')).toMatch(/digest does not match/);
    });
  });

  describe('NOT_CHECKED never promotes', () => {
    it('neither alone nor padded beside SUPPORTED claims, however many', async () => {
      for (let i = 1; i <= 6; i++) {
        const unchecked = await evidence(green(i), 'The fix works and all tests pass.');
        expect(unchecked.tally).toMatchObject({ SUPPORTED: 0, CONTRADICTED: 0 });
        const padded = await evidence(green(100 + i), `${narrow(green(100 + i))}\n\nIt is secure.`);
        expect(padded.tally.SUPPORTED).toBeGreaterThan(0);
        expect(padded.tally.NOT_CHECKED).toBeGreaterThan(0);
        expect(out.join('\n')).toMatch(/counts for nothing/);
      }
      expect(await level()).toMatchObject({ level: 1, supported: 0 });
      expect(auto().filter((r) => r.kind === 'level-change')).toEqual([]);
    });
  });

  describe('demotion', () => {
    it('a CONTRADICTED record drops one level and starts the count again; at L0 it stays at L0', async () => {
      await evidence(green(1), narrow(green(1)));
      expect((await evidence(FAILED, `The check workflow passed in run ${FAILED.run_id}.`)).tally.CONTRADICTED).toBeGreaterThan(0);
      expect(await level()).toMatchObject({ level: 0, supported: 0 });
      expect((await level()).reason).toMatch(/CONTRADICTED claim \(https:\/\/github.com\/.*\/attempts\/1\)/);
      await evidence(green(2), narrow(green(2)));
      await evidence({ ...FAILED, run_id: FAILED.run_id + 1, url: FAILED.url.replace(String(FAILED.run_id), String(FAILED.run_id + 1)) }, `The check workflow passed in run ${FAILED.run_id + 1}.`);
      expect(await level()).toMatchObject({ level: 0, supported: 0 });
      expect((await level()).reason).toMatch(/stays at L0/);
      // back up from L0 takes promote_after.L1 new commits
      for (let i = 3; i <= 4; i++) await evidence(green(i), narrow(green(i)));
      expect(await level()).toMatchObject({ level: 1 });
    });

    it('a Guard refusal of an out-of-lane attempt drops one level; expiry and an over-cap amount do not', async () => {
      expect(await cli('guard', 'allow', 'spend')).toBe(0);
      expect(await cli('guard', 'limit', 'per-tx', '5')).toBe(0);
      expect(guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '9' }, SCOPE)?.decision.decision).toBe('DENIED'); // over the cap
      expect(guardDecide(home, { tool: 'recall', class: 'other' }, SCOPE, { nowS: NOW * 2 })?.decision.reasons).toEqual([expect.stringMatching(/policy expired/)]);
      expect(await level()).toMatchObject({ level: 1 });
      expect(await cli('verify', 'Paris is the capital of France.')).toBe(EXIT_REFUSED); // not listed: out of lane
      expect(await level()).toMatchObject({ level: 0 });
      const inc = auto().find((r) => r.kind === 'incident');
      expect(inc).toMatchObject({ action: 'tool:verify' });
      expect((await level()).reason).toMatch(/out-of-lane attempt, tool:verify \(guard record \d+\)/);
    });

    it('a `run` whose executable is not the named tool is out of lane too', async () => {
      expect(await cli('guard', 'allow', 'tool:git')).toBe(0);
      expect(runRun(['--tool', 'git', '--', 'node', 'x.js'], io, process.env, spawner)).toBe(EXIT_REFUSED);
      expect(started).toEqual([]);
      expect(await level()).toMatchObject({ level: 0 });
    });

    it('owner revocation drops to L0: guard level revoke, and guard kill', async () => {
      for (let i = 1; i <= 3; i++) await evidence(green(i), narrow(green(i)));
      expect(await level()).toMatchObject({ level: 2 });
      expect(await cli('guard', 'level', 'revoke')).toBe(0);
      expect(await level()).toMatchObject({ level: 0, reason: 'the owner revoked it (guard level revoke)' });
      for (let i = 4; i <= 5; i++) await evidence(green(i), narrow(green(i)));
      expect(await level()).toMatchObject({ level: 1 });
      expect(await cli('guard', 'kill')).toBe(0);
      expect(await level()).toMatchObject({ level: 0, reason: 'the owner revoked it (guard kill)' });
    });
  });

  describe('enforce: an explicit owner opt-in that only narrows', () => {
    it('at L1 a class-other run is refused before it starts, and the refusal is an incident', async () => {
      expect(await cli('guard', 'allow', 'tool:git')).toBe(0);
      expect(await cli('guard', 'level', 'enforce')).toBe(0);
      expect(runRun(['--tool', 'git', '--', 'git', 'status'], io, process.env, spawner)).toBe(EXIT_REFUSED);
      expect(started).toEqual([]);
      expect(err.join('\n')).toMatch(/autonomy level L1 does not allow tool:git \(enforced by the owner\)/);
      expect(await level()).toMatchObject({ level: 0 });
    });

    it('at L3 it still refuses what the policy does not list', async () => {
      expect(await cli('guard', 'level', 'enforce')).toBe(0);
      for (let i = 1; i <= 7; i++) await evidence(green(i), narrow(green(i)));
      expect(await level()).toMatchObject({ level: 3 });
      expect(guardDecide(home, { tool: 'pay', class: 'spend', amount_raw: '1' }, SCOPE)?.decision.reasons).toEqual(['the owner policy does not list spend', expect.stringMatching(/over per_tx_raw 0/), expect.stringMatching(/daily_raw/), expect.stringMatching(/total_raw/)]);
    });

    it('fails closed: an unreadable autonomy.jsonl throws before anything is decided', async () => {
      expect(await cli('guard', 'level', 'enforce')).toBe(0);
      mkdirSync(join(home, AUTONOMY_FILE));
      expect(() => guardDecide(home, { tool: 'recall', class: 'other' }, SCOPE)).toThrow();
    });
  });
});

describe('shadow changes nothing Guard decides', () => {
  const homes: string[] = [];
  const mk = (p: LocalPolicy) => {
    const h = mkdtempSync(join(tmpdir(), 'ts-autonomy-shadow-'));
    homes.push(h);
    writeFileSync(join(h, POLICY_FILE), renderPolicyDocument({ policy: p, signature: null }));
    return h;
  };
  afterEach(() => homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true })));

  const P: LocalPolicy = { ...defaultPolicy(NOW), actions: ['tool:recall', 'tool:git', 'spend', 'post'], per_tx_raw: '50', daily_raw: '80', total_raw: '1000' };
  const REQS: GuardRequest[] = [
    { tool: 'recall', class: 'other' },
    { tool: 'git', class: 'other', executable: 'git' },
    { tool: 'shell', class: 'other' }, // not listed: an incident in the shadow home, which must still change nothing
    { tool: 'pay', class: 'spend', amount_raw: '40' },
    { tool: 'pay', class: 'spend', amount_raw: '40' }, // over what daily_raw leaves
    { tool: 'gh', class: 'post' },
    { tool: 'git', class: 'read', executable: 'git' },
  ];
  const view = (r: GuardRecord) => ({ kind: r.kind, requested: r.requested, decision: r.authorized.decision, reasons: r.authorized.reasons, executed: r.executed, seq: r.seq });

  it.each([
    ['at L1, the start', ''],
    ['at L0, where the level would refuse every request', 'dropped'],
    ['with autonomy.jsonl BROKEN', 'broken'],
    ['with autonomy.jsonl unreadable', 'unreadable'],
  ])('%s: every decision, reason and guard record is what the same policy without the block produces', (_n, state) => {
    const plain = mk(P);
    const shadow = mk({ ...P, autonomy: SHADOW });
    // An out-of-lane refusal in both homes (the ledgers stay in step): L1 -> L0 in the shadow one.
    if (state === 'dropped') for (const h of [plain, shadow]) guardDecide(h, { tool: 'nope', class: 'other' }, SCOPE, { nowS: NOW });
    if (state === 'broken') writeFileSync(join(shadow, AUTONOMY_FILE), '{"not":"a record"}\n');
    if (state === 'unreadable') mkdirSync(join(shadow, AUTONOMY_FILE));
    for (const req of REQS) {
      const a = guardDecide(plain, req, SCOPE, { nowS: NOW });
      const b = guardDecide(shadow, req, SCOPE, { nowS: NOW });
      expect(b?.decision).toEqual(a?.decision);
      expect(view(b!.record)).toEqual(view(a!.record));
    }
    const ledger = (h: string) => readFileSync(join(h, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => view(JSON.parse(l) as GuardRecord));
    expect(ledger(shadow)).toEqual(ledger(plain));
    if (state === 'unreadable') return;
    const wb = readAutonomy(readFileSync(join(shadow, AUTONOMY_FILE), 'utf8')).records.filter((r) => r.kind === 'would-be');
    expect(wb.length).toBeGreaterThanOrEqual(REQS.length);
    if (state === 'dropped') {
      // The measurement: the policy allowed these, and the level would have refused them.
      expect(wb.filter((r) => r.kind === 'would-be' && r.fixed === 'ALLOWED' && r.earned === 'DENIED').length).toBeGreaterThan(0);
    }
  });

  it('a shadow `trustshell run` at L0 still starts the command the policy allows', () => {
    const prev = process.env.TRUSTSHELL_HOME;
    const shadow = mk({ ...P, autonomy: SHADOW });
    guardDecide(shadow, { tool: 'nope', class: 'other' }, SCOPE); // an out-of-lane refusal: L1 -> L0
    process.env.TRUSTSHELL_HOME = shadow;
    const started: string[][] = [];
    try {
      const code = runRun(['--tool', 'git', '--', 'git', 'status'], { out: () => {}, err: () => {} }, process.env, (c, a) => (started.push([c, ...a]), { status: 0, signal: null }));
      expect(code).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.TRUSTSHELL_HOME;
      else process.env.TRUSTSHELL_HOME = prev;
    }
    expect(started).toEqual([['git', 'status']]);
    const recs = readAutonomy(readFileSync(join(shadow, AUTONOMY_FILE), 'utf8')).records;
    expect(recs.find((r) => r.kind === 'level-change')).toMatchObject({ from: 1, to: 0 });
    expect(recs.filter((r) => r.kind === 'would-be').pop()).toMatchObject({ action: 'tool:git', level: 0, fixed: 'ALLOWED', earned: 'DENIED', mode: 'shadow' });
  });
});
