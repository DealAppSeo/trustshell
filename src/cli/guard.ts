/**
 * `trustshell guard`, `trustshell run`, and the gate in front of every other command.
 * ----------------------------------------------------------------------------------
 * EGRESS: none. Reads `~/.trustshell/policy.json` (or TRUSTSHELL_HOME) and appends one record per decision to
 * `guard-receipts.jsonl` beside it.
 *
 * `trustshell run --tool <name> [--class read|other|post|spend] [--amount <n>] -- <command> [args...]` is the
 * enforced path: the decision is recorded BEFORE the command starts, a denied command never starts, and an
 * allowed one is started by this process, which then records its exit code. That is all it sees.
 *
 * The gate: while a policy file exists, every other trustshell command must be listed as `tool:<command>` (or
 * `tool`) before it runs. `help`, `version`, `guard` and `run` always run: the person can always read and
 * change the rules, and `run` makes its own decision.
 */
import type { ParsedArgs } from './index';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { learnExecutes } from '../learn/cli';
import {
  GUARD_DOES_NOT_COVER,
  GUARD_RECEIPTS_FILE,
  POLICY_FILE,
  SIGNATURE_DOES_NOT_VERIFY,
  TOOL_CLASSES,
  appendRecord,
  defaultPolicy,
  guardDecide,
  homeShadowWarning,
  nodeGuardFs,
  nonceHighWater,
  loadPolicy,
  parsePolicy,
  policySha256,
  policySigner,
  readLedger,
  renderPolicyDocument,
  trustshellHome,
  type AssuranceScope,
  type GuardRecord,
  type GuardRequest,
  type LocalPolicy,
  type PolicyDocument,
  type ToolClass,
} from '../lib/guardrails';
import { ownFingerprint, signValue, signingKey } from '../lib/install-key';
import {
  AUTONOMY_FILE,
  DEFAULT_AUTONOMY,
  LEVEL_MEANS,
  evidenceFromRecordFile,
  levelState,
  measured,
  readAutonomy,
  recordAutonomyEvent,
  type AutonomyRecord,
} from '../lib/autonomy';

type IO = { out: (s: string) => void; err: (s: string) => void };

/** Exit code for an action the policy denied. Never 0, and distinct from a VETO (1). */
export const EXIT_REFUSED = 5;

export const NEVER_GUARDED = new Set(['help', 'version', 'guard', 'run']);

/** The scope a CLI-gate record states. */
export const CLI_SCOPE: AssuranceScope = {
  mediated: ['whether this trustshell command was allowed to start, checked against the owner policy before it started'],
  not_mediated: [
    'what the command does once started; its network calls are the fixed ones in `trustshell --help`, not checked per host',
    'anything run without trustshell',
  ],
};

export const RUN_SCOPE: AssuranceScope = {
  mediated: ['the decision to start this command through `trustshell run`, checked against the owner policy before it started', 'the exit code of the process `trustshell run` started'],
  not_mediated: ['what the command did after it started: files, network, child processes', 'commands run without `trustshell run`'],
};

export const POLICY_SCOPE: AssuranceScope = {
  mediated: ['that the policy in force was changed through trustshell (guard or bundle import), and its hash before and after'],
  not_mediated: ['an edit made to policy.json by hand or by another program: the guard reads the file, it does not know who wrote it'],
};

/** Record that the policy in force changed. A rule change is never silent (Lane D, 2026-10-21). */
export function recordPolicyChange(dir: string, via: string, before: string | null, after: PolicyDocument): GuardRecord {
  const sha = policySha256(after.policy);
  return appendRecord(dir, {
    kind: 'policy-change',
    requested: { action: 'policy-change', tool: 'guard', class: 'other' },
    authorized: { decision: 'ALLOWED', reasons: [], policy_sha256: sha, policy_nonce: after.policy.nonce, policy_signed_by: policySigner(after) },
    executed: null,
    assurance_scope: POLICY_SCOPE,
    change: { via, before_sha256: before, after_sha256: sha },
  });
}

export const CHECK_SCOPE: AssuranceScope = {
  mediated: ['a decision only: `guard check` runs nothing'],
  not_mediated: ['whether the caller obeyed the decision', 'what the caller did afterwards'],
};

/** PURE. What a parsed command is, as the gate weighs it, and any reason it must be denied whatever the policy says. */
export function plannedAction(args: ParsedArgs): { req: GuardRequest; refuse?: string } {
  const req: GuardRequest = { tool: args.command, class: 'other' };
  if (args.command === 'init' && args.pai && !args.dryRun) {
    return { req, refuse: 'init --pai spawns scripts/init-pai.mjs, whose effects the guard cannot see, so it is denied while a policy is in force' };
  }
  const executes = args.command === 'learn' ? learnExecutes(args.learnArgv ?? []) : null;
  if (executes) {
    return { req, refuse: `${executes} runs a stored command through a shell, whose effects the guard cannot see, so it is denied while a policy is in force` };
  }
  return { req };
}

/** Run `inner` under the policy, if there is one. No policy file: `inner` runs exactly as before. */
export async function runGuarded(args: ParsedArgs, inner: () => Promise<number>, io: IO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (args.error || NEVER_GUARDED.has(args.command)) return inner();
  const shadow = homeShadowWarning(env);
  if (shadow) io.err(shadow);
  const { req, refuse } = plannedAction(args);
  const g = guardDecide(trustshellHome(env), req, CLI_SCOPE, { extraReasons: refuse ? [refuse] : [] });
  if (!g) return inner();
  if (g.decision.decision === 'DENIED') {
    io.err(`DENIED by the owner policy (${g.loaded.path}), record ${g.record.seq}:`);
    for (const r of g.decision.reasons) io.err(`  - ${r}`);
    io.err('Nothing was run. trustshell guard show prints the policy.');
    return EXIT_REFUSED;
  }
  return inner();
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * The card `trustshell run` prints: the five things a reader must keep apart. `doc` is the policy the decision
 * was made under: with it, a signature that does not verify reads as such instead of as "unsigned". `own` is
 * this install's key: a signature that verifies under any OTHER key read "owner-signed" until 2026-10-22, so a
 * policy anyone self-signed was called the owner's (GUARD_AUTHORITY_CONCLUSION, case 2).
 */
export function formatRunCard(decision: GuardRecord, outcome: GuardRecord | null, doc: PolicyDocument | null = null, own: string | null = null): string {
  const d = decision;
  const by = d.authorized.policy_signed_by;
  const signed = by ? (by === own ? 'owner-signed' : `signed by ${by.slice(0, 16)}…, NOT this install's key`) : doc?.signature ? SIGNATURE_DOES_NOT_VERIFY : 'unsigned';
  const ex = outcome?.executed;
  const executed =
    ex && ex !== 'not run' ? `started; exited ${ex.exit_code ?? `on signal ${ex.signal}`} after ${ex.duration_ms} ms` : 'not run';
  return [
    `trustshell run  —  ${d.authorized.decision}`,
    `  requested             ${d.requested.action}${d.requested.executable ? ` (starts ${d.requested.executable})` : ''}${d.requested.amount_raw ? ` amount ${d.requested.amount_raw}` : ''}; --class is the caller's label`,
    `  authorized            ${d.authorized.decision}${d.authorized.reasons.length ? `: ${d.authorized.reasons.join('; ')}` : ''} (policy ${String(d.authorized.policy_sha256).slice(0, 12)}…, nonce ${d.authorized.policy_nonce}, ${signed})`,
    `  executed              ${executed}`,
    '  independently observed  nothing: no outside party watched this command',
    `  unknown               ${RUN_SCOPE.not_mediated.join('; ')}`,
    `  records               ${d.seq}${outcome ? ` and ${outcome.seq}` : ''} in ${GUARD_RECEIPTS_FILE}`,
  ].join('\n');
}

export interface Spawner {
  (cmd: string, args: string[]): { status: number | null; signal: string | null };
}

const nodeSpawner: Spawner = (cmd, args) => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
  return { status: r.status, signal: r.signal ?? null };
};

export const RUN_USAGE = 'trustshell run --tool <name> [--class read|other|post|spend] [--amount <n>] [--json] -- <command> [args...]';

/** `trustshell run`. The command's own output goes to the terminal; the card goes to stderr (or --json to stdout). */
export function runRun(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env, spawn: Spawner = nodeSpawner): number {
  const dash = argv.indexOf('--');
  const opts = dash === -1 ? argv : argv.slice(0, dash);
  const command = dash === -1 ? [] : argv.slice(dash + 1);
  let tool: string | undefined;
  let cls: ToolClass = 'other';
  let amount: string | undefined;
  let json = false;
  for (let i = 0; i < opts.length; i += 1) {
    const a = opts[i] as string;
    const v = opts[i + 1];
    if (a === '--json') json = true;
    else if ((a === '--tool' || a === '--class' || a === '--amount') && v !== undefined && !v.startsWith('-')) {
      if (a === '--tool') tool = v;
      else if (a === '--amount') amount = v;
      else if ((TOOL_CLASSES as readonly string[]).includes(v)) cls = v as ToolClass;
      else return usage(io, `--class takes ${TOOL_CLASSES.join(', ')}`);
      i += 1;
    } else return usage(io, `unexpected ${a}`);
  }
  if (!tool || !/^[A-Za-z0-9_.:-]{1,128}$/.test(tool)) return usage(io, 'run needs --tool <name> (letters, digits, _ . : -)');
  if (!command.length || !command[0]) return usage(io, 'run needs the command after --');

  const dir = trustshellHome(env);
  const shadow = homeShadowWarning(env);
  if (shadow) io.err(shadow);
  // The tool label must BE the executable that would start: with only tool:inspect allowed,
  // `run --tool inspect -- node anything.js` used to run node (Lane D, 2026-10-21). The guard bounds which
  // executable starts, not what that executable then does (a script, its arguments).
  const executable = basename(String(command[0])).replace(/\.(exe|cmd|bat|com)$/i, '').toLowerCase();
  const mismatch = executable !== tool.toLowerCase() ? [`the command starts ${executable}, not ${tool}: run allows an executable only by its own name`] : [];
  const req: GuardRequest = { tool, class: cls, executable, command_sha256: sha256(JSON.stringify(command)), ...(amount !== undefined ? { amount_raw: amount } : {}) };
  const g = guardDecide(dir, req, RUN_SCOPE, { extraReasons: mismatch });
  if (!g) {
    io.err(`NOT_CHECKED no policy at ${join(dir, POLICY_FILE)}: nothing is authorized, so nothing was run. trustshell guard init writes one.`);
    return 2;
  }
  // Read before anything starts: an unreadable key must not throw after the command ran. No key, no owner.
  let own: string | null = null;
  try {
    own = ownFingerprint(dir);
  } catch {
    /* not a key: no signature is this install's */
  }
  if (g.decision.decision === 'DENIED') {
    (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome: null }, null, 2) : formatRunCard(g.record, null, g.loaded.state === 'ok' ? g.loaded.doc : null, own));
    return EXIT_REFUSED;
  }
  const t0 = Date.now();
  const r = spawn(command[0], command.slice(1));
  const outcome = appendRecord(dir, {
    kind: 'outcome',
    requested: g.record.requested,
    authorized: g.record.authorized,
    executed: { exit_code: r.status, signal: r.signal, duration_ms: Date.now() - t0 },
    assurance_scope: RUN_SCOPE,
  });
  (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome }, null, 2) : formatRunCard(g.record, outcome, g.loaded.state === 'ok' ? g.loaded.doc : null, own));
  return r.status ?? 3;
}

function usage(io: IO, m: string): number {
  io.err(`error: ${m}\n${RUN_USAGE}\n${GUARD_USAGE}`);
  return 2;
}

export const GUARD_USAGE = `trustshell guard init [--force] [--days N]
trustshell guard show [--json]
trustshell guard check --tool <name> [--class read|other|post|spend] [--amount <n>] [--json]
trustshell guard allow <action> · guard deny <action>      (spend | post | tool | tool:<name>)
trustshell guard limit per-tx|daily|total <n> · guard expire <days> · guard kill · guard sign
trustshell guard level [--json] · guard level shadow|enforce|off · guard level after L1|L2|L3 <n>
trustshell guard level record <record.json> [--json] · guard level revoke      (SHADOW by default)`;

/** The disclaimer every `guard level` reading carries. */
export const LEVEL_IS_NOT =
  'Local guardrails for cooperative agents, not a security boundary: anything running as you can edit the policy or autonomy.jsonl, or hand guard level record a record.json it made up (a record is unsigned).';

function autonomyLine(p: LocalPolicy): string {
  const a = p.autonomy;
  if (!a) return 'autonomy    off (trustshell guard level shadow turns it on)';
  return `autonomy    ${a.mode === 'shadow' ? 'SHADOW: the level is computed and recorded, and Guard allows exactly what the policy allows' : 'ENFORCE: the level can also refuse; it never allows what the policy does not list'}`;
}

/** `guard level`, `guard level record <file>`, `guard level revoke`: the ones that do not change the policy. */
function runLevel(words: string[], json: boolean, io: IO, dir: string, p: LocalPolicy): number {
  const [sub] = words;
  const config = p.autonomy;
  if (!config) {
    (sub ? io.err : io.out)(autonomyLine(p));
    return sub ? 2 : 0;
  }
  const fs = nodeGuardFs();
  const path = join(dir, AUTONOMY_FILE);
  if (sub === 'record' || sub === 'revoke') {
    let ev: Parameters<typeof recordAutonomyEvent>[3];
    if (sub === 'revoke') {
      if (words.length !== 1) return usage(io, 'guard level revoke takes nothing');
      ev = { kind: 'revocation', via: 'guard level revoke' };
    } else {
      if (words.length !== 2) return usage(io, 'guard level record takes one record.json, as trustshell check <runUrl> --claims-file <path> --out <dir> writes it');
      const file = words[1] as string;
      let text: string;
      try {
        const nfs = require('node:fs') as typeof import('node:fs');
        // A record of the 200 claims `check` reads at most is well under this.
        if (nfs.statSync(file).size > 4 * 1024 * 1024) throw new Error('it is over 4 MB');
        text = nfs.readFileSync(file, 'utf8');
      } catch (e) {
        io.err(`not recorded: cannot read ${file}: ${(e as Error).message}`);
        return 2;
      }
      const e = evidenceFromRecordFile(text, p.subject);
      if (!e.ok) {
        io.err(`not recorded: ${e.error}`);
        return 2;
      }
      ev = e.event;
    }
    const r = recordAutonomyEvent(dir, fs, config, ev);
    if (!r.ok) {
      io.err(`not recorded: ${r.error}`);
      return 2;
    }
    if (json) {
      io.out(JSON.stringify(r.added, null, 2));
      return 0;
    }
    const first = r.added[0] as AutonomyRecord;
    const lines: string[] = [];
    if (first.kind === 'evidence') {
      const t = first.tally;
      lines.push(`recorded ${first.run} for ${p.subject}: ${first.outcome} (${t.SUPPORTED} SUPPORTED, ${t.CONTRADICTED} CONTRADICTED, ${t.NOT_CHECKED} NOT_CHECKED), record ${first.seq}`);
      if (first.outcome === 'NOT_CHECKED') lines.push('  counts for nothing: a record counts only when every claim is SUPPORTED on a complete run');
      else if (first.outcome === 'SUPPORTED' && r.after.supported <= r.before.supported && r.added.length === 1) {
        lines.push(r.before.needed === null ? '  L3 is the highest level' : `  does not count: ${first.commit} was already counted`);
      }
    } else lines.push(`recorded the revocation, record ${first.seq}`);
    const ch = r.added.find((a) => a.kind === 'level-change');
    if (ch && ch.kind === 'level-change') lines.push(`level       L${ch.from} -> L${ch.to}: ${ch.reason}`);
    else if (r.after.needed !== null) lines.push(`level       L${r.after.level}; L${r.after.level + 1} after ${r.after.needed}, ${r.after.supported} so far`);
    if (config.mode === 'shadow') lines.push('            SHADOW: nothing Guard allows has changed');
    io.out(lines.join('\n'));
    return 0;
  }
  if (sub !== undefined) return usage(io, 'guard level takes shadow, enforce, off, after, record or revoke');
  const reading = readAutonomy(fs.exists(path) ? fs.read(path) : '');
  const s = levelState(reading, config);
  const m = measured(reading);
  if (json) {
    io.out(JSON.stringify({ subject: p.subject, ...config, ...s, measured: m, records: reading.records.length, breaks: reading.breaks, is_not: LEVEL_IS_NOT }, null, 2));
  } else {
    io.out(
      [
        autonomyLine(p),
        `subject     ${p.subject}`,
        `level       ${LEVEL_MEANS[s.level]}`,
        `why         ${s.reason}`,
        `next        ${s.needed === null ? (s.chain === 'BROKEN' ? 'none while autonomy.jsonl is BROKEN' : 'none: L3 is the highest') : `L${s.level + 1} after ${s.needed} Inspect records SUPPORTED in full, one per commit; ${s.supported} so far since the last change`}`,
        'falls       one level on a CONTRADICTED record or a refused out-of-lane attempt; to L0 on guard level revoke or guard kill',
        `measured    ${m.decisions} Guard decision${m.decisions === 1 ? '' : 's'}: the level would have refused ${m.earned_denied} of the ${m.fixed_allowed} the policy allowed`,
        `records     ${reading.records.length} in ${AUTONOMY_FILE}, chain ${reading.verdict}${reading.breaks.length ? ': ' + reading.breaks.slice(0, 3).join('; ') : ''}`,
        '',
        LEVEL_IS_NOT,
      ].join('\n'),
    );
  }
  return reading.verdict === 'BROKEN' ? 1 : 0;
}

function showLines(doc: PolicyDocument, path: string, ledgerText: string, defaulted: string[]): string[] {
  const p = doc.policy;
  const l = readLedger(ledgerText, undefined, undefined, policySha256(p));
  const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : `${l.spent.today} in the last 24 h, ${l.spent.total} under this policy`;
  const signer = policySigner(doc);
  return [
    `policy      ${path}  (sha256 ${policySha256(p).slice(0, 16)}…, nonce ${p.nonce}, ${signer ? `signed by ${signer.slice(0, 16)}…` : doc.signature ? SIGNATURE_DOES_NOT_VERIFY : 'unsigned'})`,
    `subject     ${p.subject}`,
    `actions     ${p.actions.length ? p.actions.join(', ') : 'NONE: everything is denied'}  (anything unlisted is denied)`,
    'always      denied whatever the actions list: init --pai, learn check run, learn probe run (each starts a process the guard cannot see)',
    `limits      per_tx ${p.per_tx_raw} · daily ${p.daily_raw} · total ${p.total_raw} (smallest units)${defaulted.length ? `; left out, so 0: ${defaulted.join(', ')}` : ''}; allowed so far: ${spent}`,
    `expires     ${new Date(p.expires_at * 1000).toISOString()}`,
    autonomyLine(p),
    `records     ${l.count} in ${GUARD_RECEIPTS_FILE}, chain ${l.verdict}${l.breaks.length ? ': ' + l.breaks.slice(0, 3).join('; ') : ''}`,
    ...(l.verdict === 'BROKEN' ? ['            No amount is allowed while it is BROKEN. Keep the file as evidence and move it aside to start a new ledger.'] : []),
    '',
    'What this does not cover',
    ...GUARD_DOES_NOT_COVER.map((s) => `* ${s}`),
  ];
}

export function runGuard(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env): number {
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = trustshellHome(env);
  const path = join(dir, POLICY_FILE);
  const [verb, ...rest] = argv;
  const json = rest.includes('--json');
  const words = rest.filter((w) => w !== '--json');
  const bad = (m: string) => usage(io, m);
  const write = (doc: PolicyDocument) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path, renderPolicyDocument(doc), { mode: 0o600 });
  };
  const ledgerText = () => (fs.existsSync(join(dir, GUARD_RECEIPTS_FILE)) ? fs.readFileSync(join(dir, GUARD_RECEIPTS_FILE), 'utf8') : '');

  switch (verb) {
    case 'init': {
      let days = 30;
      for (let i = 0; i < words.length; i += 1) {
        if (words[i] === '--force') continue;
        if (words[i] === '--days' && /^[1-9][0-9]{0,4}$/.test(words[i + 1] ?? '')) {
          days = Number(words[i + 1]);
          i += 1;
        } else return bad(`guard init: unexpected ${words[i]}`);
      }
      if (fs.existsSync(path) && !words.includes('--force')) {
        io.err(`guard init: ${path} exists; nothing was written (--force replaces it)`);
        return 2;
      }
      const before = loadPolicy(dir);
      // The nonce continues from the highest this host has had (file or ledger): init --force after kill used to
      // restart at 1, letting an old, looser owner-signed policy import as enforced (Lane D, 2026-10-21).
      const hw = nonceHighWater(dir);
      const doc: PolicyDocument = { policy: { ...defaultPolicy(undefined, days), nonce: hw === null ? '1' : (BigInt(hw) + BigInt(1)).toString() }, signature: null };
      write(doc);
      recordPolicyChange(dir, `guard init${words.includes('--force') ? ' --force' : ''}`, before.state === 'ok' ? before.sha256 : null, doc);
      io.out(`wrote ${path}: local commands only, every limit 0, expires in ${days} days. trustshell guard show prints it.`);
      return 0;
    }
    case 'show': {
      if (words.length) return bad(`guard show: unexpected ${words[0]}`);
      const shadow = homeShadowWarning(env);
      if (shadow) io.err(shadow);
      const loaded = loadPolicy(dir);
      if (loaded.state === 'absent') {
        io.out(json ? JSON.stringify({ state: 'absent', path }, null, 2) : `no policy at ${path}: trustshell run authorizes nothing, and nothing else is gated. trustshell guard init writes one.`);
        return 0;
      }
      if (loaded.state === 'invalid') {
        io.out(json ? JSON.stringify(loaded, null, 2) : [`${path} does not parse, so EVERYTHING is denied:`, ...loaded.problems.map((p) => `  - ${p}`)].join('\n'));
        return 1;
      }
      const l = readLedger(ledgerText(), undefined, undefined, loaded.sha256);
      if (json) {
        io.out(JSON.stringify({ state: 'ok', path, ...loaded.doc, signed_by: policySigner(loaded.doc), sha256: loaded.sha256, defaulted: loaded.defaulted, records: { count: l.count, chain: l.verdict, spent: l.spent && { today: String(l.spent.today), total: String(l.spent.total) }, breaks: l.breaks } }, null, 2));
      } else io.out(showLines(loaded.doc, path, ledgerText(), loaded.defaulted).join('\n'));
      return l.verdict === 'BROKEN' ? 1 : 0;
    }
    case 'check': {
      let tool: string | undefined;
      let cls: ToolClass = 'other';
      let amount: string | undefined;
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i] as string;
        const v = words[i + 1];
        if (!['--tool', '--class', '--amount'].includes(w)) return bad(`guard check: unexpected ${w}`);
        if (v === undefined || v.startsWith('-')) return bad(`${w} requires a value`);
        if (w === '--tool') tool = v;
        else if (w === '--amount') amount = v;
        else if ((TOOL_CLASSES as readonly string[]).includes(v)) cls = v as ToolClass;
        else return bad(`--class takes ${TOOL_CLASSES.join(', ')}`);
        i += 1;
      }
      if (!tool) return bad('guard check requires --tool <name>');
      // A check is a question, recorded as kind "check": its amount is never counted as spent.
      const g = guardDecide(dir, { tool, class: cls, ...(amount !== undefined ? { amount_raw: amount } : {}) }, CHECK_SCOPE, { kind: 'check' });
      if (!g) {
        io.out(json ? JSON.stringify({ decision: 'NOT_CHECKED', reason: `no policy at ${path}` }, null, 2) : `NOT_CHECKED no policy at ${path}; nothing was decided. This is not an allow.`);
        return 2;
      }
      if (json) io.out(JSON.stringify(g.record, null, 2));
      else io.out([`${g.decision.decision}  record ${g.record.seq} ${g.record.hash}`, ...g.decision.reasons.map((r) => `  - ${r}`)].join('\n'));
      return g.decision.decision === 'ALLOWED' ? 0 : EXIT_REFUSED;
    }
    case 'allow':
    case 'deny':
    case 'limit':
    case 'expire':
    case 'kill':
    case 'sign':
    case 'level': {
      const loaded = loadPolicy(dir);
      if (loaded.state !== 'ok') {
        io.err(loaded.state === 'absent' ? `no policy at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
        return 2;
      }
      if (verb === 'level' && !['shadow', 'enforce', 'off', 'after'].includes(words[0] ?? '')) return runLevel(words, json, io, dir, loaded.doc.policy);
      const p: LocalPolicy = JSON.parse(JSON.stringify(loaded.doc.policy));
      if (verb === 'sign') {
        if (words.length) return bad('guard sign takes nothing');
        const k = signingKey(dir);
        const signed: PolicyDocument = { policy: p, signature: { ...k.signer, signature: signValue(p, k.key) } };
        write(signed);
        recordPolicyChange(dir, 'guard sign', loaded.sha256, signed);
        io.out(`signed ${path} with this install's key ${k.signer.fingerprint}. A bundle can now carry it as owner-signed.`);
        return 0;
      }
      if (verb === 'allow' || verb === 'deny') {
        if (words.length !== 1) return bad(`guard ${verb} takes one action: spend, post, tool or tool:<name>`);
        const a = words[0] as string;
        p.actions = verb === 'allow' ? (p.actions.includes(a) ? p.actions : [...p.actions, a]) : p.actions.filter((x) => x !== a);
      } else if (verb === 'limit') {
        const key = { 'per-tx': 'per_tx_raw', daily: 'daily_raw', total: 'total_raw' }[words[0] ?? ''] as 'per_tx_raw' | 'daily_raw' | 'total_raw' | undefined;
        if (!key || words.length !== 2) return bad('guard limit takes per-tx, daily or total, then an amount');
        p[key] = words[1] as string;
      } else if (verb === 'expire') {
        if (words.length !== 1 || !/^[1-9][0-9]{0,4}$/.test(words[0] as string)) return bad('guard expire takes a number of days from now');
        p.expires_at = Math.floor(Date.now() / 1000) + Number(words[0]) * 86400;
      } else if (verb === 'level') {
        const [sub, lv, n] = words;
        if (sub === 'after') {
          if (!p.autonomy) return bad('levels are off: trustshell guard level shadow turns them on first');
          if (words.length !== 3 || !['L1', 'L2', 'L3'].includes(lv as string) || !/^[1-9][0-9]{0,4}$/.test(n as string)) return bad('guard level after takes L1, L2 or L3, then a number of records');
          p.autonomy = { ...p.autonomy, promote_after: { ...p.autonomy.promote_after, [lv as string]: Number(n) } };
        } else if (words.length !== 1) return bad(`guard level ${sub} takes nothing`);
        else if (sub === 'off') delete p.autonomy;
        else p.autonomy = { ...(p.autonomy ?? DEFAULT_AUTONOMY), mode: sub as 'shadow' | 'enforce' };
      } else {
        if (words.length) return bad('guard kill takes nothing');
        p.actions = [];
      }
      // Supersession, as the kernel revokes: every change is a new policy with a higher nonce, so an older
      // policy (an export from before the change) can never be imported over it.
      p.nonce = (BigInt(p.nonce) + BigInt(1)).toString();
      const checked = parsePolicy(p);
      if (!checked.ok) {
        io.err(`not written: ${checked.errors.join('; ')}`);
        return 2;
      }
      const next: PolicyDocument = { policy: checked.policy, signature: null };
      write(next);
      recordPolicyChange(dir, `guard ${verb}${words.length ? ' ' + words.join(' ') : ''}`, loaded.sha256, next);
      // Killing the policy is the owner revoking trust, so the level falls to L0 too.
      if (verb === 'kill' && checked.policy.autonomy) recordAutonomyEvent(dir, nodeGuardFs(), checked.policy.autonomy, { kind: 'revocation', via: 'guard kill' });
      if (loaded.doc.signature) io.err('the owner signature covered the old policy, so it was removed: trustshell guard sign signs this one');
      io.out(showLines({ policy: checked.policy, signature: null }, path, ledgerText(), checked.defaulted).slice(0, 5).join('\n'));
      if (verb === 'level') io.out(autonomyLine(checked.policy));
      return 0;
    }
    default:
      return bad('guard takes init, show, check, allow, deny, limit, expire, kill, sign or level');
  }
}
