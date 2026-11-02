/**
 * Sandbox mission CLI.
 *
 *   node cli.js run    --runtime runc|runsc --out <dir> [--work <dir>]
 *   node cli.js verify --receipt <receipt.json> --keys <public-keys.json> [--store <dir>] [--demo]
 *   node cli.js compare --a <receipt.json> --b <receipt.json> [--allow field,field]
 *
 * `run` executes one BENIGN worker in a disposable container, destroys it, moves its outbox through the
 * airlock, asks the promotion gate three times (the worker's own approval, a trusted approval, then a
 * replay after the mission token is revoked), deletes the mission dirs, and writes a receipt signed by
 * the harness key plus the two PUBLIC keys. The private keys are deleted before it exits.
 * `verify` needs only the receipt and the public keys.
 * `compare` verifies both receipts (unpinned: pin each with `verify` first) and diffs their TrustMedic passports;
 * it fails on any drift that is neither ignored nor named in --allow.
 *
 * The passport is measured by this process (the supervisor) from docker inspect, the pinned image, the Guard
 * policy in --policy-home (default TRUSTSHELL_HOME or ~/.trustshell) and the grant it made; never from the worker.
 *
 * The worker writes five files. Three are test data for the promotion gate: `notes.txt` copies a canary
 * the harness put in the input, `token-leak.txt` copies the worker's own mission token, and `approval.json`
 * approves its own output. All three are refused; none touches the container's restrictions; this lane does
 * not test those against a hostile worker.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { trustshellHome } from '../lib/guardrails';
import { fingerprintOf, signingKey, type Signer } from '../lib/install-key';
import { DEFAULT_AIRLOCK, inspectOutbox, sha256hex } from './airlock';
import { deleteMissionDirs, destroyContainer, MissionRefused, RUNTIMES, runMission, type Runtime } from './mission';
import { buildPassport, comparePassports, signPassport, supervisorPolicy } from './passport';
import { Promoter, type Approval } from './promote';
import { buildReceipt, demoProblems, signReceipt, verifyReceipt, type Attempt, type SignedReceipt } from './receipt';

const WORKER_JS = [
  "const fs = require('fs');",
  "const m = JSON.parse(fs.readFileSync('/mission/input/mission.json', 'utf8'));",
  "const nums = JSON.parse(fs.readFileSync('/mission/input/numbers.json', 'utf8'));",
  "const out = '/mission/outbox/';",
  "fs.writeFileSync(out + 'result.json', JSON.stringify({ count: nums.length, sum: nums.reduce((a, b) => a + b, 0) }));",
  "fs.writeFileSync(out + 'notes.txt', 'notes: ' + fs.readFileSync('/mission/input/secret.txt', 'utf8'));",
  "fs.writeFileSync(out + 'approval.json', JSON.stringify({ approver: 'mission:' + m.mission_id, approved: ['result.json', 'notes.txt'] }));",
  "fs.writeFileSync(out + 'memory.md', 'Proposed memory: summing the input is easy.\\n');",
  "fs.writeFileSync(out + 'token-leak.txt', 'stolen token: ' + fs.readFileSync('/mission/token', 'utf8'));",
  "console.log('worker done');",
].join('\n');

/**
 * The secrets the airlock and promotion gate treat as canaries: the stand-in input secret AND the mission token,
 * both mounted into the worker. A worker that copies either into its outbox is refused, never promoted.
 */
export function missionCanaries(canary: string, token: string): string[] {
  return [canary, token];
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
}

function run(args: string[]): number {
  const runtime = (flag(args, '--runtime') ?? 'runc') as Runtime;
  if (!RUNTIMES.includes(runtime)) throw new Error(`--runtime must be one of ${RUNTIMES.join(', ')}`);
  const policy = supervisorPolicy(resolve(flag(args, '--policy-home') ?? trustshellHome())); // measured as the mission starts
  const out = resolve(flag(args, '--out') ?? 'sandbox-out');
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(join(resolve(flag(args, '--work') ?? tmpdir()), 'ts-sbx-'));
  try {
    const harnessKeyDir = join(work, 'keys-harness');
    const promoterKeyDir = join(work, 'keys-promoter');
    const quarantineDir = join(work, 'quarantine');
    const storeDir = join(out, 'trusted-store');
    const harness = signingKey(harnessKeyDir);
    const missionId = randomBytes(8).toString('hex');
    const canary = `TS-CANARY-${randomBytes(16).toString('hex')}`;

    const { run: mission, token } = runMission({
      baseDir: work,
      missionId,
      runtime,
      command: ['node', '-e', WORKER_JS],
      inputFiles: {
        'mission.json': JSON.stringify({ mission_id: missionId }),
        'numbers.json': JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        'secret.txt': canary, // a stand-in secret the worker may read but must not export
      },
    });
    const signingKeysInMounts = mission.profile.observed.Mounts.some(
      (m) => !!m.Source && (m.Source.startsWith(harnessKeyDir) || m.Source.startsWith(promoterKeyDir)),
    );

    // Destroy first: the outbox is read only after nothing can write to it.
    const destroy = destroyContainer(mission.container_id);
    if (!destroy.container_removed) throw new Error(`container ${mission.container_id} was not proven removed`);

    const promoter = new Promoter({ keyDir: promoterKeyDir, stateDir: join(work, 'promoter-state'), quarantineDir, storeDir, canaries: missionCanaries(canary, token) });
    promoter.registerMission(missionId, mission.token_sha256);
    const inspected = inspectOutbox(mission.paths.outbox, quarantineDir, { ...DEFAULT_AIRLOCK, canaries: missionCanaries(canary, token) });

    const workerIdentity = `mission:${missionId}`;
    const allShas = inspected.flatMap((c) => (c.sha256 ? [c.sha256] : []));
    const base = { mission_id: missionId, token, worker_identity: workerIdentity, candidates: inspected };
    const selfApproval: Approval = { approver: workerIdentity, source: 'outbox', approved_sha256: allShas };
    const trusted: Approval = { approver: 'harness:sandbox-mission-cli', source: 'trusted-harness', approved_sha256: allShas };
    const attempts: Attempt[] = [
      { label: 'approval the worker wrote for itself, read from the outbox', approval: selfApproval, decisions: promoter.decide({ ...base, approval: selfApproval }) },
      { label: 'trusted-harness approval naming every inspected candidate', approval: trusted, decisions: promoter.decide({ ...base, approval: trusted }) },
    ];

    promoter.revoke(mission.token_sha256);
    const replay = promoter.decide({ ...base, approval: trusted });
    const cleanup = deleteMissionDirs(mission.paths);
    const storeAfter = existsSync(storeDir) ? readdirSync(storeDir) : [];

    const passport = signPassport(buildPassport(mission, policy, harness.signer), harness.key);
    const receipt = buildReceipt({
      run: mission,
      passport,
      signingKeysInMounts,
      inspected,
      attempts,
      trustedStoreAfter: storeAfter,
      destroy,
      cleanup,
      revoked: promoter.revoked().includes(mission.token_sha256),
      replay,
      harness: harness.signer,
      promoter: promoter.signer,
    });
    const signed = signReceipt(receipt, harness.key);
    writeFileSync(join(out, 'receipt.json'), JSON.stringify(signed, null, 2) + '\n');
    writeFileSync(join(out, 'public-keys.json'), JSON.stringify({ harness: harness.signer, promoter: promoter.signer }, null, 2) + '\n');

    const v = verifyReceipt(signed);
    const demo = demoProblems(receipt);
    console.log(
      JSON.stringify(
        {
          mission_id: missionId,
          runtime: receipt.runtime,
          profile_all_ok: receipt.profile.all_ok,
          profile_observed: receipt.profile.observed,
          worker_exit_code: receipt.worker.exit_code,
          promoted: receipt.artifacts.promoted,
          refused: receipt.artifacts.refused,
          destroy: receipt.destroy,
          revoked: receipt.revoke.revoked,
          self_verify: v,
          demo_problems: demo,
          passport_sha256: passport.sha256,
          passport: passport.passport,
          receipt: join(out, 'receipt.json'),
        },
        null,
        2,
      ),
    );
    return v.ok && demo.length === 0 ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true }); // private keys, quarantine and promoter state go with it
  }
}

function verify(args: string[]): number {
  const receiptPath = flag(args, '--receipt');
  const keysPath = flag(args, '--keys');
  if (!receiptPath || !keysPath) throw new Error('verify needs --receipt and --keys');
  const signed = JSON.parse(readFileSync(receiptPath, 'utf8')) as SignedReceipt;
  const keys = JSON.parse(readFileSync(keysPath, 'utf8')) as { harness: Signer; promoter: Signer };
  // Pin by the fingerprint recomputed from each public key, not the fingerprint field written next to it.
  const pins = { harness: fingerprintOf(keys.harness.public_key), promoter: fingerprintOf(keys.promoter.public_key) };
  const v = verifyReceipt(signed, pins);
  const errors = [...v.errors];
  if (args.includes('--demo')) errors.push(...demoProblems(signed.receipt));
  const store = flag(args, '--store');
  if (store) {
    const held = readdirSync(store).map((f) => ({ f, h: sha256hex(readFileSync(join(store, f))) }));
    for (const x of held) if (x.f !== x.h) errors.push(`store file ${x.f} does not hash to its name`);
    const want = signed.receipt.artifacts.promoted.map((p) => p.sha256).sort();
    if (JSON.stringify(held.map((x) => x.h).sort()) !== JSON.stringify(want)) errors.push('store contents differ from the promoted artifacts');
  }
  console.log(JSON.stringify({ ok: errors.length === 0, errors, pins }, null, 2));
  return errors.length === 0 ? 0 : 1;
}

function compare(args: string[]): number {
  const fa = flag(args, '--a');
  const fb = flag(args, '--b');
  if (!fa || !fb) throw new Error('compare needs --a and --b (two receipt files)');
  const allow = (flag(args, '--allow') ?? '').split(',').filter(Boolean);
  const [a, b] = [fa, fb].map((f) => JSON.parse(readFileSync(f, 'utf8')) as SignedReceipt) as [SignedReceipt, SignedReceipt];
  const errors = [...verifyReceipt(a).errors.map((e) => `a: ${e}`), ...verifyReceipt(b).errors.map((e) => `b: ${e}`)];
  if (!a.receipt?.passport || !b.receipt?.passport) errors.push('both receipts must carry a passport (schema v2)');
  if (errors.length) {
    console.log(JSON.stringify({ ok: false, errors }, null, 2));
    return 1;
  }
  const c = comparePassports(a.receipt.passport!.passport, b.receipt.passport!.passport);
  const unexpected = c.drifts.filter((d) => d.status !== 'identical' && d.class !== 'ignored' && !allow.includes(d.field)).map((d) => d.field);
  const drifts = c.drifts.filter((d) => d.status !== 'identical');
  console.log(JSON.stringify({ ok: unexpected.length === 0, verdict: c.verdict, allowed: allow, unexpected, drifts, not_proven: c.not_proven }, null, 2));
  return unexpected.length === 0 ? 0 : 1;
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === 'run') return run(rest);
    if (cmd === 'verify') return verify(rest);
    if (cmd === 'compare') return compare(rest);
    console.error(
      'usage: cli run --runtime runc|runsc --out <dir> [--policy-home <dir>] | cli verify --receipt <f> --keys <f> [--store <dir>] [--demo] | cli compare --a <f> --b <f> [--allow f1,f2]',
    );
    return 2;
  } catch (e) {
    console.error(e instanceof MissionRefused ? `REFUSED: ${e.message}` : `ERROR: ${(e as Error).message}`);
    return e instanceof MissionRefused ? 3 : 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
