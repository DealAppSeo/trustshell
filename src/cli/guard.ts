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
  TOOL_CLASSES,
  appendRecord,
  defaultPolicy,
  guardDecide,
  homeShadowWarning,
  nonceHighWater,
  loadPolicy,
  parsePolicy,
  policySha256,
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
import { signValue, signingKey } from '../lib/install-key';

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
    authorized: { decision: 'ALLOWED', reasons: [], policy_sha256: sha, policy_nonce: after.policy.nonce, policy_signed_by: after.signature?.fingerprint ?? null },
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

/** The card `trustshell run` prints: the five things a reader must keep apart. */
export function formatRunCard(decision: GuardRecord, outcome: GuardRecord | null): string {
  const d = decision;
  const ex = outcome?.executed;
  const executed =
    ex && ex !== 'not run' ? `started; exited ${ex.exit_code ?? `on signal ${ex.signal}`} after ${ex.duration_ms} ms` : 'not run';
  return [
    `trustshell run  —  ${d.authorized.decision}`,
    `  requested             ${d.requested.action}${d.requested.executable ? ` (starts ${d.requested.executable})` : ''}${d.requested.amount_raw ? ` amount ${d.requested.amount_raw}` : ''}; --class is the caller's label`,
    `  authorized            ${d.authorized.decision}${d.authorized.reasons.length ? `: ${d.authorized.reasons.join('; ')}` : ''} (policy ${String(d.authorized.policy_sha256).slice(0, 12)}…, nonce ${d.authorized.policy_nonce}${d.authorized.policy_signed_by ? ', owner-signed' : ', unsigned'})`,
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
  if (g.decision.decision === 'DENIED') {
    (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome: null }, null, 2) : formatRunCard(g.record, null));
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
  (json ? io.out : io.err)(json ? JSON.stringify({ decision: g.record, outcome }, null, 2) : formatRunCard(g.record, outcome));
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
trustshell guard limit per-tx|daily|total <n> · guard expire <days> · guard kill · guard sign`;

function showLines(doc: PolicyDocument, path: string, ledgerText: string, defaulted: string[]): string[] {
  const p = doc.policy;
  const l = readLedger(ledgerText, undefined, undefined, policySha256(p));
  const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : `${l.spent.today} in the last 24 h, ${l.spent.total} under this policy`;
  return [
    `policy      ${path}  (sha256 ${policySha256(p).slice(0, 16)}…, nonce ${p.nonce}, ${doc.signature ? `signed by ${doc.signature.fingerprint.slice(0, 16)}…` : 'unsigned'})`,
    `subject     ${p.subject}`,
    `actions     ${p.actions.length ? p.actions.join(', ') : 'NONE: everything is denied'}  (anything unlisted is denied)`,
    'always      denied whatever the actions list: init --pai, learn check run, learn probe run (each starts a process the guard cannot see)',
    `limits      per_tx ${p.per_tx_raw} · daily ${p.daily_raw} · total ${p.total_raw} (smallest units)${defaulted.length ? `; left out, so 0: ${defaulted.join(', ')}` : ''}; allowed so far: ${spent}`,
    `expires     ${new Date(p.expires_at * 1000).toISOString()}`,
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
        io.out(JSON.stringify({ state: 'ok', path, ...loaded.doc, sha256: loaded.sha256, defaulted: loaded.defaulted, records: { count: l.count, chain: l.verdict, spent: l.spent && { today: String(l.spent.today), total: String(l.spent.total) }, breaks: l.breaks } }, null, 2));
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
    case 'sign': {
      const loaded = loadPolicy(dir);
      if (loaded.state !== 'ok') {
        io.err(loaded.state === 'absent' ? `no policy at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
        return 2;
      }
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
      if (loaded.doc.signature) io.err('the owner signature covered the old policy, so it was removed: trustshell guard sign signs this one');
      io.out(showLines({ policy: checked.policy, signature: null }, path, ledgerText(), checked.defaulted).slice(0, 5).join('\n'));
      return 0;
    }
    default:
      return bad('guard takes init, show, check, allow, deny, limit, expire, kill or sign');
  }
}
