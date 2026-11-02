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
 *   autonomy                LOCAL ONLY, optional: autonomy levels, off unless present, shadow by default
 *                           (src/lib/autonomy.ts). A level only ever narrows this policy.
 *   scripts                 LOCAL ONLY, optional: the scripts an allowed interpreter may run, each pinned by its
 *                           resolved path and sha256 (C5, INTERPRETERS below). Absent = no interpreter runs anything.
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
import { join, resolve } from 'node:path';
import { canonicalize, jcsSha256 } from './jcs';
import { verifyValue, type Signer } from './install-key';
import { AUTONOMY_FILE, appendAutonomy, levelAllows, levelState, parseAutonomy, readAutonomy, type AutonomyConfig, type AutonomyEvent, type AutonomyReading, type LevelState } from './autonomy';

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
  /** Local only (not in the kernel): autonomy levels. Absent = off. */
  autonomy?: AutonomyConfig;
  /** Local only (not in the kernel): the scripts an allowed interpreter may run (C5). Absent = none. */
  scripts?: ScriptPin[];
}

/** One script an interpreter may run: the executable's name, the file's resolved path, and the sha256 of its bytes. */
export interface ScriptPin {
  tool: string;
  path: string;
  sha256: string;
}

/**
 * C5. The interpreters Guard recognises, by the executable's own name as `run` derives it (lower case, .exe/.cmd
 * dropped). Each starts only as `<name> <pinned script> [args]`, powershell only as
 * `<name> -NoProfile [-NonInteractive] [-NoLogo] [-ExecutionPolicy <p>] -File <pinned script> [args]`. Anything
 * before the script (inline code, stdin, a prompt, a module, a preload or loader) is refused: there is no one file
 * to pin. Interpreters not listed here are executables like any other (C1): allowed by name, they run anything.
 */
type Family = 'node' | 'python' | 'sh' | 'powershell';
const INTERPRETERS: ReadonlyArray<readonly [Family, RegExp]> = [
  ['node', /^(node|nodejs)$/],
  ['python', /^(python[0-9.]*|pythonw|py)$/],
  ['sh', /^(sh|bash|dash|zsh|ksh|ash)$/],
  ['powershell', /^(powershell|pwsh)$/],
];
export const INTERPRETER_NAMES = 'node, python, py, sh, bash, dash, zsh, ksh, powershell, pwsh';
/** Variables that make the interpreter run code before the script, without the script asking. */
const STARTUP_ENV: Record<Family, string[]> = {
  node: ['NODE_OPTIONS'],
  python: ['PYTHONSTARTUP', 'PYTHONINSPECT', 'PYTHONPATH', 'PYTHONHOME'],
  sh: ['BASH_ENV', 'ENV', 'ZDOTDIR'],
  powershell: [],
};
/** The rule every interpreter denial states. */
export const INTERPRETER_RULE = 'an allowed interpreter runs only a script the policy pins by sha256';

const interpreterOf = (executable: string): Family | null => INTERPRETERS.find(([, re]) => re.test(executable))?.[0] ?? null;
/** Is `executable` (as `run` names it) an interpreter Guard pins scripts for? */
export const isInterpreter = (executable: string): boolean => interpreterOf(executable) !== null;

/** PURE. The script file an interpreter is told to run, or why the command runs code that no pin can cover. */
export function interpreterScript(executable: string, args: readonly string[]): { script: string } | { refuse: string } {
  const fam = interpreterOf(executable);
  const shape = fam === 'powershell' ? `${executable} -NoProfile -File <script> [args]` : `${executable} <script> [args]`;
  const no = (what: string, why: string) => ({ refuse: `${what} is refused (${why}); ${INTERPRETER_RULE}, started as "${shape}"` });
  // An option is shown by its name; anything else could be the command's own text, which is never recorded.
  const shown = (a: string) => {
    const name = a.split('=')[0] ?? '';
    return /^[-+/][A-Za-z0-9-]{0,40}$/.test(name) ? name : 'an argument';
  };
  if (fam === 'powershell') {
    let noProfile = false;
    for (let i = 0; i < args.length; i += 1) {
      const a = String(args[i]).toLowerCase();
      if (a === '-noprofile') noProfile = true;
      else if (a === '-noninteractive' || a === '-nologo') continue;
      else if (a === '-executionpolicy' && /^[A-Za-z]{1,40}$/.test(args[i + 1] ?? '')) i += 1;
      else if (a === '-file') {
        const s = args[i + 1];
        if (s === undefined || s === '' || s.startsWith('-')) return no(`${executable} -File ${s === undefined ? 'with nothing after it' : shown(s)}`, 'it names no script file');
        if (!noProfile) return no(`${executable} without -NoProfile`, 'the profile scripts would run first, and they are not pinned');
        return { script: s };
      } else return no(`${executable} ${shown(String(args[i]))}`, 'only -NoProfile, -NonInteractive, -NoLogo and -ExecutionPolicy <policy> may come before -File');
    }
    return no(`${executable} with no -File script`, 'it runs a command, stdin or a prompt');
  }
  // ponytail: no option at all may come before the script, harmless ones (-u, --enable-source-maps) included; an
  // allowlist of those, each reasoned, when someone needs one.
  const first = args[0];
  if (first === undefined || first === '') return no(`${executable} with no script`, 'it reads code from the terminal or stdin');
  if (/^[-+]/.test(first)) return no(`${executable} ${shown(first)}`, 'an option before the script can run inline code, read stdin, load a module or loader, or open a prompt');
  if (fam === 'node' && first === 'inspect') return no('node inspect', 'it starts the debugger');
  return { script: first };
}

/**
 * The file a script path names, the way node, python, sh and powershell open it: relative to the working directory,
 * through any symlink. Refused when that is not exactly one regular file. Reads the bytes it hashes.
 */
export function resolveScript(arg: string, cwd: string = process.cwd()): { ok: true; path: string; sha256: string } | { ok: false; why: string } {
  const fs = require('node:fs') as typeof import('node:fs');
  try {
    const real = fs.realpathSync.native(resolve(cwd, arg));
    if (!fs.statSync(real).isFile()) return { ok: false, why: 'the script is not a regular file' };
    return { ok: true, path: real, sha256: sha256(fs.readFileSync(real)) };
  } catch (e) {
    return { ok: false, why: `the script cannot be resolved to one regular file (${(e as { code?: string }).code ?? 'unreadable'})` };
  }
}

/**
 * C5, for `run`: the script an interpreter would open, resolved and hashed, and every reason it must not start. Not an
 * interpreter: nothing. Whether the script is PINNED is decided under the policy lock, in decide().
 * TOCTOU: the file is hashed here and opened by the interpreter a few milliseconds later; a swap in between is not
 * caught. Anything that can make that swap runs as the owner, and could as well edit the policy (not a boundary).
 */
export function interpreterCheck(
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string = process.cwd(),
): { script?: { path: string; sha256: string }; reasons: string[] } {
  const fam = interpreterOf(executable);
  if (!fam) return { reasons: [] };
  const reasons = STARTUP_ENV[fam].filter((v) => env[v]).map((v) => `${v} is set, so ${executable} would run code before the script (unset it); ${INTERPRETER_RULE}`);
  const s = interpreterScript(executable, args);
  if ('refuse' in s) return { reasons: [...reasons, s.refuse] };
  const r = resolveScript(s.script, cwd);
  return r.ok ? { script: { path: r.path, sha256: r.sha256 }, reasons } : { reasons: [...reasons, `${r.why}; ${INTERPRETER_RULE}`] };
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
/** PURE. Is `a` an entry a policy's `actions` may hold (spend, post, tool or tool:<name>)? */
export const isPolicyAction = (a: string): boolean => ACTION.test(a);
const CANONICAL_UINT = /^(?:0|[1-9][0-9]{0,77})$/;
const POLICY_KEYS = ['subject', 'actions', 'per_tx_raw', 'daily_raw', 'total_raw', 'expires_at', 'nonce', 'autonomy', 'scripts'];
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** Absolute on either platform: a carried policy is parsed on the host it was carried to. */
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;

function parseScripts(v: unknown, errors: string[]): ScriptPin[] {
  if (!Array.isArray(v) || v.length > 64) {
    errors.push('scripts must be a list of at most 64 { tool, path, sha256 }');
    return [];
  }
  const pins: ScriptPin[] = [];
  for (const s of v) {
    const ok =
      isObject(s) &&
      Object.keys(s).every((k) => k === 'tool' || k === 'path' || k === 'sha256') &&
      typeof s.tool === 'string' &&
      interpreterOf(s.tool) !== null &&
      typeof s.path === 'string' &&
      s.path.length <= 4096 &&
      ABSOLUTE.test(s.path) &&
      !s.path.includes('\0') &&
      typeof s.sha256 === 'string' &&
      SHA256_HEX.test(s.sha256);
    if (!ok) errors.push(`scripts holds an entry that is not { tool: one of ${INTERPRETER_NAMES}, path: an absolute path, sha256: 64 lower-case hex }`);
    else if (pins.some((p) => p.tool === s.tool && p.path === s.path)) errors.push(`scripts pins ${s.tool} ${String(s.path).slice(0, 80)} twice`);
    else pins.push({ tool: s.tool as string, path: s.path as string, sha256: s.sha256 as string });
  }
  return pins;
}
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

/**
 * OPT-IN, default off. TRUSTSHELL_REQUIRE_POLICY set (and not "", "0" or "false") makes an ABSENT policy fail
 * CLOSED on the three surfaces that otherwise warn-and-allow it (runGuarded, the MCP server, sdkGuard). It does
 * not change the warn-and-allow DEFAULT: the cooperative guardrail stays, and only the owner turns this on. It
 * guards against accidental misconfiguration (a lost policy, a mis-pointed TRUSTSHELL_HOME), not a hostile owner:
 * anyone who can set the env can unset it.
 */
export function requirePolicy(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TRUSTSHELL_REQUIRE_POLICY?.trim().toLowerCase();
  return v !== undefined && v !== '' && v !== '0' && v !== 'false';
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
  const auto = input.autonomy === undefined ? null : parseAutonomy(input.autonomy);
  if (auto && !auto.ok) errors.push(...auto.errors);
  const scripts = input.scripts === undefined ? null : parseScripts(input.scripts, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    defaulted,
    policy: {
      subject: subject as string,
      actions,
      per_tx_raw: per,
      daily_raw: daily,
      total_raw: total,
      expires_at: exp as number,
      nonce: nonce as string,
      // Only when present: a policy without it hashes exactly as it did before autonomy existed.
      ...(auto?.ok ? { autonomy: auto.config } : {}),
      ...(scripts ? { scripts } : {}),
    },
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
  /** The script an interpreter `executable` would open (C5): resolved path and sha256. Recorded by its hash only. */
  script?: { path: string; sha256: string };
}

/**
 * PURE. C5: why this request may not start an interpreter, or null. An interpreter starts only with a script whose
 * resolved path AND sha256 the policy pins for that executable; no script, an unpinned one or a changed one: denied.
 */
export function pinReason(policy: LocalPolicy, req: GuardRequest): string | null {
  const exe = req.executable;
  if (exe === undefined || interpreterOf(exe) === null) return null;
  const how = `trustshell guard allow tool:${exe} --script <path>`;
  const s = req.script;
  if (!s) return `${exe} is an interpreter and no script file was resolved; ${INTERPRETER_RULE} (${how} pins one)`;
  const pins = (policy.scripts ?? []).filter((p) => p.tool === exe && p.path === s.path);
  if (pins.some((p) => p.sha256 === s.sha256)) return null;
  return pins.length
    ? `the script changed since it was pinned for ${exe} (sha256 now ${s.sha256.slice(0, 12)}…); ${INTERPRETER_RULE} (${how} pins it again)`
    : `the script (sha256 ${s.sha256.slice(0, 12)}…) is not pinned for ${exe}; ${INTERPRETER_RULE} (${how} pins it)`;
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
  const pin = pinReason(policy, req);
  if (pin) reasons.push(pin);
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
  /** What was asked. A script is recorded by its sha256 only, never by its path (the command is never recorded). */
  requested: Omit<GuardRequest, 'script'> & { action: string; script_sha256?: string };
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
  const fixedReasons = [...base.reasons, ...(ctx.extraReasons ?? [])];
  // AUTONOMY (src/lib/autonomy.ts), off unless the policy has the block. Shadow can never stop an action: a failure
  // in it is swallowed and the decision stands. Enforce fails closed: a failure throws, and nothing runs.
  const policy = loaded.state === 'ok' ? loaded.doc.policy : null;
  const auto = policy?.autonomy;
  let reading: AutonomyReading | null = null;
  let level: LevelState | null = null;
  if (auto) {
    try {
      const p = join(dir, AUTONOMY_FILE);
      reading = readAutonomy(fs.exists(p) ? fs.read(p) : '');
      level = levelState(reading, auto);
    } catch (e) {
      if (auto.mode === 'enforce') throw e;
    }
  }
  const levelOk = level ? levelAllows(level.level, req) : true;
  const reasons =
    auto?.mode === 'enforce' && level && !levelOk ? [...fixedReasons, `autonomy level L${level.level} does not allow ${actionFor(req)} (enforced by the owner)`] : fixedReasons;
  const decision: GuardDecision = { decision: reasons.length ? 'DENIED' : 'ALLOWED', reasons };
  const requested: GuardRecord['requested'] = { action: actionFor(req), tool: req.tool, class: req.class };
  if (req.amount_raw !== undefined) requested.amount_raw = req.amount_raw;
  if (req.command_sha256 !== undefined) requested.command_sha256 = req.command_sha256;
  if (req.executable !== undefined) requested.executable = req.executable;
  if (req.script !== undefined) requested.script_sha256 = req.script.sha256;
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
  // A `guard check` is a question: no would-be record, never an incident.
  if (auto && policy && reading && level && kind === 'decision') {
    try {
      const ref = { seq: record.seq, hash: record.hash };
      const fixed = fixedReasons.length ? 'DENIED' : 'ALLOWED';
      const events: AutonomyEvent[] = [
        { kind: 'would-be', guard_record: ref, action: requested.action, class: req.class, level: level.level, fixed, earned: fixed === 'ALLOWED' && levelOk ? 'ALLOWED' : 'DENIED' },
      ];
      // Out of lane: the policy does not list it, the caller named a reason it is always denied (a `run` executable
      // that is not the tool, init --pai, learn check run), or an enforced level refused it. Not: expiry, an amount
      // over a cap, a policy file that does not parse. Those are the owner's state, not the agent's attempt.
      // An interpreter asked to run code the policy does not pin is out of lane too (C5).
      const outOfLane =
        decision.decision === 'DENIED' &&
        (!permitted(policy.actions, req) || pinReason(policy, req) !== null || (ctx.extraReasons?.length ?? 0) > 0 || (auto.mode === 'enforce' && !levelOk));
      if (outOfLane) events.push({ kind: 'incident', guard_record: ref, action: requested.action, reasons });
      appendAutonomy(dir, fs, auto, events, record.ts, reading);
    } catch (e) {
      if (auto.mode === 'enforce') throw e;
    }
  }
  return { decision, record, loaded };
}

/** A Guard refusal of one SDK call (C4): the call, the action it was decided as, every rule it broke, and its record. */
export class GuardDeniedError extends Error {
  constructor(
    readonly call: string,
    readonly action: string,
    readonly reasons: string[],
    readonly record: { seq: number; hash: string } | null,
    readonly policyPath: string | null,
  ) {
    super(
      `DENIED by the owner policy${policyPath ? ` (${policyPath})` : ''}${record ? `, record ${record.seq}` : ''}: ${call} is ${action}; ${reasons.join('; ')}. Nothing was run. trustshell guard show prints the policy.`,
    );
    this.name = 'GuardDeniedError';
  }
}

/** The scope an SDK decision record states. */
export function sdkScope(call: string): AssuranceScope {
  return {
    mediated: [`whether the SDK call ${call} was allowed to start, checked in the calling process against the owner policy before it started`],
    not_mediated: [
      'what the call does once started',
      'code in the same process that does not call the SDK: it can fetch, sign or write files itself',
      'a TRUSTSHELL_HOME holding no policy (the gate is off for it, unless TRUSTSHELL_REQUIRE_POLICY is set)',
    ],
  };
}

const sdkWarned = new Set<string>();

/**
 * C4: the SDK's own action functions call this BEFORE they act. The same decision and ledger as the CLI and the MCP
 * server, origin 'Sdk', policy re-read from `env`'s TRUSTSHELL_HOME on every call. Throws GuardDeniedError on a
 * denial, and when the policy cannot be checked (fail closed). No policy: returns, as the CLI does (C9); a
 * TRUSTSHELL_HOME that hides the default policy is warned about on stderr once per process, since a library warning
 * on every call would drown its caller.
 */
export function sdkGuard(call: string, req: GuardRequest, env: NodeJS.ProcessEnv = process.env): void {
  const shadow = homeShadowWarning(env);
  if (shadow && !sdkWarned.has(shadow)) {
    sdkWarned.add(shadow);
    process.stderr.write(`trustshell sdk: ${shadow}\n`);
  }
  let g: ReturnType<typeof guardDecide>;
  try {
    g = guardDecide(trustshellHome(env), req, sdkScope(call), { origin: 'Sdk' });
  } catch (e) {
    throw new GuardDeniedError(call, actionFor(req), [`the owner policy could not be checked (${e instanceof Error ? e.message : String(e)})`], null, null);
  }
  if (!g) {
    // No policy. Default: return (allow), as C9 documents. Opt-in TRUSTSHELL_REQUIRE_POLICY: fail closed, like the
    // unparseable path above (record and path null: there is no policy to name).
    if (requirePolicy(env)) {
      throw new GuardDeniedError(call, actionFor(req), [`no policy at ${join(trustshellHome(env), POLICY_FILE)} and TRUSTSHELL_REQUIRE_POLICY is set`], null, null);
    }
    return;
  }
  if (g.decision.decision === 'DENIED') {
    throw new GuardDeniedError(call, g.record.requested.action, g.decision.reasons, { seq: g.record.seq, hash: g.record.hash }, g.loaded.path);
  }
}

/** The sentences `guard show` will not let a reader forget. */
export const GUARD_DOES_NOT_COVER = [
  "It covers the trustshell CLI, `trustshell run`, every trustshell-mcp tool call (the MCP server reads this policy and records in this ledger on each call) and the SDK's own acting functions (code that imports @hyperdag/trustshell: the TrustShell network methods, x402 signing, the kernel, signer and memory-writing exports, decided before they act, origin Sdk). Code that acts without those functions (its own fetch, signing or file writes) is not covered: the SDK cannot see it.",
  'It stops a mistaken command, not an agent that can run the CLI itself: `guard allow` changes the policy (every change is recorded, with the hash before and after).',
  'It is not a sandbox. Anything running as you can edit the policy, delete records, or act without trustshell.',
  '`run` bounds WHICH executable starts, not what it does. An interpreter it recognises (node, python, sh and its kin, powershell) starts only with an entry script the policy pins by path and sha256, hashed as it starts; inline code, stdin, a prompt, module and loader flags are refused. A pin covers that one file: not what it imports or sources, not startup files the interpreter reads by itself (python site hooks, ~/.zshenv), not a file swapped between the hash and the open. Other interpreters (ruby, perl, deno, bun, cmd) and programs that start others (env, npx, xargs) run whatever they are given.',
  'TRUSTSHELL_HOME pointed at a folder with no policy turns the gate off for that command, or for an MCP server started with it. A warning says so; it does not stop the command. Set TRUSTSHELL_REQUIRE_POLICY (opt-in, default off) to make an absent policy fail closed instead.',
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
