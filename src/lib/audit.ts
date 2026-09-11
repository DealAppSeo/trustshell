import { appendFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { TrustShellError } from './trustshell';
import type { AgentTurnOrigin } from './origin';

/** What a spend records before it runs. Origin, amount, cap, agentId — the audit-before-act row. */
export interface SpendIntent {
  origin: AgentTurnOrigin;
  amount: number | string;
  cap: number | string;
  agentId: string;
}

/** A policy that admits (or refuses) a spend. Its ABSENCE is a refusal, never a default-allow. */
export interface SpendPolicy {
  allow: boolean;
  reason?: string;
}

export interface AuditOpts {
  /** Override the `.trustshell` dir (tests). */
  dir?: string;
  /** Fixed timestamp (tests). */
  now?: string;
  /** Redirect the row instead of writing to disk (tests). */
  stream?: { write(s: string): unknown };
}

function trustshellDir(dir?: string): string {
  if (dir) return dir;
  if (process.env.TRUSTSHELL_HOME) return process.env.TRUSTSHELL_HOME;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return join(home, '.trustshell');
}

// ponytail: mirrors scripts/value-events.mjs's `{ ...data, ts, event }` line + 0700/0600 perms.
// Two writers on purpose — that script is device-only and unpublished (package files[] ships dist/
// only), this runs inside the published SDK. Keep the line schema identical; consolidate if they drift.
function appendIntentRow(intent: SpendIntent, opts: AuditOpts): void {
  const line =
    JSON.stringify({
      origin: intent.origin,
      amount: intent.amount,
      cap: intent.cap,
      agentId: intent.agentId,
      ts: opts.now ?? new Date().toISOString(),
      event: 'intent',
    }) + '\n';
  if (opts.stream) {
    opts.stream.write(line);
    return;
  }
  const dir = trustshellDir(opts.dir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* windows */ }
  const file = join(dir, 'value-events.jsonl');
  appendFileSync(file, line, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* windows */ }
}

/**
 * Audit before act. Record the intent row FIRST (so the attempt is on the device log whether or not
 * it proceeds), THEN require a policy, THEN run `act`. A missing (`undefined`/`null`) policy throws
 * `policy_required` before `act` is ever called — a spend with no policy behind it does not run.
 * `{ allow: false }` throws `policy_denied`. Same fail-closed posture as the cap and the origin.
 *
 * Wrap `buildX402Payment` / `executeA2A` with this at the spend boundary.
 */
export async function auditThenAct<T>(
  intent: SpendIntent,
  policy: SpendPolicy | null | undefined,
  act: () => Promise<T>,
  opts: AuditOpts = {},
): Promise<T> {
  appendIntentRow(intent, opts);
  if (policy === null || policy === undefined) {
    throw new TrustShellError('policy_required: spend intent has no policy (fail-closed — missing policy refuses)', 403);
  }
  if (!policy.allow) {
    throw new TrustShellError(`policy_denied: ${policy.reason ?? 'policy did not admit this spend'}`, 403);
  }
  return act();
}
