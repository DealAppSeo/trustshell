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

/** True only when the caller set TRUSTSHELL_API_URL to a non-empty value. */
export function trustshellApiUrlSet(env: NodeJS.ProcessEnv): boolean {
  if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL')) return false;
  return (env.TRUSTSHELL_API_URL ?? '').trim().length > 0;
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

/** can_bind is true only when readiness exact_true.HUMAN_AGENT_BIND_ENABLED is boolean true. */
export function bindCell(body: unknown): string {
  if (!body || typeof body !== 'object') return 'NOT_CHECKED';
  const exact = (body as Record<string, unknown>).exact_true;
  if (!exact || typeof exact !== 'object') return 'NOT_CHECKED';
  if (!Object.prototype.hasOwnProperty.call(exact, 'HUMAN_AGENT_BIND_ENABLED')) return 'NOT_CHECKED';
  return (exact as Record<string, unknown>).HUMAN_AGENT_BIND_ENABLED === true ? 'true' : 'false';
}

function afterLines(body: unknown, liveLabel: boolean, bind: string): string[] {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return [
    `can_verify ${cell(record.can_verify)}`,
    `can_bind ${bind}`,
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

function oneToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return '';
  return trimmed;
}

type HalVerdict = 'PASS' | 'FLAG' | 'VETO';

/** family, host, and this check's verdict. Missing or multi-word tokens are absent. */
function quorumReceipt(body: unknown, verdict: HalVerdict): { family: string; host: string; verdict: HalVerdict } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const row =
    Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
      ? (record.rows[0] as Record<string, unknown>)
      : null;
  const family = oneToken(row?.family) || oneToken(record.family);
  const host = oneToken(row?.host) || oneToken(record.host);
  if (!family || !host) return null;
  return { family, host, verdict };
}

/** One line after verify: family, host, and the verdict from this check. Missing columns are NOT_CHECKED. */
export function familyHostVerdictLine(body: unknown, verdict: HalVerdict): string {
  const fields = quorumReceipt(body, verdict);
  if (!fields) return 'NOT_CHECKED';
  return `${fields.family} ${fields.host} ${fields.verdict}`;
}

/**
 * One extra line after verify. A counted body prints the real row count.
 * Timeout, non-200, or a missing status is NOT_CHECKED, never rows=0.
 */
export function honestyRowsLine(body: unknown): string {
  const missing = 'honesty-a rows=NOT_CHECKED status=NOT_CHECKED';
  if (!body || typeof body !== 'object') return missing;
  const record = body as Record<string, unknown>;
  if (record.status !== 'counted' || !Array.isArray(record.rows)) return missing;
  return `honesty-a rows=${record.rows.length} status=counted`;
}

/**
 * POST {family, host, verdict} after a live verify quorum.
 * OFFLINE skips. Timeout or a status other than 200 or 204 is NOT_CHECKED.
 */
export async function postHalReceipt(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  body: unknown;
  verdict: HalVerdict;
}): Promise<'skipped' | 'written' | 'NOT_CHECKED'> {
  if (opts.env.OFFLINE === '1') return 'skipped';
  const fields = quorumReceipt(opts.body, opts.verdict);
  const base = engineBase(opts.env);
  if (!base || !fields) return 'NOT_CHECKED';
  try {
    const res = await opts.fetchImpl(`${base}/api/v1/hal/receipt`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 204) return 'written';
    if (res.status !== 200) return 'NOT_CHECKED';
    const raw = await res.text();
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as { written?: unknown };
        if (parsed.written === false) return 'NOT_CHECKED';
      } catch {
        return 'NOT_CHECKED';
      }
    }
    return 'written';
  } catch {
    return 'NOT_CHECKED';
  }
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

/** The honesty-a body, or null when the check cannot be counted. */
export async function loadHonestyBody(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<unknown | null> {
  if (opts.env.OFFLINE === '1') return null;
  const base = engineBase(opts.env);
  if (!base) return null;
  const honesty = await readJson(opts.fetchImpl, `${base}/api/v1/hal/honesty-a`);
  return honesty.ok ? honesty.body : null;
}

/** The first-pass lines from honesty-a. A missing column is NOT_CHECKED, never 0. */
export async function firstPassText(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const body = await loadHonestyBody(opts);
  return (body == null ? ['first-pass NOT_CHECKED'] : firstPassLines(body)).join('\n');
}

export async function buildStatusReport(opts: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<string> {
  if (opts.env.OFFLINE === '1') return NOT_CHECKED_LINES;
  const base = engineBase(opts.env);
  if (!base) return NOT_CHECKED_LINES;
  const [after, honesty, readiness] = await Promise.all([
    readJson(opts.fetchImpl, `${base}/api/v1/after-create`),
    readJson(opts.fetchImpl, `${base}/api/v1/hal/honesty-a`),
    readJson(opts.fetchImpl, `${base}/readiness`),
  ]);
  const bind = readiness.ok ? bindCell(readiness.body) : 'NOT_CHECKED';
  const lines = after.ok
    ? afterLines(after.body, saysStakeLive(opts.env), bind)
    : ['can_verify NOT_CHECKED', `can_bind ${bind}`, 'can_stake NOT_CHECKED', 'can_rate_models NOT_CHECKED'];
  lines.push(honesty.ok ? honestyLine(honesty.body) : 'honesty-a NOT_CHECKED');
  lines.push(...(honesty.ok ? firstPassLines(honesty.body) : ['first-pass NOT_CHECKED']));
  return lines.join('\n');
}

/** JSON view of the human status lines. A missing first_pass is omitted, never 0. */
export function statusJsonFromText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('first-pass ')) {
      const rest = line.slice('first-pass '.length);
      if (rest !== 'NOT_CHECKED') out.first_pass = rest;
      continue;
    }
    if (line.startsWith('post-HAL ')) {
      out.post_hal = line.slice('post-HAL '.length);
      continue;
    }
    if (line.startsWith('honesty-a ')) {
      out.honesty_a = line.slice('honesty-a '.length);
      continue;
    }
    const space = line.indexOf(' ');
    if (space > 0) out[line.slice(0, space)] = line.slice(space + 1);
  }
  return out;
}
