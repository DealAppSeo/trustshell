/**
 * GUARD: the owner's local policy, enforced in code before an action starts, with a record of every decision.
 * ---------------------------------------------------------------------------------------------------------
 * ONE POLICY LANGUAGE. `~/.trustshell/policy.json` (or TRUSTSHELL_HOME) holds `{ policy, signature }`, the
 * body shape of the engine kernel's signed owner policy (repid-engine src/kernel/policy.ts), and `policy` is a
 * SUBSET of the kernel's OwnerPolicy with the same names and the same meanings:
 *   subject                 the agent the policy is for
 *   actions                 spend | post | tool | tool:<name>. Anything unlisted is DENIED. `tool` allows every
 *                           read/other tool; `tool:<name>` allows one.
 *   per_tx_raw, daily_raw,  smallest units, canonical decimal strings. A limit the owner leaves out is "0",
 *   total_raw               never unlimited. The one that binds is the smallest.
 *   expires_at              unix seconds. At or after it, everything is denied.
 *   nonce                   supersession: revoking is writing a policy with a higher nonce (the kernel has no
 *                           revocation list either). `guard kill` writes one that allows nothing.
 * Not in the subset, because the local guard neither pays nor binds code: `owner` (a wallet), `payees`,
 * `authorized_impl_hashes`. The local hash is sha256 of the RFC 8785 form, not the kernel's EIP-712 digest.
 *
 * NO FILE = NOTHING AUTHORIZED for `trustshell run` (it refuses), and nothing changes for the other commands.
 * A FILE THAT DOES NOT PARSE DENIES EVERYTHING. A person who wrote a policy and broke it meant to be guarded.
 *
 * EVERY DECISION IS A RECORD (`trustshell.guard-record/1`), appended to `guard-receipts.jsonl` before the action
 * runs, hash-chained (RFC 8785 + sha256), with what was REQUESTED, what was AUTHORIZED (and under which policy
 * hash and nonce), what was EXECUTED, and the ASSURANCE SCOPE: what the guard mediated and what it did not. A
 * missing record never proves that no action happened: the guard sees only what goes through it.
 *
 * WHAT THIS IS NOT. Not a sandbox: anything running as you can edit these files or act without trustshell.
 * The chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch.
 */
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, jcsSha256 } from './jcs';
import { verifyValue, type Signer } from './install-key';

export const POLICY_FILE = 'policy.json';
/** An imported policy that could not be enforced (unsigned, or signed by a key nobody named) lands here. */
export const SUGGESTED_POLICY_FILE = 'policy.suggested.json';
export const GUARD_RECEIPTS_FILE = 'guard-receipts.jsonl';
export const GUARD_RECORD_SCHEMA = 'trustshell.guard-record/1';

export type ToolClass = 'read' | 'spend' | 'post' | 'other';
export const TOOL_CLASSES: readonly ToolClass[] = ['read', 'spend', 'post', 'other'];

/** The local owner policy: a subset of the kernel's OwnerPolicy. */
export interface LocalPolicy {
  subject: string;
  actions: string[];
  per_tx_raw: string;
  daily_raw: string;
  total_raw: string;
  expires_at: number;
  nonce: string;
}

export interface PolicySignature extends Signer {
  /** Ed25519 over the RFC 8785 form of `policy`, base64. */
  signature: string;
}

/** `{ policy, signature }`, as the kernel takes it. `signature` is null for a policy nobody signed. */
export interface PolicyDocument {
  policy: LocalPolicy;
  signature: PolicySignature | null;
}

/** The commands that only read or write local files: what `guard init` allows. `learn` is listed, but its `check run` and `probe run` run a stored shell command and the CLI denies them while a policy is in force. */
export const LOCAL_TOOLS = ['bundle', 'ground', 'init', 'inspect', 'learn', 'profile', 'quarantine', 'recall', 'redact', 'remember', 'report', 'traps'] as const;

const ACTION = /^(spend|post|tool|tool:[A-Za-z0-9_.:-]{1,128})$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]{0,77})$/;
const POLICY_KEYS = ['subject', 'actions', 'per_tx_raw', 'daily_raw', 'total_raw', 'expires_at', 'nonce'];
const UINT256_MAX = BigInt('0x' + 'f'.repeat(64));

/** The policy `guard init` writes: local commands only, every limit 0, expires in `days` days. */
export function defaultPolicy(nowS: number = Math.floor(Date.now() / 1000), days = 30): LocalPolicy {
  return {
    subject: 'local',
    actions: LOCAL_TOOLS.map((t) => `tool:${t}`),
    per_tx_raw: '0',
    daily_raw: '0',
    total_raw: '0',
    expires_at: nowS + days * 86400,
    nonce: '1',
  };
}

export function trustshellHome(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const o = env.TRUSTSHELL_HOME?.trim();
  return o ? o : join(home, '.trustshell');
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * PURE. Parse a policy the way the kernel's parsePolicy does: unknown keys are errors, a MISSING limit is "0"
 * (and listed in `defaulted`), a PRESENT malformed one is an error, never quietly zeroed.
 */
export function parsePolicy(input: unknown): { ok: true; policy: LocalPolicy; defaulted: string[] } | { ok: false; errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['policy must be an object'] };
  const errors: string[] = [];
  for (const k of Object.keys(input)) if (!POLICY_KEYS.includes(k)) errors.push(`unknown field "${k.slice(0, 40)}"`);
  const subject = input.subject;
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > 128) errors.push('subject must be the agent id (1-128 characters)');
  const actions: string[] = [];
  if (!Array.isArray(input.actions) || input.actions.length > 64) errors.push('actions must be a list of spend, post, tool or tool:<name>');
  else {
    for (const a of input.actions) {
      if (typeof a !== 'string' || !ACTION.test(a)) errors.push('actions holds an entry that is not spend, post, tool or tool:<name>');
      else if (actions.includes(a)) errors.push(`actions lists "${a.slice(0, 40)}" twice`);
      else actions.push(a);
    }
  }
  const defaulted: string[] = [];
  const limit = (k: 'per_tx_raw' | 'daily_raw' | 'total_raw'): string => {
    const v = input[k];
    if (v === undefined || v === null) {
      defaulted.push(k);
      return '0';
    }
    const s = typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? String(v) : v;
    if (typeof s !== 'string' || !CANONICAL_UINT.test(s) || BigInt(s) > UINT256_MAX) {
      errors.push(`${k}: not a canonical non-negative decimal integer`);
      return '0';
    }
    return s;
  };
  const per = limit('per_tx_raw');
  const daily = limit('daily_raw');
  const total = limit('total_raw');
  const exp = input.expires_at;
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) errors.push('expires_at must be unix seconds');
  const nonce = typeof input.nonce === 'number' && Number.isSafeInteger(input.nonce) && input.nonce >= 0 ? String(input.nonce) : input.nonce;
  if (typeof nonce !== 'string' || !CANONICAL_UINT.test(nonce)) errors.push('nonce must be a non-negative decimal integer');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    defaulted,
    policy: { subject: subject as string, actions, per_tx_raw: per, daily_raw: daily, total_raw: total, expires_at: exp as number, nonce: nonce as string },
  };
}

/** PURE. Parse `{ policy, signature }` text. A signature that is present must be well formed (verified separately). */
export function parsePolicyDocument(text: string): { ok: true; doc: PolicyDocument; defaulted: string[] } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    return { ok: false, errors: [`not JSON: ${(e as Error).message}`] };
  }
  if (!isObject(raw)) return { ok: false, errors: ['the file must be { policy, signature }'] };
  const extra = Object.keys(raw).filter((k) => k !== 'policy' && k !== 'signature');
  if (extra.length) return { ok: false, errors: extra.map((k) => `unknown field "${k.slice(0, 40)}"`) };
  const p = parsePolicy(raw.policy);
  if (!p.ok) return p;
  const s = raw.signature;
  if (s === null || s === undefined) return { ok: true, doc: { policy: p.policy, signature: null }, defaulted: p.defaulted };
  const sigOk =
    isObject(s) &&
    Object.keys(s).every((k) => ['alg', 'public_key', 'fingerprint', 'signature'].includes(k)) &&
    s.alg === 'ed25519' &&
    typeof s.public_key === 'string' &&
    typeof s.fingerprint === 'string' &&
    typeof s.signature === 'string';
  if (!sigOk) return { ok: false, errors: ['signature must be null or { alg: ed25519, public_key, fingerprint, signature }'] };
  return { ok: true, doc: { policy: p.policy, signature: s as unknown as PolicySignature }, defaulted: p.defaulted };
}

export function renderPolicyDocument(doc: PolicyDocument): string {
  return JSON.stringify(doc, null, 2) + '\n';
}

/** sha256 of the RFC 8785 form of the policy: what records and bundles name it by. */
export function policySha256(p: LocalPolicy): string {
  return jcsSha256(p);
}

/**
 * The fingerprint whose signature verifies over THIS policy, or null. A signature left in place after the
 * policy was hand-edited names nobody: it kept the "owner-signed" label until 2026-10-22 (CC1).
 */
export function policySigner(doc: PolicyDocument): string | null {
  const s = doc.signature;
  return s && verifyValue(doc.policy, s, s.signature) ? s.fingerprint : null;
}

/** What a signature that is present but does not verify reads as, wherever a signer would be named. */
export const SIGNATURE_DOES_NOT_VERIFY = 'signature does NOT verify over this policy';

/** Does the signature verify over the policy, by a key whose fingerprint is one of `trusted`? */
export function policySignedBy(doc: PolicyDocument, trusted: readonly string[]): boolean {
  const f = policySigner(doc);
  return f !== null && trusted.includes(f);
}

/** What one action asks for. `amount_raw` is smallest units, a canonical decimal string. */
export interface GuardRequest {
  tool: string;
  class: ToolClass;
  amount_raw?: string;
  /** sha256 of the command a `trustshell run` would start; the command itself is never recorded. */
  command_sha256?: string;
  /** The executable a `trustshell run` would start (its file name only). `run` requires it to BE the tool. */
  executable?: string;
}

/** The action string the policy must list for this request (the kernel's actionPermitted). */
export function actionFor(req: GuardRequest): string {
  return req.class === 'spend' ? 'spend' : req.class === 'post' ? 'post' : `tool:${req.tool}`;
}

function permitted(actions: readonly string[], req: GuardRequest): boolean {
  if (req.class === 'spend') return actions.includes('spend');
  if (req.class === 'post') return actions.includes('post');
  return actions.includes('tool') || actions.includes(`tool:${req.tool}`);
}

export interface GuardDecision {
  decision: 'ALLOWED' | 'DENIED';
  /** Every rule the request broke, not just the first. Empty when allowed. */
  reasons: string[];
}

/**
 * PURE. Weigh one request against the policy. `policy === null` is a file that did not parse: denied.
 * `spent` is what this ledger already ALLOWED today and in total; null means the ledger could not be
 * trusted (a broken chain), and then any amount is denied.
 */
export function decide(
  policy: LocalPolicy | null,
  req: GuardRequest,
  spent: { today: bigint; total: bigint } | null,
  nowS: number,
  problems: string[] = [],
): GuardDecision {
  if (!policy) return { decision: 'DENIED', reasons: [`the policy file does not parse, so everything is denied: ${problems.join('; ') || 'invalid'}`] };
  const reasons: string[] = [];
  if (nowS >= policy.expires_at) reasons.push(`the policy expired at ${new Date(policy.expires_at * 1000).toISOString()}`);
  if (!permitted(policy.actions, req)) reasons.push(`the owner policy does not list ${actionFor(req)}`);
  // The kernel's rule: a spend states its amount. Left out, it skipped every limit (Lane D, 2026-10-21).
  if (req.class === 'spend' && req.amount_raw === undefined) reasons.push('a spend must state its amount (--amount): an amount left out is not zero');
  if (req.amount_raw !== undefined) {
    if (!/^[1-9][0-9]{0,77}$/.test(req.amount_raw)) reasons.push('the amount must be a whole number of smallest units, more than 0');
    else if (spent === null) reasons.push('the receipt ledger is BROKEN, so what was already spent is unknown and no amount is allowed');
    else {
      const amount = BigInt(req.amount_raw);
      const per = BigInt(policy.per_tx_raw);
      const dailyLeft = BigInt(policy.daily_raw) > spent.today ? BigInt(policy.daily_raw) - spent.today : BigInt(0);
      const totalLeft = BigInt(policy.total_raw) > spent.total ? BigInt(policy.total_raw) - spent.total : BigInt(0);
      if (amount > per) reasons.push(`${req.amount_raw} is over per_tx_raw ${policy.per_tx_raw}`);
      if (amount > dailyLeft) reasons.push(`${req.amount_raw} is over what daily_raw ${policy.daily_raw} leaves today (${dailyLeft})`);
      if (amount > totalLeft) reasons.push(`${req.amount_raw} is over what total_raw ${policy.total_raw} leaves (${totalLeft})`);
    }
  }
  return { decision: reasons.length ? 'DENIED' : 'ALLOWED', reasons };
}

/** What the guard did and did not see, stated inside every record. */
export interface AssuranceScope {
  mediated: string[];
  not_mediated: string[];
}

export interface GuardRecord {
  schema: typeof GUARD_RECORD_SCHEMA;
  seq: number;
  ts: string;
  origin: string;
  /**
   * decision: written BEFORE the action. outcome: written after `trustshell run` saw the command end.
   * policy-change: the policy in force changed (guard init/allow/deny/limit/expire/kill/sign, or an import
   * that enforced a carried policy), with the hash before and after. A rule change is never silent.
   */
  kind: 'decision' | 'check' | 'outcome' | 'policy-change';
  requested: GuardRequest & { action: string };
  authorized: GuardDecision & { policy_sha256: string | null; policy_nonce: string | null; policy_signed_by: string | null };
  /** outcome only: what the started process reported. Never what it did. */
  executed: { exit_code: number | null; signal: string | null; duration_ms: number } | 'not run' | null;
  assurance_scope: AssuranceScope;
  /** policy-change only: what changed it, and the policy hash before (null: there was none) and after. */
  change?: { via: string; before_sha256: string | null; after_sha256: string };
  prev: string | null;
  hash: string;
}

export function recordHash(r: Omit<GuardRecord, 'hash'>): string {
  return jcsSha256(r);
}

export interface LedgerReading {
  verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
  count: number;
  /**
   * Amounts this ledger ALLOWED, the kernel's way (repid-engine src/kernel/gate.ts + store.ts spentTotals):
   * `today` is a ROLLING 24 hours before now, under any policy; `total` is under the CURRENT policy hash only,
   * so a new policy starts a new total. null when BROKEN.
   */
  spent: { today: bigint; total: bigint } | null;
  /** The highest policy nonce any record names: the high-water mark a new or imported policy must exceed. */
  max_nonce: string | null;
  last: { seq: number; hash: string } | null;
  breaks: string[];
}

const DAY_S = 86400;

function tally(r: GuardRecord, nowS: number, policySha: string | null, s: { today: bigint; total: bigint }): { today: bigint; total: bigint } {
  // Only a real authorization counts: a `guard check` writes kind "check", which spends nothing.
  const a = r.kind === 'decision' && r.authorized?.decision === 'ALLOWED' ? r.requested?.amount_raw : undefined;
  if (typeof a !== 'string' || !/^[1-9][0-9]{0,77}$/.test(a)) return s;
  const amount = BigInt(a);
  const at = Date.parse(String(r.ts)) / 1000;
  const inDay = Number.isFinite(at) && at > nowS - DAY_S;
  const inPolicy = policySha === null || r.authorized?.policy_sha256 === policySha;
  return { today: s.today + (inDay ? amount : BigInt(0)), total: s.total + (inPolicy ? amount : BigInt(0)) };
}

function higher(a: string | null, b: unknown): string | null {
  if (typeof b !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(b)) return a;
  return a === null || BigInt(b) > BigInt(a) ? b : a;
}

/**
 * PURE. Check every hash and every link, and total the allowed amounts. `from` is the reading of an
 * already-verified prefix: the chain continues from its last hash. `policySha` is the policy in force (null:
 * count every policy's total, as `guard show` does when the policy does not parse).
 */
export function readLedger(text: string, nowS: number = Math.floor(Date.now() / 1000), from?: LedgerReading, policySha: string | null = null): LedgerReading {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const breaks: string[] = [];
  const offset = from?.count ?? 0;
  let prev: string | null = from?.last?.hash ?? null;
  let spent = from?.spent ?? { today: BigInt(0), total: BigInt(0) };
  let maxNonce: string | null = from?.max_nonce ?? null;
  let last: LedgerReading['last'] = from?.last ?? null;
  lines.forEach((line, i) => {
    const n = offset + i + 1;
    let r: GuardRecord;
    try {
      r = JSON.parse(line) as GuardRecord;
    } catch {
      breaks.push(`line ${n}: not JSON`);
      return;
    }
    // Valid JSON that is not an object (null, a number, a list) is not a record. `null` used to throw here, and every
    // command that reads the ledger died with a stack trace instead of reading BROKEN (antifragile night, 2026-10-24).
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      breaks.push(`line ${n}: not a record`);
      return;
    }
    const { hash, ...body } = r;
    let want: string | null = null;
    try {
      want = recordHash(body);
    } catch {
      /* not canonicalizable: a break below */
    }
    if (r.schema !== GUARD_RECORD_SCHEMA) breaks.push(`line ${n}: schema is not ${GUARD_RECORD_SCHEMA}`);
    if (want === null || hash !== want) breaks.push(`line ${n}: hash does not match the record`);
    if (r.prev !== prev) breaks.push(`line ${n}: prev does not match the line before`);
    if (r.seq !== n) breaks.push(`line ${n}: seq is ${r.seq}`);
    spent = tally(r, nowS, policySha, spent);
    maxNonce = higher(maxNonce, r.authorized?.policy_nonce);
    prev = typeof hash === 'string' ? hash : null;
    last = { seq: n, hash: String(hash) };
  });
  const count = offset + lines.length;
  if (count === 0) return { verdict: 'EMPTY', count: 0, spent: { today: BigInt(0), total: BigInt(0) }, max_nonce: null, last: null, breaks };
  return breaks.length || from?.verdict === 'BROKEN'
    ? { verdict: 'BROKEN', count, spent: null, max_nonce: maxNonce, last, breaks }
    : { verdict: 'INTACT', count, spent, max_nonce: maxNonce, last, breaks };
}

/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes and fully verifies only the lines after them;
 * any change to the old bytes misses the cache and the whole ledger is verified again. Measured 2026-10-21
 * (lane B report, same-process A/B, 3 runs): at 10,000 records a full verification cost 541-593 ms per
 * decision, a checkpointed decision 236-284 ms; equal at 1,000. `guard show` always verifies every line.
 */
export const GUARD_CHECKPOINT_FILE = 'guard-receipts.checkpoint.json';

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

export function readLedgerCheckpointed(
  text: string,
  checkpointText: string | null,
  nowS: number = Math.floor(Date.now() / 1000),
  policySha: string | null = null,
): LedgerReading {
  try {
    const c = JSON.parse(checkpointText ?? 'null') as { bytes?: unknown; sha256?: unknown } | null;
    const buf = Buffer.from(text, 'utf8');
    if (c && Number.isSafeInteger(c.bytes) && (c.bytes as number) <= buf.length && sha256(buf.subarray(0, c.bytes as number)) === c.sha256) {
      let prefix: LedgerReading = { verdict: 'EMPTY', count: 0, spent: { today: BigInt(0), total: BigInt(0) }, max_nonce: null, last: null, breaks: [] };
      for (const line of buf.subarray(0, c.bytes as number).toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const r = JSON.parse(line) as GuardRecord;
        prefix = {
          verdict: 'INTACT',
          count: prefix.count + 1,
          spent: tally(r, nowS, policySha, prefix.spent as { today: bigint; total: bigint }),
          max_nonce: higher(prefix.max_nonce, r.authorized?.policy_nonce),
          last: { seq: r.seq, hash: r.hash },
          breaks: [],
        };
      }
      return readLedger(buf.subarray(c.bytes as number).toString('utf8'), nowS, prefix, policySha);
    }
  } catch {
    /* no checkpoint, or one that does not parse: verify everything */
  }
  return readLedger(text, nowS, undefined, policySha);
}

/**
 * The nonce a NEW policy must exceed: the highest of the policy file (if it parses) and every nonce the ledger
 * ever recorded. `guard init --force` after `guard kill` used to restart at 1, which let an old, looser
 * owner-signed policy import as ENFORCED (Lane D, 2026-10-21); deleting policy.json no longer resets it either.
 */
export function nonceHighWater(dir: string, fs: GuardFs = nodeGuardFs()): string | null {
  const loaded = loadPolicy(dir, fs);
  const ledgerPath = join(dir, GUARD_RECEIPTS_FILE);
  const l = fs.exists(ledgerPath) ? readLedger(fs.read(ledgerPath)) : null;
  return higher(l?.max_nonce ?? null, loaded.state === 'ok' ? loaded.doc.policy.nonce : undefined);
}

/** The filesystem calls the guard needs. Injectable so the logic is testable without a disk. */
export interface GuardFs {
  exists(p: string): boolean;
  read(p: string): string;
  append(p: string, data: string): void;
  write(p: string, data: string): void;
  mkdirp(p: string): void;
  /** Take the ledger lock in `dir`; returns the release. Throws NOT_CHECKED if it cannot be had. */
  lock(dir: string): () => void;
}

export const GUARD_LOCK_FILE = 'guard-receipts.lock';

export const nodeGuardFs = (): GuardFs => {
  const fs = require('node:fs') as typeof import('node:fs');
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    append: (p, d) => fs.appendFileSync(p, d, { mode: 0o600 }),
    write: (p, d) => fs.writeFileSync(p, d, { mode: 0o600 }),
    mkdirp: (p) => {
      fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    },
    // One writer at a time. Eight simultaneous `guard check` calls forked the chain (Lane D, 2026-10-21), and a
    // forked chain reads BROKEN, which refuses every amount. Create-exclusive lock file; a lock older than 30 s
    // is a crashed writer and is taken over.
    // ponytail: a sync spin of 15 ms steps, up to 10 s; a real queue if contention ever matters.
    lock: (dir) => {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, GUARD_LOCK_FILE);
      const deadline = Date.now() + 10_000;
      const pause = new Int32Array(new SharedArrayBuffer(4));
      for (;;) {
        try {
          fs.closeSync(fs.openSync(path, 'wx'));
          return () => {
            try {
              fs.unlinkSync(path);
            } catch {
              /* already gone */
            }
          };
        } catch (e) {
          if ((e as { code?: string }).code !== 'EEXIST') throw e;
          try {
            if (Date.now() - fs.statSync(path).mtimeMs > 30_000) fs.unlinkSync(path);
          } catch {
            /* released meanwhile: try again */
          }
          if (Date.now() > deadline) throw new Error(`NOT_CHECKED the guard ledger is locked by another writer (${path}); nothing was decided`);
          Atomics.wait(pause, 0, 0, 15);
        }
      }
    },
  };
};

export type LoadedPolicy =
  | { state: 'absent'; path: string }
  | { state: 'invalid'; path: string; problems: string[] }
  | { state: 'ok'; path: string; doc: PolicyDocument; sha256: string; defaulted: string[] };

export function loadPolicy(dir: string, fs: GuardFs = nodeGuardFs()): LoadedPolicy {
  const path = join(dir, POLICY_FILE);
  if (!fs.exists(path)) return { state: 'absent', path };
  const r = parsePolicyDocument(fs.read(path));
  return r.ok ? { state: 'ok', path, doc: r.doc, sha256: policySha256(r.doc.policy), defaulted: r.defaulted } : { state: 'invalid', path, problems: r.errors };
}

export interface GuardContext {
  fs?: GuardFs;
  origin?: string;
  nowS?: number;
  ts?: string;
  /** A reason the caller knows and the policy cannot express (init --pai's child process): denied too. */
  extraReasons?: string[];
  /** 'check' for `guard check`: a question, not an authorization, so its amount is never counted as spent. */
  kind?: 'decision' | 'check';
}

/** Append one record to the ledger in `dir`, chained to the last one, and move the checkpoint. Takes the lock. */
export function appendRecord(
  dir: string,
  fields: Omit<GuardRecord, 'schema' | 'seq' | 'ts' | 'origin' | 'prev' | 'hash'>,
  ctx: GuardContext = {},
): GuardRecord {
  const fs = ctx.fs ?? nodeGuardFs();
  const release = fs.lock(dir);
  try {
    return appendUnlocked(dir, fields, { ...ctx, fs });
  } finally {
    release();
  }
}

function appendUnlocked(
  dir: string,
  fields: Omit<GuardRecord, 'schema' | 'seq' | 'ts' | 'origin' | 'prev' | 'hash'>,
  ctx: GuardContext & { fs: GuardFs },
): GuardRecord {
  const fs = ctx.fs;
  const nowS = ctx.nowS ?? Math.floor(Date.now() / 1000);
  const ledgerPath = join(dir, GUARD_RECEIPTS_FILE);
  const checkpointPath = join(dir, GUARD_CHECKPOINT_FILE);
  const text = fs.exists(ledgerPath) ? fs.read(ledgerPath) : '';
  const ledger = readLedgerCheckpointed(text, fs.exists(checkpointPath) ? fs.read(checkpointPath) : null, nowS);
  const body: Omit<GuardRecord, 'hash'> = {
    schema: GUARD_RECORD_SCHEMA,
    seq: (ledger.last?.seq ?? 0) + 1,
    ts: ctx.ts ?? new Date(nowS * 1000).toISOString(),
    origin: ctx.origin ?? 'Cli',
    ...fields,
    prev: ledger.last?.hash ?? null,
  };
  const record: GuardRecord = { ...body, hash: recordHash(body) };
  const line = canonicalize(record) + '\n';
  fs.mkdirp(dir);
  fs.append(ledgerPath, line);
  if (ledger.verdict !== 'BROKEN') {
    const bytes = Buffer.from(text + line, 'utf8');
    fs.write(checkpointPath, JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes) }) + '\n');
  }
  return record;
}

/**
 * Decide ONE request against the policy in `dir` and record the decision BEFORE the caller acts. No policy file:
 * null (nothing decided, nothing written). The caller then runs the action only on ALLOWED.
 * Reading the ledger, deciding and appending happen under ONE lock, so a concurrent writer can neither fork the
 * chain nor spend the same allowance twice.
 * ponytail: reads and hashes the whole ledger file per decision (see GUARD_CHECKPOINT_FILE for the measured cost).
 */
export function guardDecide(
  dir: string,
  req: GuardRequest,
  scope: AssuranceScope,
  ctx: GuardContext = {},
): { decision: GuardDecision; record: GuardRecord; loaded: Exclude<LoadedPolicy, { state: 'absent' }> } | null {
  const fs = ctx.fs ?? nodeGuardFs();
  const nowS = ctx.nowS ?? Math.floor(Date.now() / 1000);
  const loaded = loadPolicy(dir, fs);
  if (loaded.state === 'absent') return null;
  const release = fs.lock(dir);
  try {
    return decideLocked(dir, req, scope, { ...ctx, fs, nowS }, loaded);
  } finally {
    release();
  }
}

function decideLocked(
  dir: string,
  req: GuardRequest,
  scope: AssuranceScope,
  ctx: GuardContext & { fs: GuardFs; nowS: number },
  loaded: Exclude<LoadedPolicy, { state: 'absent' }>,
): { decision: GuardDecision; record: GuardRecord; loaded: Exclude<LoadedPolicy, { state: 'absent' }> } {
  const { fs, nowS } = ctx;
  const ledgerPath = join(dir, GUARD_RECEIPTS_FILE);
  const checkpointPath = join(dir, GUARD_CHECKPOINT_FILE);
  const ledger = readLedgerCheckpointed(
    fs.exists(ledgerPath) ? fs.read(ledgerPath) : '',
    fs.exists(checkpointPath) ? fs.read(checkpointPath) : null,
    nowS,
    loaded.state === 'ok' ? loaded.sha256 : null,
  );
  const base = loaded.state === 'ok' ? decide(loaded.doc.policy, req, ledger.spent, nowS) : decide(null, req, null, nowS, loaded.problems);
  const reasons = [...base.reasons, ...(ctx.extraReasons ?? [])];
  const decision: GuardDecision = { decision: reasons.length ? 'DENIED' : 'ALLOWED', reasons };
  const requested: GuardRecord['requested'] = { action: actionFor(req), tool: req.tool, class: req.class };
  if (req.amount_raw !== undefined) requested.amount_raw = req.amount_raw;
  if (req.command_sha256 !== undefined) requested.command_sha256 = req.command_sha256;
  if (req.executable !== undefined) requested.executable = req.executable;
  const kind = ctx.kind ?? 'decision';
  const record = appendUnlocked(
    dir,
    {
      kind,
      requested,
      authorized: {
        ...decision,
        policy_sha256: loaded.state === 'ok' ? loaded.sha256 : null,
        policy_nonce: loaded.state === 'ok' ? loaded.doc.policy.nonce : null,
        policy_signed_by: loaded.state === 'ok' ? policySigner(loaded.doc) : null,
      },
      executed: decision.decision === 'DENIED' || kind === 'check' ? 'not run' : null,
      assurance_scope: scope,
    },
    ctx,
  );
  return { decision, record, loaded };
}

/** The sentences `guard show` will not let a reader forget. */
export const GUARD_DOES_NOT_COVER = [
  'It covers the trustshell CLI and `trustshell run`. The MCP server (trustshell-mcp) does not read this policy yet, and neither do SDK calls (code that imports @hyperdag/trustshell): such code must call guardDecide itself.',
  'It stops a mistaken command, not an agent that can run the CLI itself: `guard allow` changes the policy (every change is recorded, with the hash before and after).',
  'It is not a sandbox. Anything running as you can edit the policy, delete records, or act without trustshell.',
  '`run` bounds WHICH executable starts, not what it does: allowing an interpreter (node, python, sh, powershell) allows any script it is given.',
  'TRUSTSHELL_HOME pointed at a folder with no policy turns the gate off for that command. A warning says so; it does not stop the command.',
  'It decides before an action starts. What a started command does (files, network, child processes) is not observed.',
  'A missing record never proves no action happened: the guard sees only what goes through it.',
  'The record chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.',
  'Amounts are counted from the decisions THIS ledger allowed. A spend made without asking the guard is not counted.',
] as const;

/**
 * The loud line for a TRUSTSHELL_HOME that hides a policy: set to a folder with no policy while the default
 * `~/.trustshell/policy.json` exists, it switches the guard off for that command (Lane D, 2026-10-21). null when
 * nothing is hidden.
 */
export function homeShadowWarning(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string | null {
  const set = env.TRUSTSHELL_HOME?.trim();
  if (!set) return null;
  const { existsSync } = require('node:fs') as typeof import('node:fs');
  const { resolve } = require('node:path') as typeof import('node:path');
  const def = join(home, '.trustshell');
  if (resolve(set) === resolve(def) || existsSync(join(set, POLICY_FILE)) || !existsSync(join(def, POLICY_FILE))) return null;
  return `WARNING: TRUSTSHELL_HOME=${set} has no policy, so the owner policy at ${join(def, POLICY_FILE)} is NOT in force for this command`;
}
