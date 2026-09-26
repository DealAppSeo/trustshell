const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

const NOT_CHECKED_LINES = [
  'can_verify NOT_CHECKED',
  'can_bind NOT_CHECKED',
  'can_stake NOT_CHECKED',
  'can_rate_models NOT_CHECKED',
  'honesty-a NOT_CHECKED',
  'first-pass NOT_CHECKED',
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
  return `honesty-a ${vote.family} ${vote.host} TRUE ${countCell(vote.TRUE)} FALSE ${countCell(vote.FALSE)} NOT_CHECKED ${countCell(vote.NOT_CHECKED)}`;
}

function countCell(value: unknown): string {
  return typeof value === 'number' ? String(value) : 'NOT_CHECKED';
}

function passCounts(value: unknown): { TRUE: number; FALSE: number; NOT_CHECKED: number } | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.TRUE !== 'number' || typeof row.FALSE !== 'number' || typeof row.NOT_CHECKED !== 'number') {
    return null;
  }
  return { TRUE: row.TRUE, FALSE: row.FALSE, NOT_CHECKED: row.NOT_CHECKED };
}

function verdictWord(value: unknown): string {
  return value === 'TRUE' || value === 'FALSE' ? value : 'NOT_CHECKED';
}

/**
 * Print counted first_pass fields. A NOT_CHECKED body or a missing column is
 * NOT_CHECKED, not 0. post-HAL is printed only when post_hal_verdict is present.
 */
export function firstPassLines(body: unknown): string[] {
  if (!body || typeof body !== 'object') return ['first-pass NOT_CHECKED'];
  const record = body as Record<string, unknown>;
  const row =
    Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
      ? (record.rows[0] as Record<string, unknown>)
      : null;
  const lines: string[] = [];
  if (record.status !== 'counted') {
    lines.push('first-pass NOT_CHECKED');
  } else {
    const pass = passCounts(row?.first_pass) ?? passCounts(record.first_pass);
    const family = typeof row?.family === 'string' ? row.family : typeof record.family === 'string' ? record.family : '';
    const host = typeof row?.host === 'string' ? row.host : typeof record.host === 'string' ? record.host : '';
    lines.push(
      pass && family && host
        ? `first-pass ${family} ${host} TRUE ${pass.TRUE} FALSE ${pass.FALSE} NOT_CHECKED ${pass.NOT_CHECKED}`
        : 'first-pass NOT_CHECKED',
    );
  }
  const holder = row && Object.prototype.hasOwnProperty.call(row, 'post_hal_verdict') ? row : record;
  if (Object.prototype.hasOwnProperty.call(holder, 'post_hal_verdict')) {
    lines.push(`post-HAL ${verdictWord(holder.post_hal_verdict)}`);
  }
  return lines;
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
  lines.push(...(honesty.ok ? firstPassLines(honesty.body) : ['first-pass NOT_CHECKED']));
  return lines.join('\n');
}
