const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

const NOT_CHECKED_LINES = [
  'can_verify NOT_CHECKED',
  'can_bind NOT_CHECKED',
  'can_stake NOT_CHECKED',
  'can_rate_models NOT_CHECKED',
  'honesty-a NOT_CHECKED',
].join('\n');

function engineBase(env: NodeJS.ProcessEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL')) return DEFAULT_ENGINE;
  const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
}

function saysStakeLive(env: NodeJS.ProcessEnv): boolean {
  const raw = env.SAYS_STAKE_LIVE;
  return typeof raw === 'string' && raw.trim().length > 0;
}

function cell(value: unknown): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

function stakeCell(value: unknown, liveLabel: boolean): string {
  if (value === true) return liveLabel ? 'live' : 'shadow — not live';
  if (value === false) return 'false';
  return 'NOT_CHECKED';
}

function afterLines(body: unknown, liveLabel: boolean): string[] {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return [
    `can_verify ${cell(record.can_verify)}`,
    `can_bind ${cell(record.can_bind)}`,
    `can_stake ${stakeCell(record.can_stake, liveLabel)}`,
    `can_rate_models ${cell(record.can_rate_models)}`,
  ];
}

/** One Honesty A line. A missing count is NOT_CHECKED, not a blended score. */
export function honestyLine(body: unknown): string {
  if (!body || typeof body !== 'object') return 'honesty-a NOT_CHECKED';
  const record = body as Record<string, unknown>;
  if (record.status !== 'counted' || !Array.isArray(record.rows) || record.rows.length === 0) {
    return 'honesty-a NOT_CHECKED';
  }
  const row = record.rows[0];
  if (!row || typeof row !== 'object') return 'honesty-a NOT_CHECKED';
  const vote = row as Record<string, unknown>;
  if (typeof vote.family !== 'string' || typeof vote.host !== 'string') return 'honesty-a NOT_CHECKED';
  const truth = typeof vote.TRUE === 'number' ? vote.TRUE : 0;
  const fals = typeof vote.FALSE === 'number' ? vote.FALSE : 0;
  const missed = typeof vote.NOT_CHECKED === 'number' ? vote.NOT_CHECKED : 0;
  return `honesty-a ${vote.family} ${vote.host} TRUE ${truth} FALSE ${fals} NOT_CHECKED ${missed}`;
}

async function readJson(
  fetchImpl: typeof fetch,
  url: string,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { ok: false };
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false };
  }
}

export async function buildStatusReport(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<string> {
  if (opts.env.OFFLINE === '1') return NOT_CHECKED_LINES;
  const base = engineBase(opts.env);
  if (!base) return NOT_CHECKED_LINES;
  const [after, honesty] = await Promise.all([
    readJson(opts.fetchImpl, `${base}/api/v1/after-create`),
    readJson(opts.fetchImpl, `${base}/api/v1/hal/honesty-a`),
  ]);
  const lines = after.ok
    ? afterLines(after.body, saysStakeLive(opts.env))
    : NOT_CHECKED_LINES.split('\n').slice(0, 4);
  lines.push(honesty.ok ? honestyLine(honesty.body) : 'honesty-a NOT_CHECKED');
  return lines.join('\n');
}
