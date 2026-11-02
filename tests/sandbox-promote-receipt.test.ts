/**
 * The promotion gate and the signed receipt, without Docker. The gate has its own key, signs every
 * decision, re-checks quarantine copies itself, refuses self-approval, approvals from the outbox and
 * revoked tokens. The verifier needs only public keys and fails on any tampering.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signingKey } from '../src/lib/install-key';
import { inspectOutbox, sha256hex, type Candidate } from '../src/sandbox/airlock';
import { DEFAULT_LIMITS, MOUNTS, PINNED_DIGEST, PINNED_IMAGE, TMPFS_OPTS, type MissionRun } from '../src/sandbox/mission';
import { Promoter, REVOKED_REASON, verifyDecision, type Approval } from '../src/sandbox/promote';
import { buildReceipt, demoProblems, NOT_MEASURED_RUNSC, RECEIPT_SCHEMA, RECEIPT_SCHEMA_V1, signReceipt, verifyReceipt, type Attempt, type SignedReceipt } from '../src/sandbox/receipt';
import { buildPassport, signPassport } from '../src/sandbox/passport';
import { main, missionCanaries } from '../src/sandbox/cli';
import { signValue } from '../src/lib/install-key';

const CANARY = 'TS-CANARY-fedcba9876543210';
const MISSION = 'aabbccddeeff0011';
const WORKER = `mission:${MISSION}`;
const TOKEN = 'a'.repeat(64);

let dir: string;
let outbox: string;
let quarantine: string;
let store: string;
let promoter: Promoter;
let candidates: Candidate[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sbx-promote-test-'));
  outbox = join(dir, 'outbox');
  quarantine = join(dir, 'quarantine');
  store = join(dir, 'store');
  mkdirSync(outbox);
  writeFileSync(join(outbox, 'result.json'), '{"count":10,"sum":55}');
  writeFileSync(join(outbox, 'notes.txt'), `notes: ${CANARY}`);
  writeFileSync(join(outbox, 'approval.json'), `{"approver":"${WORKER}","approved":["result.json","notes.txt"]}`);
  writeFileSync(join(outbox, 'memory.md'), 'Proposed memory');
  candidates = inspectOutbox(outbox, quarantine, { maxFileBytes: 4096, maxFiles: 32, canaries: [CANARY] });
  promoter = new Promoter({ keyDir: join(dir, 'keys-promoter'), stateDir: join(dir, 'state'), quarantineDir: quarantine, storeDir: store, canaries: [CANARY] });
  promoter.registerMission(MISSION, sha256hex(TOKEN));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const allShas = () => candidates.flatMap((c) => (c.sha256 ? [c.sha256] : []));
const trusted = (): Approval => ({ approver: 'harness:test', source: 'trusted-harness', approved_sha256: allShas() });
const req = (approval: Approval | null, token = TOKEN) => ({ mission_id: MISSION, token, worker_identity: WORKER, approval, candidates });
const outcome = (ds: ReturnType<Promoter['decide']>) => Object.fromEntries(ds.map((d) => [d.decision.name, d.decision.decision]));

describe('the promotion gate', () => {
  it('registers the mission token as a canary: a worker that copies its token to the outbox is refused', () => {
    writeFileSync(join(outbox, 'token-leak.txt'), `stolen token: ${TOKEN}`);
    const inspected = inspectOutbox(outbox, join(dir, 'q-token'), { maxFileBytes: 4096, maxFiles: 32, canaries: missionCanaries(CANARY, TOKEN) });
    const leak = inspected.find((c) => c.name === 'token-leak.txt');
    expect(leak?.status).toBe('refused');
    expect(leak?.reasons.join(' ')).toMatch(/canary/);
  });

  it('with a trusted approval: promotes only the benign artifact; refuses the canary and the self-approval file; holds memory', () => {
    const ds = promoter.decide(req(trusted()));
    expect(outcome(ds)).toEqual({ 'approval.json': 'refuse', 'memory.md': 'refuse', 'notes.txt': 'refuse', 'result.json': 'promote' });
    const why = (n: string) => ds.find((d) => d.decision.name === n)!.decision.reasons.join(' | ');
    expect(why('notes.txt')).toMatch(/canary/);
    expect(why('approval.json')).toMatch(/worker-written approval/);
    expect(why('memory.md')).toMatch(/held for human review, never auto-promoted/);
    expect(readdirSync(store)).toEqual([sha256hex('{"count":10,"sum":55}')]);
    for (const d of ds) expect(verifyDecision(d, promoter.signer)).toBe(true);
  });

  it('refuses everything when the approval claims the worker identity or comes from the outbox', () => {
    const self = promoter.decide(req({ approver: WORKER, source: 'outbox', approved_sha256: allShas() }));
    expect(self.every((d) => d.decision.decision === 'refuse')).toBe(true);
    expect(self[0]!.decision.reasons).toEqual(expect.arrayContaining(['approval claims the worker identity (self-approval)', 'approval came from "outbox", not the trusted side']));
    const fromOutbox = promoter.decide(req({ approver: 'harness:test', source: 'outbox', approved_sha256: allShas() }));
    expect(fromOutbox.every((d) => d.decision.decision === 'refuse')).toBe(true);
    const otherMission = promoter.decide(req({ approver: 'mission:ffff', source: 'trusted-harness', approved_sha256: allShas() }));
    expect(otherMission.every((d) => d.decision.decision === 'refuse')).toBe(true);
    expect(readdirSync(store)).toEqual([]);
  });

  it('refuses with no approval, and with a token that is not the mission token', () => {
    expect(promoter.decide(req(null)).every((d) => d.decision.reasons.includes('no approval'))).toBe(true);
    const wrong = promoter.decide(req(trusted(), 'b'.repeat(64)));
    expect(wrong.every((d) => d.decision.reasons.includes('token is not the one registered for this mission'))).toBe(true);
  });

  it('refuses a revoked token, and the revocation survives a new promoter instance', () => {
    promoter.revoke(sha256hex(TOKEN));
    const replay = promoter.decide(req(trusted()));
    expect(replay.every((d) => d.decision.decision === 'refuse' && d.decision.reasons.includes(REVOKED_REASON))).toBe(true);
    const again = new Promoter({ keyDir: join(dir, 'keys-promoter'), stateDir: join(dir, 'state'), quarantineDir: quarantine, storeDir: store, canaries: [CANARY] });
    expect(() => again.registerMission(MISSION, sha256hex(TOKEN))).toThrow(/revoked/);
    expect(readdirSync(store)).toEqual([]);
  });

  it('does not trust the airlock verdict: a canary file wrongly marked quarantined is still refused', () => {
    const body = `leak ${CANARY}`;
    const sha = sha256hex(body);
    writeFileSync(join(quarantine, sha), body);
    const forged: Candidate = { name: 'clean.txt', class: 'artifact', size: body.length, sha256: sha, type: 'text', status: 'quarantined', reasons: [] };
    const [d] = promoter.decide({ ...req({ ...trusted(), approved_sha256: [sha] }), candidates: [forged] });
    expect(d!.decision).toMatchObject({ decision: 'refuse', reasons: ['contains registered canary #0'] });
  });

  it('refuses a quarantine copy whose bytes changed, and a sha that is not a sha (no path tricks)', () => {
    const r = candidates.find((c) => c.name === 'result.json')!;
    const q = join(quarantine, r.sha256!);
    if (process.platform !== 'win32') chmodSync(q, 0o644);
    else chmodSync(q, 0o666);
    writeFileSync(q, '{"count":10,"sum":56}');
    const [d] = promoter.decide({ ...req(trusted()), candidates: [r] });
    expect(d!.decision.reasons).toContain('quarantine copy does not match its hash');
    const traversal: Candidate = { ...r, sha256: '../../etc/passwd' };
    const [t] = promoter.decide({ ...req({ ...trusted(), approved_sha256: ['../../etc/passwd'] }), candidates: [traversal] });
    expect(t!.decision.decision).toBe('refuse');
    expect(readdirSync(store)).toEqual([]);
  });

  it('a held tool config is refused even when the trusted approval names it', () => {
    writeFileSync(join(outbox, '.mcp.json'), '{"mcpServers":{}}');
    candidates = inspectOutbox(outbox, quarantine, { maxFileBytes: 4096, maxFiles: 32, canaries: [CANARY] });
    const ds = promoter.decide(req(trusted()));
    expect(ds.find((d) => d.decision.name === '.mcp.json')!.decision.reasons).toContain('tool-config is held for human review, never auto-promoted');
  });

  it('a decision signature fails if the decision is edited', () => {
    const [d] = promoter.decide(req(trusted()));
    expect(verifyDecision({ ...d!, decision: { ...d!.decision, decision: 'promote', reasons: [] } }, promoter.signer)).toBe(false);
  });
});

/** A synthetic run whose observed profile meets the rules (the real one comes from docker inspect in CI). */
function fakeRun(runtime: 'runc' | 'runsc' = 'runc'): MissionRun {
  const env = ['PATH=/usr/bin', 'NODE_VERSION=22'];
  return {
    mission_id: MISSION,
    container_name: `ts-mission-${MISSION}`,
    container_id: 'c0ffee',
    image: { ref: PINNED_IMAGE, pinned_digest: PINNED_DIGEST, id: 'sha256:img', repo_digests: [`node@${PINNED_DIGEST}`], env },
    runtime: { requested: runtime, observed: runtime, docker_server_version: '27.0.0', available: ['runc', runtime] },
    limits: DEFAULT_LIMITS,
    profile: {
      observed: {
        NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: [], SecurityOpt: ['no-new-privileges'], User: '65534:65534',
        Privileged: false, PidsLimit: DEFAULT_LIMITS.pids, Memory: DEFAULT_LIMITS.memoryBytes, MemorySwap: DEFAULT_LIMITS.memoryBytes,
        NanoCpus: DEFAULT_LIMITS.cpus * 1e9, Runtime: runtime, Tmpfs: { '/tmp': TMPFS_OPTS },
        Mounts: [
          { Type: 'bind', Source: '/m/input', Destination: MOUNTS.input, RW: false },
          { Type: 'bind', Source: '/m/outbox', Destination: MOUNTS.outbox, RW: true },
          { Type: 'bind', Source: '/m/token', Destination: MOUNTS.token, RW: false },
        ],
        Env: env,
      },
      checks: [],
      all_ok: true,
      post_run_all_ok: true,
    },
    worker: { command: ['node', '-e', '1'], exit_code: 0, timed_out: false, oom_killed: false, logs_sha256: sha256hex(''), logs_bytes: 0 },
    token_sha256: sha256hex(TOKEN),
    paths: { root: '/m', input: '/m/input', outbox: '/m/outbox', tokenFile: '/m/token' },
  };
}

describe('the signed receipt and its verifier', () => {
  let signed: SignedReceipt;
  let pins: { harness: string; promoter: string };
  const make = (runtime: 'runc' | 'runsc' = 'runc') => {
    const harness = signingKey(join(dir, 'keys-harness'));
    const self: Approval = { approver: WORKER, source: 'outbox', approved_sha256: allShas() };
    const attempts: Attempt[] = [
      { label: 'self', approval: self, decisions: promoter.decide(req(self)) },
      { label: 'trusted', approval: trusted(), decisions: promoter.decide(req(trusted())) },
    ];
    promoter.revoke(sha256hex(TOKEN));
    const replay = promoter.decide(req(trusted()));
    const run = fakeRun(runtime);
    const r = buildReceipt({
      run,
      passport: signPassport(buildPassport(run, { state: 'absent', sha256: null }, harness.signer), harness.key),
      signingKeysInMounts: false,
      inspected: candidates,
      attempts,
      trustedStoreAfter: readdirSync(store),
      destroy: { container_removed: true, rm_exit_code: 0, inspect_after_exit_code: 1, inspect_after_error: 'Error: No such object: c0ffee' },
      cleanup: { temp_dirs_deleted: true, error: null },
      revoked: true,
      replay,
      harness: harness.signer,
      promoter: promoter.signer,
    });
    pins = { harness: harness.signer.fingerprint, promoter: promoter.signer.fingerprint };
    return signReceipt(r, harness.key);
  };
  const clone = (s: SignedReceipt): SignedReceipt => JSON.parse(JSON.stringify(s));
  beforeEach(() => {
    signed = make();
  });

  it('verifies with only the pinned public keys, and meets the first-deliverable expectations', () => {
    expect(verifyReceipt(clone(signed), pins)).toEqual({ ok: true, errors: [] });
    expect(demoProblems(signed.receipt)).toEqual([]);
    expect(signed.receipt.denial_tested_at).toBe('promotion gate');
    expect(signed.receipt.statement).toMatch(/In-container containment was not attacked/);
    expect(signed.receipt.not_measured).toContain(NOT_MEASURED_RUNSC);
    expect(JSON.stringify(signed)).not.toContain(CANARY);
    expect(JSON.stringify(signed)).not.toContain(TOKEN);
  });

  /** Fresh promoter state (and fresh keys) for a second mission. */
  const fresh = () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    mkdirSync(outbox);
    writeFileSync(join(outbox, 'result.json'), '{"count":10,"sum":55}');
    writeFileSync(join(outbox, 'notes.txt'), `notes: ${CANARY}`);
    writeFileSync(join(outbox, 'approval.json'), '{"approver":"x"}');
    writeFileSync(join(outbox, 'memory.md'), 'm');
    candidates = inspectOutbox(outbox, quarantine, { maxFileBytes: 4096, maxFiles: 32, canaries: [CANARY] });
    promoter = new Promoter({ keyDir: join(dir, 'keys-promoter'), stateDir: join(dir, 'state'), quarantineDir: quarantine, storeDir: store, canaries: [CANARY] });
    promoter.registerMission(MISSION, sha256hex(TOKEN));
  };

  it('a runsc receipt does not carry the runsc caveat', () => {
    fresh();
    const s = make('runsc');
    expect(s.receipt.not_measured).not.toContain(NOT_MEASURED_RUNSC);
    expect(verifyReceipt(s, pins).ok).toBe(true);
  });

  const tampers: [string, (s: SignedReceipt) => void, RegExp][] = [
    ['an edited field', (s) => (s.receipt.worker.exit_code = 1), /harness signature/],
    ['a wrong harness pin', () => {}, /harness key is not the pinned one/],
    ['network not none', (s) => (s.receipt.profile.observed.NetworkMode = 'bridge'), /profile NetworkMode/],
    ['a dropped not_measured line', (s) => s.receipt.not_measured.splice(0, 1), /not_measured is missing: behaviour of the restrictions/],
    ['a promoted canary', (s) => s.receipt.artifacts.promoted.push({ name: 'notes.txt', sha256: 'x' }), /promoted list does not match/],
    ['an unproven destroy', (s) => (s.receipt.destroy.container_removed = false), /container removal not proven/],
    ['a decision carrying a signature from another decision', (s) => (s.receipt.attempts[1]!.decisions[0]!.signature = s.receipt.attempts[0]!.decisions[1]!.signature), /promoter signature does not verify/],
    ['a replay that was not refused', (s) => (s.receipt.revoke.replay_after_revoke = []), /replay after revocation/],
    ['an altered passport', (s) => (s.receipt.passport!.passport.policy.value.state = 'ok'), /passport: (digest|harness signature)/],
    ['a stripped passport', (s) => delete s.receipt.passport, /no passport/],
  ];
  it.each(tampers)('fails on %s', (label, mutate, why) => {
    const s = clone(signed);
    mutate(s);
    const p = label === 'a wrong harness pin' ? { ...pins, harness: '0'.repeat(64) } : pins;
    const v = verifyReceipt(s, p);
    expect(v.ok).toBe(false);
    expect(v.errors.join('\n')).toMatch(why);
  });

  it('carries a signed passport (schema v2); a re-signed passport that disagrees with the receipt is refused', () => {
    expect(signed.receipt.schema).toBe(RECEIPT_SCHEMA);
    expect(signed.receipt.passport!.passport.runtime.value.observed).toBe('runc');
    const key = signingKey(join(dir, 'keys-harness')).key;
    const s = clone(signed);
    const lie = s.receipt.passport!.passport;
    lie.tool_belt.value.manifest.network = 'bridge';
    s.receipt.passport = signPassport(lie, key);
    const v = verifyReceipt({ receipt: s.receipt, signature: signValue(s.receipt, key) }, pins);
    expect(v.errors.join(' | ')).toMatch(/passport tool_belt does not match the receipt/);
  });

  it('a v1 receipt (before passports) still verifies under v1 rules', () => {
    const key = signingKey(join(dir, 'keys-harness')).key;
    const r = clone(signed).receipt;
    delete r.passport;
    r.schema = RECEIPT_SCHEMA_V1;
    expect(verifyReceipt({ receipt: r, signature: signValue(r, key) }, pins)).toEqual({ ok: true, errors: [] });
  });

  it('cli compare: runc against runsc differs only in runtime (and the per-run key); anything else fails', () => {
    const a = join(tmpdir(), `sbx-cmp-a-${process.pid}.json`);
    const b = join(tmpdir(), `sbx-cmp-b-${process.pid}.json`);
    try {
      writeFileSync(a, JSON.stringify(signed));
      fresh();
      writeFileSync(b, JSON.stringify(make('runsc')));
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(main(['compare', '--a', a, '--b', b, '--allow', 'runtime,attestation'])).toBe(0);
      expect(main(['compare', '--a', a, '--b', b, '--allow', 'attestation'])).toBe(1);
      expect(JSON.parse(String(log.mock.calls[log.mock.calls.length - 1]![0])).unexpected).toEqual(['runtime']);
      writeFileSync(b, JSON.stringify({ ...JSON.parse(JSON.stringify(signed)), signature: 'AAAA' }));
      expect(main(['compare', '--a', a, '--b', b, '--allow', 'runtime,attestation'])).toBe(1);
      log.mockRestore();
    } finally {
      rmSync(a, { force: true });
      rmSync(b, { force: true });
    }
  });

  it('a malformed receipt is refused, not thrown', () => {
    expect(verifyReceipt({} as SignedReceipt).ok).toBe(false);
  });
});
