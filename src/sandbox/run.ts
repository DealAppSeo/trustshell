/**
 * `trustshell run --sandbox` and `trustshell sandbox promote` (C2 in docs/CONTAINMENT_MATRIX.md).
 *
 * After Guard has ALLOWED the command (src/cli/guard.ts decides first, exactly as for a plain run), this starts it
 * in the disposable mission container of mission.ts, the same runner the sandbox CLI uses: the current directory
 * bound READ-ONLY as the input (the command starts there), one outbox, no network, the hardened profile read back
 * before start, limits, the image's environment only. The container is destroyed and proven gone; the outbox goes
 * through the airlock into a per-mission quarantine under the TrustShell home; the mission dirs are deleted.
 * NOTHING is promoted here. Promotion is the owner's separate step, `trustshell sandbox promote <mission>`: the
 * promotion writer (its own key) decides, the mission token is revoked, a replay is refused, and the receipt is
 * signed by the harness key. Its terminal output is hashed, never shown: only files in the outbox come home.
 *
 *   <home>/sandbox/keys-harness, keys-promoter   two keys, never mounted (a cwd that holds the home is refused)
 *   <home>/sandbox/promoter-state                revoked mission tokens
 *   <home>/sandbox/missions/<id>/                quarantine/, passport.json, pending.json (holds the token,
 *                                                deleted on promote), then trusted-store/, receipt.json,
 *                                                public-keys.json
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { trustshellHome } from '../lib/guardrails';
import { signingKey } from '../lib/install-key';
import { DEFAULT_AIRLOCK, inspectOutbox, type Candidate } from './airlock';
import { deleteMissionDirs, destroyContainer, MissionRefused, nodeExec, runMission, type DestroyEvidence, type Exec, type MissionRun, type Runtime } from './mission';
import { buildPassport, signPassport, supervisorPolicy, type SignedPassport } from './passport';
import { Promoter, type Approval } from './promote';
import { buildReceipt, NOT_MEASURED_CWD, RUN_STATEMENT, signReceipt, verifyReceipt } from './receipt';

type IO = { out: (s: string) => void; err: (s: string) => void };

const keyDirs = (home: string) => ({ harness: join(home, 'sandbox', 'keys-harness'), promoter: join(home, 'sandbox', 'keys-promoter') });
export const missionDir = (home: string, id: string): string => join(home, 'sandbox', 'missions', id);
const MISSION_ID = /^[a-f0-9]{16}$/;

/** Is `p` the directory `dir` or inside it? */
function within(dir: string, p: string): boolean {
  const r = relative(dir, p);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

/**
 * The first TrustShell signing-key directory (<home>/sandbox/keys-harness|keys-promoter) nested inside `dir`, or null.
 * The active-home / ~/.trustshell checks in runSandboxed miss a SECOND home left inside the cwd; a read-only mount of
 * the cwd would then expose that home's keys to the worker (Grok, #668).
 * ponytail: bounded depth-6 scan skipping node_modules/.git; a key dir nested deeper or inside those slips. Realistic
 * homes sit at <cwd>/.trustshell/sandbox or <cwd>/sandbox.
 */
function keysUnder(dir: string, maxDepth = 6): string | null {
  const SKIP = new Set(['node_modules', '.git']);
  const KEY_SUBPATHS = [join('sandbox', 'keys-harness'), join('sandbox', 'keys-promoter')];
  const walk = (d: string, depth: number): string | null => {
    for (const sub of KEY_SUBPATHS) if (existsSync(join(d, sub))) return join(d, sub);
    if (depth >= maxDepth) return null;
    let entries: Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name)) continue;
      const hit = walk(join(d, e.name), depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dir, 0);
}

interface Pending {
  run: MissionRun;
  token: string;
  inspected: Candidate[];
  destroy: DestroyEvidence;
  cleanup: { temp_dirs_deleted: boolean; error: string | null };
  signing_keys_in_mounts: boolean;
  passport: SignedPassport;
}

export interface SandboxedRun {
  mission_id: string;
  exit_code: number | null;
  timed_out: boolean;
  candidates: Candidate[];
  passport_path: string;
}

/** Run `command` in a mission container with `cwd` as its read-only input. Throws MissionRefused if nothing started. */
export function runSandboxed(o: { home: string; cwd: string; runtime: Runtime; command: string[] }, exec: Exec = nodeExec): SandboxedRun {
  const home = resolve(o.home);
  const cwd = realpathSync(o.cwd);
  // The active home and the default one: either holds keys (this install's, the harness's, the promoter's).
  for (const h of [home, join(homedir(), '.trustshell')]) {
    const real = existsSync(h) ? realpathSync(h) : h;
    if (within(cwd, real) || within(real, cwd)) {
      throw new MissionRefused(`the current directory ${cwd} holds or is inside the TrustShell home ${real}, whose keys must never be mounted. Run from a project directory.`);
    }
  }
  const nestedKeys = keysUnder(cwd);
  if (nestedKeys) {
    throw new MissionRefused(`the current directory ${cwd} contains TrustShell signing keys (${nestedKeys}), which must never be mounted into the container. Move that TrustShell home out of the directory, or run from one that holds none.`);
  }
  const policy = supervisorPolicy(home); // measured as the mission starts
  const missionId = randomBytes(8).toString('hex');
  const { run, token } = runMission({ baseDir: tmpdir(), missionId, runtime: o.runtime, command: o.command, inputFiles: {}, inputDir: cwd }, exec);
  try {
    // Destroy first: the outbox is read only after nothing can write to it.
    const destroy = destroyContainer(run.container_id, exec);
    if (!destroy.container_removed) throw new Error(`container ${run.container_id} was not proven removed, so its outbox was not read`);
    const dir = missionDir(home, missionId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const inspected = inspectOutbox(run.paths.outbox, join(dir, 'quarantine'), { ...DEFAULT_AIRLOCK, canaries: [] });
    const cleanup = deleteMissionDirs(run.paths);
    const keys = keyDirs(home);
    const signingKeysInMounts = run.profile.observed.Mounts.some((m) => !!m.Source && (within(keys.harness, m.Source) || within(keys.promoter, m.Source)));
    const harness = signingKey(keys.harness);
    const passport = signPassport(buildPassport(run, policy, harness.signer), harness.key);
    const passportPath = join(dir, 'passport.json');
    writeFileSync(passportPath, JSON.stringify(passport, null, 2) + '\n', { mode: 0o644 });
    const pending: Pending = { run, token, inspected, destroy, cleanup, signing_keys_in_mounts: signingKeysInMounts, passport };
    writeFileSync(join(dir, 'pending.json'), JSON.stringify(pending, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return { mission_id: missionId, exit_code: run.worker.exit_code, timed_out: run.worker.timed_out, candidates: inspected, passport_path: passportPath };
  } finally {
    deleteMissionDirs(run.paths); // the input is the caller's directory and is never under the mission root
  }
}

export interface Promotion {
  receipt_path: string;
  keys_path: string;
  store: string;
  promoted: { name: string; sha256: string; path: string }[];
  refused: { name: string; reasons: string[] }[];
  verify: { ok: boolean; errors: string[] };
}

/** The owner's step: promote what the airlock quarantined, revoke the token, sign the receipt. Once per mission. */
export function promoteMission(home: string, id: string): Promotion {
  const dir = missionDir(resolve(home), id);
  const receiptPath = join(dir, 'receipt.json');
  if (existsSync(receiptPath)) throw new MissionRefused(`mission ${id} was already promoted: ${receiptPath}`);
  const pendingPath = join(dir, 'pending.json');
  if (!existsSync(pendingPath)) throw new MissionRefused(`no pending mission ${id} under ${join(resolve(home), 'sandbox', 'missions')}`);
  const p = JSON.parse(readFileSync(pendingPath, 'utf8')) as Pending;
  const keys = keyDirs(resolve(home));
  const harness = signingKey(keys.harness);
  const store = join(dir, 'trusted-store');
  const promoter = new Promoter({ keyDir: keys.promoter, stateDir: join(resolve(home), 'sandbox', 'promoter-state'), quarantineDir: join(dir, 'quarantine'), storeDir: store, canaries: [] });
  try {
    promoter.registerMission(id, p.run.token_sha256);
  } catch (e) {
    throw new MissionRefused(`mission ${id}: ${(e as Error).message}`);
  }
  const approval: Approval = {
    approver: 'owner:trustshell sandbox promote',
    source: 'trusted-harness',
    approved_sha256: p.inspected.flatMap((c) => (c.status === 'quarantined' && c.sha256 ? [c.sha256] : [])),
  };
  const req = { mission_id: id, token: p.token, worker_identity: `mission:${id}`, candidates: p.inspected, approval };
  const attempts = [{ label: 'the owner ran trustshell sandbox promote; the approval names every quarantined candidate', approval, decisions: promoter.decide(req) }];
  promoter.revoke(p.run.token_sha256);
  const replay = promoter.decide(req);
  const receipt = buildReceipt({
    run: p.run,
    passport: p.passport,
    signingKeysInMounts: p.signing_keys_in_mounts,
    inspected: p.inspected,
    attempts,
    trustedStoreAfter: existsSync(store) ? readdirSync(store) : [],
    destroy: p.destroy,
    cleanup: p.cleanup,
    revoked: promoter.revoked().includes(p.run.token_sha256),
    replay,
    harness: harness.signer,
    promoter: promoter.signer,
  });
  receipt.statement = RUN_STATEMENT;
  receipt.not_measured.push(NOT_MEASURED_CWD);
  const signed = signReceipt(receipt, harness.key);
  writeFileSync(receiptPath, JSON.stringify(signed, null, 2) + '\n', { flag: 'wx' });
  const keysPath = join(dir, 'public-keys.json');
  writeFileSync(keysPath, JSON.stringify({ harness: harness.signer, promoter: promoter.signer }, null, 2) + '\n');
  rmSync(pendingPath); // the mission token goes with it
  return {
    receipt_path: receiptPath,
    keys_path: keysPath,
    store,
    promoted: receipt.artifacts.promoted.map((a) => ({ name: a.name, sha256: String(a.sha256), path: join(store, String(a.sha256)) })),
    refused: receipt.artifacts.refused.map((a) => ({ name: a.name, reasons: a.reasons })),
    verify: verifyReceipt(signed),
  };
}

export const SANDBOX_USAGE = 'trustshell sandbox promote <mission> [--json]   (the owner step after trustshell run --sandbox)';

/** `trustshell sandbox promote <mission>`. */
export function sandboxCli(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env): number {
  const json = argv.includes('--json');
  const words = argv.filter((a) => a !== '--json');
  if (words[0] === '--help' || words[0] === '-h') {
    io.out(SANDBOX_USAGE);
    return 0;
  }
  if (words[0] !== 'promote' || words.length !== 2 || !MISSION_ID.test(words[1] as string)) {
    io.err(`error: sandbox takes promote and a mission id (16 hex characters)\n${SANDBOX_USAGE}`);
    return 2;
  }
  let r: Promotion;
  try {
    r = promoteMission(trustshellHome(env), words[1] as string);
  } catch (e) {
    io.err(e instanceof MissionRefused ? `REFUSED: ${e.message}` : `ERROR: ${(e as Error).message}`);
    return e instanceof MissionRefused ? 3 : 1;
  }
  if (json) io.out(JSON.stringify(r, null, 2));
  else {
    io.out(
      [
        `promoted ${r.promoted.length}, refused or held ${r.refused.length}; the mission token is revoked`,
        ...r.promoted.map((a) => `  promoted  ${a.name}  ->  ${a.path}`),
        ...r.refused.map((a) => `  refused   ${a.name}: ${a.reasons.join('; ')}`),
        `receipt   ${r.receipt_path} (${r.verify.ok ? 'verifies' : `DOES NOT VERIFY: ${r.verify.errors.join('; ')}`})`,
        `keys      ${r.keys_path}`,
      ].join('\n'),
    );
  }
  return r.verify.ok ? 0 : 1;
}
