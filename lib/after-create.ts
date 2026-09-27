export const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

export type AfterCreateTable = {
  can_verify: string;
  can_bind: string;
  can_stake: string;
  can_rate_models: string;
};

export const NOT_CHECKED_TABLE: AfterCreateTable = {
  can_verify: 'NOT_CHECKED',
  can_bind: 'NOT_CHECKED',
  can_stake: 'NOT_CHECKED',
  can_rate_models: 'NOT_CHECKED',
};

export type AfterCreateResult = AfterCreateTable & { source: 'counted' | 'NOT_CHECKED' };

function notChecked(): AfterCreateResult {
  return { ...NOT_CHECKED_TABLE, source: 'NOT_CHECKED' };
}

/** Unset TRUSTSHELL_API_URL uses the default engine. A blank value is a missing URL. */
export function engineBase(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL')) return DEFAULT_ENGINE;
  const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
}

export function saysStakeLive(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SAYS_STAKE_LIVE;
  return typeof raw === 'string' && raw.trim().length > 0;
}

function boolCell(value: unknown): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

/** A true can_stake stays shadow unless SAYS_STAKE_LIVE is set. This does not enable staking. */
export function stakeCell(value: unknown, liveLabel: boolean): string {
  if (value === true) return liveLabel ? 'live' : 'shadow — not live';
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

/** The after-create page never prints can_stake as live. This does not flip REAL_STAKING. */
export function shownStakeCell(cell: string): string {
  if (cell === 'live') return 'testnet / shadow';
  return cell;
}

export function tableFromBody(body: unknown, liveLabel: boolean): AfterCreateTable {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    can_verify: boolCell(record.can_verify),
    can_bind: boolCell(record.can_bind),
    can_stake: stakeCell(record.can_stake, liveLabel),
    can_rate_models: boolCell(record.can_rate_models),
  };
}

export async function loadAfterCreate(opts: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<AfterCreateResult> {
  const env = opts.env ?? process.env;
  const base = engineBase(env);
  if (!base) return notChecked();
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${base}/api/v1/after-create`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return notChecked();
    const body: unknown = await res.json();
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (record.status !== undefined && record.status !== 'counted') return notChecked();
    return { ...tableFromBody(body, saysStakeLive(env)), source: 'counted' };
  } catch {
    return notChecked();
  }
}
