/**
 * `~/.trustshell/guardrails.json` — the one file a person tunes to bound what trustshell may do.
 * ----------------------------------------------------------------------------------------------
 * THREE RULES, ALL DEFAULT-DENY. `trustshell guard init` writes a file that allows no network host,
 * only the commands that touch local files, and a spend limit of zero:
 *   egress.allow   hostnames a command may dial. Exact match, lowercase. Empty = nothing dials out.
 *   tools.allow    command (tool) names that may run at all.
 *   limits         spend_per_action and spend_total, smallest units of `unit`. "0" = no spend.
 *
 * NO FILE = NOTHING ENFORCED, and `guard show` says so. Default-deny is what the file starts as once
 * a person opts in; turning it on for everyone who never asked would break every existing install.
 *
 * A FILE THAT DOES NOT PARSE REFUSES EVERYTHING. A person who wrote a guardrails file and broke it
 * meant to be guarded; failing open on a typo would undo that silently. Unknown keys are a problem
 * too: a misspelt `egres` must not read as "no egress rule".
 *
 * EVERY DECISION IS RECEIPTED. `guard-receipts.jsonl` next to the file, one JSON line per decision,
 * each hashed over its RFC 8785 form and chained to the one before (like inspect's session log).
 * The receipt names the tool, the hosts and the spend, never the text a command was given.
 *
 * WHAT THIS IS NOT. It bounds what trustshell itself does. It is not a sandbox: anything that runs as
 * you can edit this file, delete the receipts, or dial a host without trustshell. The chain is
 * unkeyed, so it detects an edit that left later hashes alone, not a ledger rewritten wholesale.
 */
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, jcsSha256 } from './jcs';

export const GUARDRAILS_VERSION = 1;
export const GUARDRAILS_FILE = 'guardrails.json';
export const GUARD_RECEIPTS_FILE = 'guard-receipts.jsonl';
export const GUARD_RECEIPT_SCHEMA = 'trustshell.guard-receipt/1';

export interface Guardrails {
  trustshell_guardrails: number;
  egress: { allow: string[] };
  tools: { allow: string[] };
  limits: { unit: string; spend_per_action: string; spend_total: string };
}

/** The commands that only read or write local files. The default file allows these and nothing else. */
export const LOCAL_TOOLS = [
  'bundle',
  'ground',
  'init',
  'inspect',
  'learn',
  'profile',
  'quarantine',
  'recall',
  'redact',
  'remember',
  'report',
  'traps',
] as const;

export const DEFAULT_UNIT = 'USDC smallest unit (6 decimals)';

export function defaultGuardrails(): Guardrails {
  return {
    trustshell_guardrails: GUARDRAILS_VERSION,
    egress: { allow: [] },
    tools: { allow: [...LOCAL_TOOLS] },
    limits: { unit: DEFAULT_UNIT, spend_per_action: '0', spend_total: '0' },
  };
}

/** The folder that holds guardrails, their receipts and the bundle signing key. */
export function trustshellHome(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const o = env.TRUSTSHELL_HOME?.trim();
  return o ? o : join(home, '.trustshell');
}

/** A hostname as the rules hold it: lowercase letters, digits, dots and dashes; no scheme, port or path. */
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const TOOL = /^[a-z][a-z0-9-]{0,39}$/;
const AMOUNT = /^(?:0|[1-9][0-9]{0,77})$/;

export function renderGuardrails(g: Guardrails): string {
  return JSON.stringify(g, null, 2) + '\n';
}

/**
 * PURE. Parse the file. Any problem resolves to `guardrails: null`, which refuses every action:
 * never a partial rule set, because a half-read file is not what the person wrote.
 */
export function parseGuardrails(text: string): { guardrails: Guardrails | null; problems: string[] } {
  const problems: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    return { guardrails: null, problems: [`not JSON: ${(e as Error).message}`] };
  }
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const exactKeys = (v: Record<string, unknown>, keys: string[], at: string) => {
    for (const k of Object.keys(v)) if (!keys.includes(k)) problems.push(`${at}${k}: unknown key`);
    for (const k of keys) if (!(k in v)) problems.push(`${at}${k}: missing`);
  };
  if (!obj(raw)) return { guardrails: null, problems: ['the file must hold one JSON object'] };
  exactKeys(raw, ['trustshell_guardrails', 'egress', 'tools', 'limits'], '');
  if (raw.trustshell_guardrails !== GUARDRAILS_VERSION) {
    problems.push(`trustshell_guardrails: expected ${GUARDRAILS_VERSION}, got ${JSON.stringify(raw.trustshell_guardrails)}`);
  }
  const list = (section: unknown, name: string, shape: RegExp, what: string): string[] => {
    if (!obj(section)) {
      problems.push(`${name}: must be an object with "allow"`);
      return [];
    }
    exactKeys(section, ['allow'], `${name}.`);
    const allow = section.allow;
    if (!Array.isArray(allow)) {
      problems.push(`${name}.allow: must be a list`);
      return [];
    }
    for (const a of allow) if (typeof a !== 'string' || !shape.test(a)) problems.push(`${name}.allow: ${JSON.stringify(a)} is not ${what}`);
    return allow.filter((a): a is string => typeof a === 'string');
  };
  const egress = list(raw.egress, 'egress', HOSTNAME, 'a lowercase hostname (no scheme, port, path or wildcard)');
  const tools = list(raw.tools, 'tools', TOOL, 'a command name');
  const limits = raw.limits;
  if (!obj(limits)) problems.push('limits: must be an object');
  else {
    exactKeys(limits, ['unit', 'spend_per_action', 'spend_total'], 'limits.');
    if (typeof limits.unit !== 'string' || !limits.unit.trim()) problems.push('limits.unit: must name the unit');
    for (const k of ['spend_per_action', 'spend_total'] as const) {
      if (typeof limits[k] !== 'string' || !AMOUNT.test(limits[k] as string)) {
        problems.push(`limits.${k}: must be a whole number of smallest units, as a string ("0" = no spend)`);
      }
    }
  }
  if (problems.length) return { guardrails: null, problems };
  const l = limits as Record<string, string>;
  return {
    guardrails: {
      trustshell_guardrails: GUARDRAILS_VERSION,
      egress: { allow: egress },
      tools: { allow: tools },
      limits: { unit: l.unit as string, spend_per_action: l.spend_per_action as string, spend_total: l.spend_total as string },
    },
    problems,
  };
}

/** What one action asks for. `spend` is a whole number of smallest units, as a string. */
export interface GuardAction {
  tool: string;
  hosts: string[];
  spend?: string;
}

export type GuardVerdict = 'ALLOWED' | 'REFUSED';

export interface GuardDecision {
  decision: GuardVerdict;
  /** Every rule the action broke, not just the first. Empty when allowed. */
  reasons: string[];
}

/**
 * PURE. Weigh one action against the rules. `g === null` is a file that did not parse: refused.
 * `spentSoFar` is the sum of spends this ledger already allowed; `null` means the ledger could not be
 * trusted (a broken chain), and then any spend is refused.
 */
export function decide(g: Guardrails | null, action: GuardAction, spentSoFar: bigint | null, problems: string[] = []): GuardDecision {
  if (!g) return { decision: 'REFUSED', reasons: [`the guardrails file does not parse, so everything is refused: ${problems.join('; ') || 'invalid'}`] };
  const reasons: string[] = [];
  if (!g.tools.allow.includes(action.tool)) reasons.push(`tool "${action.tool}" is not in tools.allow`);
  for (const h of action.hosts) {
    if (!g.egress.allow.includes(h.toLowerCase())) reasons.push(`egress to ${h} is not in egress.allow`);
  }
  if (action.spend !== undefined) {
    if (!/^[1-9][0-9]{0,77}$/.test(action.spend)) reasons.push('spend must be a whole number of smallest units, more than 0');
    else {
      const amount = BigInt(action.spend);
      const per = BigInt(g.limits.spend_per_action);
      const total = BigInt(g.limits.spend_total);
      if (amount > per) reasons.push(`spend ${action.spend} is over spend_per_action ${g.limits.spend_per_action} (${g.limits.unit})`);
      if (spentSoFar === null) reasons.push('the receipt ledger is BROKEN, so the running total is unknown and no spend is allowed');
      else if (spentSoFar + amount > total) {
        reasons.push(`spend ${action.spend} would take the total to ${spentSoFar + amount}, over spend_total ${g.limits.spend_total} (${g.limits.unit})`);
      }
    }
  }
  return { decision: reasons.length ? 'REFUSED' : 'ALLOWED', reasons };
}

export interface GuardReceipt {
  schema: typeof GUARD_RECEIPT_SCHEMA;
  seq: number;
  ts: string;
  origin: string;
  action: GuardAction;
  decision: GuardVerdict;
  reasons: string[];
  /** sha256 of the rules in force (RFC 8785 form); null when the file did not parse. */
  guardrails_sha256: string | null;
  prev: string | null;
  hash: string;
}

/** The hash a receipt must carry: sha256 of the RFC 8785 form of every field but `hash`. */
export function receiptHash(r: Omit<GuardReceipt, 'hash'>): string {
  return jcsSha256(r);
}

export interface LedgerReading {
  verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
  count: number;
  /** Sum of the spends this ledger ALLOWED. null when BROKEN: a total read off an altered ledger is not a total. */
  spent: bigint | null;
  last: { seq: number; hash: string } | null;
  breaks: string[];
}

const allowedSpend = (r: GuardReceipt): bigint =>
  r.decision === 'ALLOWED' && typeof r.action?.spend === 'string' && /^[1-9][0-9]{0,77}$/.test(r.action.spend) ? BigInt(r.action.spend) : BigInt(0);

/**
 * PURE. Read the receipt ledger: check every hash and every link, and total the allowed spends. `from` is
 * the reading of the lines BEFORE `text` (an already-verified prefix): the chain continues from its last hash.
 */
export function readLedger(text: string, from?: LedgerReading): LedgerReading {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const breaks: string[] = [];
  const offset = from?.count ?? 0;
  let prev: string | null = from?.last?.hash ?? null;
  let spent = from?.spent ?? BigInt(0);
  let last: LedgerReading['last'] = from?.last ?? null;
  lines.forEach((line, i) => {
    const n = offset + i + 1;
    let r: GuardReceipt;
    try {
      r = JSON.parse(line) as GuardReceipt;
    } catch {
      breaks.push(`line ${n}: not JSON`);
      return;
    }
    const { hash, ...body } = r;
    let want: string | null = null;
    try {
      want = receiptHash(body);
    } catch {
      /* not canonicalizable: counted as a break below */
    }
    if (r.schema !== GUARD_RECEIPT_SCHEMA) breaks.push(`line ${n}: schema is not ${GUARD_RECEIPT_SCHEMA}`);
    if (want === null || hash !== want) breaks.push(`line ${n}: hash does not match the receipt`);
    if (r.prev !== prev) breaks.push(`line ${n}: prev does not match the line before`);
    if (r.seq !== n) breaks.push(`line ${n}: seq is ${r.seq}`);
    spent += allowedSpend(r);
    prev = typeof hash === 'string' ? hash : null;
    last = { seq: n, hash: String(hash) };
  });
  const count = offset + lines.length;
  if (count === 0) return { verdict: 'EMPTY', count: 0, spent: BigInt(0), last: null, breaks };
  return breaks.length || from?.verdict === 'BROKEN'
    ? { verdict: 'BROKEN', count, spent: null, last, breaks }
    : { verdict: 'INTACT', count, spent, last, breaks };
}

/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes (one sha256, fast) and fully verifies only the
 * lines after them; any change to the old bytes misses the cache and the whole ledger is verified again.
 * Measured 2026-10-21 (lane B report): full verification cost 579 ms per decision at 10,000 receipts.
 */
export const GUARD_CHECKPOINT_FILE = 'guard-receipts.checkpoint.json';

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** The ledger reading, using the checkpoint when its bytes still match. Falls back to a full read on any doubt. */
export function readLedgerCheckpointed(text: string, checkpointText: string | null): LedgerReading {
  try {
    const c = JSON.parse(checkpointText ?? 'null') as { bytes?: unknown; sha256?: unknown } | null;
    const buf = Buffer.from(text, 'utf8');
    if (c && Number.isSafeInteger(c.bytes) && (c.bytes as number) <= buf.length && sha256(buf.subarray(0, c.bytes as number)) === c.sha256) {
      // These bytes were verified line by line when the checkpoint was written: tally them, do not re-hash them.
      let prefix: LedgerReading = { verdict: 'EMPTY', count: 0, spent: BigInt(0), last: null, breaks: [] };
      for (const line of buf.subarray(0, c.bytes as number).toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const r = JSON.parse(line) as GuardReceipt;
        prefix = { verdict: 'INTACT', count: prefix.count + 1, spent: (prefix.spent as bigint) + allowedSpend(r), last: { seq: r.seq, hash: r.hash }, breaks: [] };
      }
      return readLedger(buf.subarray(c.bytes as number).toString('utf8'), prefix);
    }
  } catch {
    /* no checkpoint, or one that does not parse: verify everything */
  }
  return readLedger(text);
}

/** PURE. The next receipt line after `ledger`. */
export function nextReceipt(
  ledger: LedgerReading,
  fields: { action: GuardAction; decision: GuardDecision; guardrails_sha256: string | null; origin?: string; ts?: string },
): GuardReceipt {
  const action: GuardAction = { tool: fields.action.tool, hosts: [...fields.action.hosts] };
  if (fields.action.spend !== undefined) action.spend = fields.action.spend;
  const body: Omit<GuardReceipt, 'hash'> = {
    schema: GUARD_RECEIPT_SCHEMA,
    seq: (ledger.last?.seq ?? 0) + 1,
    ts: fields.ts ?? new Date().toISOString(),
    origin: fields.origin ?? 'Cli',
    action,
    decision: fields.decision.decision,
    reasons: [...fields.decision.reasons],
    guardrails_sha256: fields.guardrails_sha256,
    prev: ledger.last?.hash ?? null,
  };
  return { ...body, hash: receiptHash(body) };
}

/** sha256 of the rules (RFC 8785 form), the value a receipt binds to. */
export function guardrailsSha256(g: Guardrails): string {
  return jcsSha256(g);
}

/** The filesystem calls the guard needs. Injectable so the logic is testable without a disk. */
export interface GuardFs {
  exists(p: string): boolean;
  read(p: string): string;
  append(p: string, data: string): void;
  write(p: string, data: string): void;
  mkdirp(p: string): void;
}

export const nodeGuardFs = (): GuardFs => {
  const fs = require('node:fs') as typeof import('node:fs');
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    // Owner-only, like the memory file: the ledger says what you did and what you spent.
    append: (p, d) => fs.appendFileSync(p, d, { mode: 0o600 }),
    write: (p, d) => fs.writeFileSync(p, d, { mode: 0o600 }),
    mkdirp: (p) => {
      fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    },
  };
};

export type LoadedGuardrails =
  | { state: 'absent'; path: string }
  | { state: 'invalid'; path: string; problems: string[] }
  | { state: 'ok'; path: string; guardrails: Guardrails; sha256: string };

export function loadGuardrails(dir: string, fs: GuardFs = nodeGuardFs()): LoadedGuardrails {
  const path = join(dir, GUARDRAILS_FILE);
  if (!fs.exists(path)) return { state: 'absent', path };
  const { guardrails, problems } = parseGuardrails(fs.read(path));
  return guardrails ? { state: 'ok', path, guardrails, sha256: guardrailsSha256(guardrails) } : { state: 'invalid', path, problems };
}

/**
 * Decide AND receipt one action against the file in `dir`, in that order, and return both. No file:
 * `null` (nothing is enforced, nothing is written). The receipt is appended before the caller acts on
 * an ALLOWED decision, so an action that then crashes is still on the ledger.
 * Only the lines after the checkpoint are re-verified (see GUARD_CHECKPOINT_FILE); a BROKEN ledger is never
 * checkpointed, so it stays BROKEN.
 * ponytail: still reads and hashes the whole file per decision (far cheaper than re-verifying every line),
 * and takes no lock: two concurrent writers fork the chain, which then reads BROKEN and refuses spends (fail
 * closed). Rotate the ledger, or read only its tail by offset, if ledgers of 100k+ lines appear.
 */
export function guardAction(
  dir: string,
  action: GuardAction,
  opts: { fs?: GuardFs; origin?: string; ts?: string; extraReasons?: string[] } = {},
): { decision: GuardDecision; receipt: GuardReceipt; loaded: Exclude<LoadedGuardrails, { state: 'absent' }> } | null {
  const fs = opts.fs ?? nodeGuardFs();
  const loaded = loadGuardrails(dir, fs);
  if (loaded.state === 'absent') return null;
  const ledgerPath = join(dir, GUARD_RECEIPTS_FILE);
  const checkpointPath = join(dir, GUARD_CHECKPOINT_FILE);
  const text = fs.exists(ledgerPath) ? fs.read(ledgerPath) : '';
  const ledger = readLedgerCheckpointed(text, fs.exists(checkpointPath) ? fs.read(checkpointPath) : null);
  const base =
    loaded.state === 'ok' ? decide(loaded.guardrails, action, ledger.spent) : decide(null, action, null, loaded.problems);
  // A reason the caller knows and the file cannot express (init --pai's child process) refuses too.
  const reasons = [...base.reasons, ...(opts.extraReasons ?? [])];
  const decision: GuardDecision = { decision: reasons.length ? 'REFUSED' : 'ALLOWED', reasons };
  const receipt = nextReceipt(ledger, {
    action,
    decision,
    guardrails_sha256: loaded.state === 'ok' ? loaded.sha256 : null,
    origin: opts.origin,
    ts: opts.ts,
  });
  fs.mkdirp(dir);
  const line = canonicalize(receipt) + '\n';
  fs.append(ledgerPath, line);
  if (ledger.verdict !== 'BROKEN') {
    const bytes = Buffer.from(text + line, 'utf8');
    fs.write(checkpointPath, JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes) }) + '\n');
  }
  return { decision, receipt, loaded };
}

/** The sentences `guard show` will not let a reader forget. */
export const GUARD_DOES_NOT_COVER = [
  'It bounds what trustshell does. It is not a sandbox: anything running as you can edit this file, delete the receipts, or reach the network without trustshell.',
  'Egress is enforced on trustshell\'s own fetch calls. A child process (init --pai, a learn check command you registered) is not inside it: init --pai is refused while this file is in force; learn runs under tools.allow only.',
  'The receipt chain is unkeyed: it detects an edit or a deleted line that left the later hashes alone, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.',
  'Spend limits count the spends THIS ledger allowed (guard check --spend). A spend made without asking the guard is not counted.',
] as const;
