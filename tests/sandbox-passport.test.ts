/**
 * TrustMedic passport v0 (IS-P1-10/11), without Docker. The passport is measured by the supervisor (docker
 * inspect, the pinned image, the Guard policy file, the grant it made), signed by the harness key, and
 * compared field by field across missions. Nothing in it comes from the worker.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultPolicy, policySha256, renderPolicyDocument, POLICY_FILE } from '../src/lib/guardrails';
import { signingKey } from '../src/lib/install-key';
import { canonicalize, jcsSha256 } from '../src/lib/jcs';
import { DEFAULT_LIMITS, MOUNTS, PINNED_DIGEST, PINNED_IMAGE, TMPFS_OPTS, type MissionRun } from '../src/sandbox/mission';
import {
  ATTESTATION_SOURCE,
  buildPassport,
  comparePassports,
  DRIFT_CLASS,
  NOT_PROVEN,
  signPassport,
  supervisorPolicy,
  verifyPassport,
  type Passport,
} from '../src/sandbox/passport';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sbx-passport-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(over: { runtime?: 'runc' | 'runsc'; mission?: string; imageId?: string; command?: string[]; pids?: number; docker?: string } = {}): MissionRun {
  const runtime = over.runtime ?? 'runc';
  const env = ['PATH=/usr/bin', 'NODE_VERSION=22'];
  const root = join(dir, 'm');
  const pids = over.pids ?? DEFAULT_LIMITS.pids;
  return {
    mission_id: over.mission ?? 'aabbccddeeff0011',
    container_name: 'ts-mission-x',
    container_id: 'c0ffee',
    image: { ref: PINNED_IMAGE, pinned_digest: PINNED_DIGEST, id: over.imageId ?? 'sha256:img', repo_digests: [`node@${PINNED_DIGEST}`], env },
    runtime: { requested: runtime, observed: runtime, docker_server_version: over.docker ?? '27.0.0', available: ['runc', runtime] },
    limits: { ...DEFAULT_LIMITS, pids },
    profile: {
      observed: {
        NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: [], SecurityOpt: ['no-new-privileges'], User: '65534:65534',
        Privileged: false, PidsLimit: pids, Memory: DEFAULT_LIMITS.memoryBytes, MemorySwap: DEFAULT_LIMITS.memoryBytes,
        NanoCpus: DEFAULT_LIMITS.cpus * 1e9, Runtime: runtime, Tmpfs: { '/tmp': TMPFS_OPTS },
        Mounts: [
          { Type: 'bind', Source: join(root, 'input'), Destination: MOUNTS.input, RW: false },
          { Type: 'bind', Source: join(root, 'outbox'), Destination: MOUNTS.outbox, RW: true },
          { Type: 'bind', Source: join(root, 'token'), Destination: MOUNTS.token, RW: false },
        ],
        Env: env,
      },
      checks: [],
      all_ok: true,
      post_run_all_ok: true,
    },
    worker: { command: over.command ?? ['node', '-e', '1'], exit_code: 0, timed_out: false, oom_killed: false, logs_sha256: 'x', logs_bytes: 0 },
    token_sha256: 'a'.repeat(64),
    paths: { root, input: join(root, 'input'), outbox: join(root, 'outbox'), tokenFile: join(root, 'token') },
  };
}

const harness = () => signingKey(join(dir, 'keys-harness'));
const passportOf = (r: MissionRun, home = join(dir, 'home')) => buildPassport(r, supervisorPolicy(home), harness().signer);

/** Rebuild an object with every key order reversed, at every depth. */
const reorder = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;

describe('the passport is measured by the supervisor', () => {
  it('every field names its source; the attestation source is the supervisor; it says what a match does not prove', () => {
    const p = passportOf(run());
    for (const [k, f] of Object.entries(p)) {
      if (k === 'schema' || k === 'not_proven') continue;
      expect(typeof (f as { source: unknown }).source).toBe('string');
      expect((f as { source: string }).source).toMatch(/^supervisor:/);
    }
    expect(p.attestation.value.source).toBe(ATTESTATION_SOURCE);
    expect(ATTESTATION_SOURCE).toBe('supervisor:docker-inspect');
    expect(p.attestation.value.harness_key_fingerprint).toBe(harness().signer.fingerprint);
    expect(p.not_proven).toBe(NOT_PROVEN);
    expect(NOT_PROVEN).toMatch(/reasoning/);
    expect(NOT_PROVEN).toMatch(/memory/);
    expect(p.tool_belt.value.manifest.network).toBe('none');
    expect(p.tool_belt.value.manifest_sha256).toBe(jcsSha256(p.tool_belt.value.manifest));
    expect(p.trusted_memory.value.version).toBe('none');
    expect(JSON.stringify(p)).not.toContain(dir.replace(/\\/g, '\\\\')); // host paths are per-run; they stay out
  });

  it('reads the Guard policy from the supervisor home: absent, then the policySha256 of the file there', () => {
    const home = join(dir, 'home');
    expect(passportOf(run(), home).policy.value).toEqual({ state: 'absent', sha256: null });
    mkdirSync(home);
    const pol = defaultPolicy(1_800_000_000, 30);
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: pol, signature: null }));
    expect(passportOf(run(), home).policy.value).toEqual({ state: 'ok', sha256: policySha256(pol) });
    writeFileSync(join(home, POLICY_FILE), '{not json');
    expect(passportOf(run(), home).policy.value).toEqual({ state: 'invalid', sha256: null });
  });

  it('files the worker writes (a policy, a tool belt, a passport) do not change it', () => {
    const home = join(dir, 'home');
    mkdirSync(home);
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: defaultPolicy(1_800_000_000, 30), signature: null }));
    const r = run();
    const before = canonicalize(passportOf(r, home));
    mkdirSync(r.paths.outbox, { recursive: true });
    const forged = { ...defaultPolicy(1_800_000_000, 365), actions: ['tool:*'] };
    writeFileSync(join(r.paths.outbox, POLICY_FILE), renderPolicyDocument({ policy: forged, signature: null }));
    writeFileSync(join(r.paths.outbox, 'tool-belt.json'), JSON.stringify({ commands: [['sh']], network: 'host' }));
    writeFileSync(join(r.paths.outbox, 'passport.json'), JSON.stringify({ policy: { value: { state: 'ok', sha256: policySha256(forged) } } }));
    writeFileSync(join(r.paths.root, POLICY_FILE), renderPolicyDocument({ policy: forged, signature: null }));
    expect(canonicalize(passportOf(r, home))).toBe(before);
  });
});

describe('digest and signature', () => {
  it('the digest is stable under key reordering, and the signature still verifies', () => {
    const h = harness();
    const s = signPassport(passportOf(run()), h.key);
    expect(s.sha256).toBe(jcsSha256(s.passport));
    const re = reorder(s.passport) as Passport;
    expect(JSON.stringify(re)).not.toBe(JSON.stringify(s.passport));
    expect(jcsSha256(re)).toBe(s.sha256);
    expect(verifyPassport({ ...s, passport: re }, h.signer)).toEqual([]);
  });

  it('a one-byte change to the passport, the digest or the signature fails', () => {
    const h = harness();
    const s = signPassport(passportOf(run()), h.key);
    expect(verifyPassport(s, h.signer)).toEqual([]);
    const edited = JSON.parse(JSON.stringify(s));
    edited.passport.model_build.value.image_id = 'sha256:imh'; // one byte
    expect(verifyPassport(edited, h.signer).join('\n')).toMatch(/digest|signature/);
    const sig = Buffer.from(s.signature, 'base64');
    sig[0] = sig[0]! ^ 1;
    expect(verifyPassport({ ...s, signature: sig.toString('base64') }, h.signer).join('\n')).toMatch(/signature/);
    expect(verifyPassport({ ...s, sha256: '0'.repeat(64) }, h.signer).join('\n')).toMatch(/digest/);
    const other = signingKey(join(dir, 'keys-other')).signer;
    expect(verifyPassport(s, other).join('\n')).toMatch(/signature|harness key/);
  });
});

describe('comparePassports', () => {
  const changed = (a: Passport, b: Passport) =>
    Object.fromEntries(comparePassports(a, b).drifts.filter((d) => d.status !== 'identical').map((d) => [d.field, `${d.status}/${d.class}`]));

  it('two missions with the same configuration match; only the mission field differs and it is ignored', () => {
    const c = comparePassports(passportOf(run()), passportOf(run({ mission: '0011223344556677' })));
    expect(c.verdict).toBe('match');
    expect(changed(passportOf(run()), passportOf(run({ mission: '0011223344556677' })))).toEqual({ mission: 'changed/ignored' });
    expect(c.not_proven).toBe(NOT_PROVEN);
  });

  it.each([
    ['runtime', { runtime: 'runsc' }, { runtime: 'changed/requalify' }, 'requalify'],
    ['image', { imageId: 'sha256:other' }, { model_build: 'changed/requalify' }, 'requalify'],
    ['a limit', { pids: 128 }, { tool_belt: 'changed/requalify' }, 'requalify'],
    ['the command', { command: ['node', '-e', '2'] }, { identity: 'changed/requalify', tool_belt: 'changed/requalify' }, 'requalify'],
    ['the docker version', { docker: '28.0.0' }, { deployment: 'changed/review' }, 'review'],
  ] as const)('classifies a %s change', (_l, over, want, verdict) => {
    const b = run(over as Parameters<typeof run>[0]);
    expect(changed(passportOf(run()), passportOf(b))).toEqual(want);
    expect(comparePassports(passportOf(run()), passportOf(b)).verdict).toBe(verdict);
  });

  it('a policy change, an isolation change and a permission change each require requalification', () => {
    const home = join(dir, 'home');
    const a = passportOf(run(), home);
    mkdirSync(home);
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: defaultPolicy(1_800_000_000, 30), signature: null }));
    expect(changed(a, passportOf(run(), home))).toEqual({ policy: 'changed/requalify' });
    const ro = run();
    ro.profile.observed.ReadonlyRootfs = false;
    expect(changed(passportOf(run()), passportOf(ro))).toEqual({ isolation: 'changed/requalify' });
    const cap = run();
    cap.profile.observed.CapAdd = ['NET_ADMIN'];
    expect(changed(passportOf(run()), passportOf(cap))).toEqual({ permissions: 'changed/requalify' });
  });

  it('a different harness key is an attestation change for review; a missing or unknown field requalifies', () => {
    const a = passportOf(run());
    const b = buildPassport(run(), supervisorPolicy(join(dir, 'home')), signingKey(join(dir, 'keys-other')).signer);
    expect(changed(a, b)).toEqual({ attestation: 'changed/review' });
    const missing = JSON.parse(JSON.stringify(a));
    delete missing.trusted_memory;
    expect(changed(a, missing)).toEqual({ trusted_memory: 'missing/requalify' });
    expect(comparePassports(a, missing).verdict).toBe('requalify');
    const extra = { ...JSON.parse(JSON.stringify(a)), extra_tool: { value: 1, source: 'agent' } };
    expect(changed(a, extra)).toEqual({ extra_tool: 'missing/requalify' });
    const reSourced = JSON.parse(JSON.stringify(a));
    reSourced.policy.source = 'agent:self-report';
    expect(changed(a, reSourced)).toEqual({ policy: 'changed/requalify' });
  });

  it('every passport field has a drift class', () => {
    for (const k of Object.keys(passportOf(run()))) expect(DRIFT_CLASS[k]).toBeDefined();
    expect(DRIFT_CLASS.mission).toBe('ignored');
  });
});
