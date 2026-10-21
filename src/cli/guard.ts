/**
 * `trustshell guard` and the gate in front of every other command.
 * ----------------------------------------------------------------
 * EGRESS: none. The gate reads `~/.trustshell/guardrails.json` (or TRUSTSHELL_HOME) and appends one
 * receipt per decision to `guard-receipts.jsonl` beside it. No file: the gate does nothing at all.
 *
 * TWO LAYERS. (1) Before a command runs, the hosts it is known to dial are weighed with its name
 * against the file; a refusal stops it before any work, with a receipt. (2) While an allowed command
 * runs, the process `fetch` refuses any host the file does not allow, with a receipt, so a host this
 * table does not know about is refused too. Every network call in src/ goes through `fetch`.
 */
import type { ParsedArgs } from './index';
import { DEFAULT_API_URL } from '../lib/api-url';
import { isUrlOperand } from '../lib/claim';
import {
  defaultGuardrails,
  GUARD_DOES_NOT_COVER,
  GUARD_RECEIPTS_FILE,
  guardAction,
  loadGuardrails,
  parseGuardrails,
  readLedger,
  renderGuardrails,
  trustshellHome,
  type GuardAction,
  type Guardrails,
} from '../lib/guardrails';
import { join } from 'node:path';

type IO = { out: (s: string) => void; err: (s: string) => void };

/** Exit code for an action the guardrails file refused. Never 0, and distinct from a VETO (1). */
export const EXIT_REFUSED = 5;

/** Commands the gate never stops: the person can always read and change the rules. */
export const NEVER_GUARDED = new Set(['help', 'version', 'guard']);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

/** The backend host a command will dial: TRUSTSHELL_API_URL or the default. An unparseable value is kept as is, so it can never match a rule. */
export function backendHost(env: NodeJS.ProcessEnv): string {
  return hostOf(env.TRUSTSHELL_API_URL?.trim() || DEFAULT_API_URL);
}

/**
 * PURE. What a parsed command will do, as the guard weighs it: its name, the hosts it dials, and any
 * reason it must be refused whatever the file says. Mirrors HELP's NETWORK EGRESS table.
 */
export function plannedAction(args: ParsedArgs, env: NodeJS.ProcessEnv): { action: GuardAction; refuse?: string } {
  const tool = args.command;
  const offline = env.OFFLINE === '1';
  const backend = [backendHost(env)];
  switch (tool) {
    case 'verify':
    case 'evaluate':
      return { action: { tool, hosts: offline ? [] : backend } };
    case 'repid':
    case 'proof':
    case 'badge':
    case 'receipt':
    case 'status':
    case 'bind-status':
      return { action: { tool, hosts: backend } };
    case 'check': {
      if (offline) return { action: { tool, hosts: [] } };
      if (isUrlOperand(String(args.operand ?? ''))) return { action: { tool, hosts: ['api.github.com'] } };
      return { action: { tool, hosts: env.TRUSTSHELL_LOCAL_ONLY === '1' ? [] : backend } };
    }
    case 'quarantine':
      // release --check hal asks the DEFAULT endpoint only (quarantine-hal.ts), whatever TRUSTSHELL_API_URL says.
      return { action: { tool, hosts: args.check === 'hal' ? [hostOf(DEFAULT_API_URL)] : [] } };
    case 'init':
      if (args.pai && !args.dryRun) {
        return { action: { tool, hosts: [] }, refuse: 'init --pai spawns scripts/init-pai.mjs, whose network the guard cannot see, so it is refused while a guardrails file is in force' };
      }
      return { action: { tool, hosts: [] } };
    default:
      return { action: { tool, hosts: [] } };
  }
}

export class GuardRefusedError extends Error {
  constructor(readonly host: string) {
    super(`REFUSED by guardrails: egress to ${host} is not in egress.allow`);
    this.name = 'GuardRefusedError';
  }
}

/** A `fetch` that refuses any host not in `allow`, calling `onRefuse` first. Everything else passes through untouched. */
export function guardedFetch(inner: typeof fetch, allow: readonly string[], onRefuse: (host: string) => void): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const host = hostOf(url);
    if (!allow.includes(host)) {
      onRefuse(host);
      throw new GuardRefusedError(host);
    }
    return inner(input, init);
  }) as typeof fetch;
}

/**
 * Run `inner` (the command) under the guardrails file, if there is one. No file: `inner` runs exactly
 * as before. A refusal returns {@link EXIT_REFUSED} and never calls `inner`.
 */
export async function runGuarded(args: ParsedArgs, inner: () => Promise<number>, io: IO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (args.error || NEVER_GUARDED.has(args.command)) return inner();
  const dir = trustshellHome(env);
  const { action, refuse } = plannedAction(args, env);
  const g = guardAction(dir, action, { extraReasons: refuse ? [refuse] : [] });
  if (!g) return inner();
  if (g.decision.decision === 'REFUSED') {
    io.err(`REFUSED by guardrails (${g.loaded.path}), receipt ${g.receipt.seq}:`);
    for (const r of g.decision.reasons) io.err(`  - ${r}`);
    io.err('Nothing was run. trustshell guard show prints the rules.');
    return EXIT_REFUSED;
  }
  const allow = g.loaded.state === 'ok' ? g.loaded.guardrails.egress.allow : [];
  const realFetch = globalThis.fetch;
  let refused = false;
  globalThis.fetch = guardedFetch(realFetch, allow, (host) => {
    refused = true;
    guardAction(dir, { tool: args.command, hosts: [host] });
    io.err(`REFUSED by guardrails: ${args.command} tried to reach ${host}, which is not in egress.allow (receipted)`);
  });
  try {
    const code = await inner();
    return refused ? EXIT_REFUSED : code;
  } finally {
    globalThis.fetch = realFetch;
  }
}

export const GUARD_USAGE = `trustshell guard init [--force]
trustshell guard show [--json]
trustshell guard check --tool <name> [--host <host>]... [--spend <amount>] [--json]
trustshell guard allow host|tool <value>
trustshell guard deny host|tool <value>
trustshell guard limit per-action|total <amount>`;

function showLines(g: Guardrails, path: string, ledgerText: string): string[] {
  const l = readLedger(ledgerText);
  const spent = l.spent === null ? 'UNKNOWN (ledger BROKEN)' : String(l.spent);
  return [
    `guardrails  ${path}`,
    `egress      ${g.egress.allow.length ? g.egress.allow.join(', ') : 'NONE: no command may dial out'}`,
    `tools       ${g.tools.allow.length ? g.tools.allow.join(', ') : 'NONE'} (help, version and guard always run)`,
    `spend       up to ${g.limits.spend_per_action} per action, ${g.limits.spend_total} in total; ${spent} allowed so far (${g.limits.unit})`,
    `receipts    ${l.count} in ${GUARD_RECEIPTS_FILE}, chain ${l.verdict}${l.breaks.length ? ': ' + l.breaks.slice(0, 3).join('; ') : ''}`,
    ...(l.verdict === 'BROKEN'
      ? ['            No spend is allowed while it is BROKEN. Keep this file as evidence and move it aside to start a new ledger.']
      : []),
    '',
    'What this does not cover',
    ...GUARD_DOES_NOT_COVER.map((s) => `* ${s}`),
  ];
}

export function runGuard(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env): number {
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = trustshellHome(env);
  const path = join(dir, 'guardrails.json');
  const [verb, ...rest] = argv;
  const json = rest.includes('--json');
  const words = rest.filter((w) => w !== '--json');
  const usage = (m: string) => {
    io.err(`error: ${m}\n${GUARD_USAGE}`);
    return 2;
  };
  const write = (g: Guardrails) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path, renderGuardrails(g), { mode: 0o600 });
  };

  switch (verb) {
    case 'init': {
      if (words.some((w) => w !== '--force')) return usage(`guard init: unexpected ${words.find((w) => w !== '--force')}`);
      if (fs.existsSync(path) && !words.includes('--force')) {
        io.err(`guard init: ${path} exists; nothing was written (--force replaces it)`);
        return 2;
      }
      write(defaultGuardrails());
      io.out(`wrote ${path}: no network host, local commands only, spend limit 0. trustshell guard show prints it.`);
      return 0;
    }
    case 'show': {
      if (words.length) return usage(`guard show: unexpected ${words[0]}`);
      const loaded = loadGuardrails(dir);
      const ledgerPath = join(dir, GUARD_RECEIPTS_FILE);
      const ledgerText = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
      if (loaded.state === 'absent') {
        io.out(json ? JSON.stringify({ state: 'absent', path }, null, 2) : `no guardrails file at ${path}: nothing is enforced. trustshell guard init writes a default-deny one.`);
        return 0;
      }
      if (loaded.state === 'invalid') {
        io.out(json ? JSON.stringify(loaded, null, 2) : [`${path} does not parse, so EVERY guarded command is refused:`, ...loaded.problems.map((p) => `  - ${p}`)].join('\n'));
        return 1;
      }
      const l = readLedger(ledgerText);
      if (json) {
        io.out(JSON.stringify({ state: 'ok', path, guardrails: loaded.guardrails, sha256: loaded.sha256, receipts: { count: l.count, chain: l.verdict, spent: l.spent === null ? null : String(l.spent), breaks: l.breaks } }, null, 2));
      } else io.out(showLines(loaded.guardrails, path, ledgerText).join('\n'));
      return l.verdict === 'BROKEN' ? 1 : 0;
    }
    case 'check': {
      let tool: string | undefined;
      let spend: string | undefined;
      const hosts: string[] = [];
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i] as string;
        const v = words[i + 1];
        if (w !== '--tool' && w !== '--host' && w !== '--spend') return usage(`guard check: unexpected ${w}`);
        if (v === undefined || v.startsWith('-')) return usage(`${w} requires a value`);
        if (w === '--tool') tool = v;
        else if (w === '--host') hosts.push(v.toLowerCase());
        else spend = v;
        i += 1;
      }
      if (!tool) return usage('guard check requires --tool <name>');
      const action: GuardAction = { tool, hosts, ...(spend !== undefined ? { spend } : {}) };
      const g = guardAction(dir, action, { origin: 'Cli' });
      if (!g) {
        io.out(json ? JSON.stringify({ decision: 'NOT_CHECKED', reason: `no guardrails file at ${path}` }, null, 2) : `NOT_CHECKED no guardrails file at ${path}; nothing was decided. This is not an allow.`);
        return 2;
      }
      if (json) io.out(JSON.stringify({ ...g.decision, receipt: g.receipt }, null, 2));
      else io.out([`${g.decision.decision}  receipt ${g.receipt.seq} ${g.receipt.hash}`, ...g.decision.reasons.map((r) => `  - ${r}`)].join('\n'));
      return g.decision.decision === 'ALLOWED' ? 0 : EXIT_REFUSED;
    }
    case 'allow':
    case 'deny':
    case 'limit': {
      const loaded = loadGuardrails(dir);
      if (loaded.state !== 'ok') {
        io.err(loaded.state === 'absent' ? `no guardrails file at ${path}; trustshell guard init writes one` : `${path} does not parse; fix it by hand or guard init --force`);
        return 2;
      }
      const [what, value, extra] = words;
      if (!what || value === undefined || extra !== undefined) return usage(`guard ${verb} takes two words`);
      const g: Guardrails = JSON.parse(JSON.stringify(loaded.guardrails));
      if (verb === 'limit') {
        if (what !== 'per-action' && what !== 'total') return usage('guard limit takes per-action or total');
        g.limits[what === 'per-action' ? 'spend_per_action' : 'spend_total'] = value;
      } else {
        if (what !== 'host' && what !== 'tool') return usage(`guard ${verb} takes host or tool`);
        const list = what === 'host' ? g.egress.allow : g.tools.allow;
        const v = what === 'host' ? value.toLowerCase() : value;
        const next = verb === 'allow' ? (list.includes(v) ? list : [...list, v]) : list.filter((x) => x !== v);
        if (what === 'host') g.egress.allow = next;
        else g.tools.allow = next;
      }
      const checked = parseGuardrails(renderGuardrails(g));
      if (!checked.guardrails) {
        io.err(`not written: ${checked.problems.join('; ')}`);
        return 2;
      }
      write(checked.guardrails);
      io.out(showLines(checked.guardrails, path, fs.existsSync(join(dir, GUARD_RECEIPTS_FILE)) ? fs.readFileSync(join(dir, GUARD_RECEIPTS_FILE), 'utf8') : '').slice(0, 4).join('\n'));
      return 0;
    }
    default:
      return usage('guard takes init, show, check, allow, deny or limit');
  }
}
