/**
 * trustshell bind-status. Reads after-create. can_stake true stays shadow, never live.
 */
const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';
const SHADOW = 'shadow — not live';
const MISSING = 'can_bind NOT_CHECKED\ncan_stake NOT_CHECKED';

function engineBase(env: NodeJS.ProcessEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL')) return DEFAULT_ENGINE;
  const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
}

function cell(value: unknown): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

/** A true stake is shadow even when SAYS_STAKE_LIVE is set. This command does not send. */
export function stakeShadow(value: unknown): string {
  if (value === true) return SHADOW;
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

export async function bindStatusText(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<string> {
  if (opts.env.OFFLINE === '1') return MISSING;
  const base = engineBase(opts.env);
  if (!base) return MISSING;
  try {
    const res = await opts.fetchImpl(`${base}/api/v1/after-create`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return MISSING;
    const body = (await res.json()) as unknown;
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    if (!record || (record.status !== undefined && record.status !== 'counted')) return MISSING;
    return `can_bind ${cell(record.can_bind)}\ncan_stake ${stakeShadow(record.can_stake)}`;
  } catch {
    return MISSING;
  }
}
