import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReceiptRow } from './hal-receipt';
import { modelCardRows } from './model-card';

export const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';
export const NO_RATINGS = 'no ratings';

export type HonestyCardRow = {
  family: string;
  host: string;
  TRUE: number;
  FALSE: number;
  NOT_CHECKED: number;
  helpB: string;
};

export type HonestyCard = {
  source: 'counted' | 'FIXTURE';
  rows: HonestyCardRow[];
  /** First-pass family votes and the post-HAL verdict, or NOT_CHECKED. */
  columns: string;
};

type VoteColumn = { family: string; host: string; verdict: string };

function voteColumn(value: unknown): VoteColumn[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: VoteColumn[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.family !== 'string' || typeof row.host !== 'string' || typeof row.verdict !== 'string') {
      return null;
    }
    rows.push({ family: row.family, host: row.host, verdict: row.verdict });
  }
  return rows;
}

function formatColumn(label: string, rows: VoteColumn[]): string {
  return `${label} ${rows.map((row) => `${row.family} ${row.host} ${row.verdict}`).join(', ')}`;
}

/**
 * First-pass family votes and the post-HAL verdict are different columns when the
 * engine exposes both. Otherwise this is NOT_CHECKED. It does not fold TRUE, FALSE,
 * and NOT_CHECKED into one another.
 */
export function exposedColumns(body: unknown): string {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const first = voteColumn(record.first_pass);
  const post = voteColumn(record.post_hal);
  if (!first || !post) return 'NOT_CHECKED';
  return `${formatColumn('first-pass', first)}. ${formatColumn('post-HAL', post)}.`;
}

export function engineBase(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL')) return DEFAULT_ENGINE;
  const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
}

/** n>=1 is a count. Anything else stays the words "no ratings". */
export function helpBLabel(n: unknown): string {
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) return String(n);
  return NO_RATINGS;
}

export function cardFromPayload(body: unknown): HonestyCard | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.status !== 'counted' || !Array.isArray(record.rows)) return null;
  const rows: HonestyCardRow[] = [];
  for (const raw of record.rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.family !== 'string' || typeof row.host !== 'string') continue;
    rows.push({
      family: row.family,
      host: row.host,
      TRUE: typeof row.TRUE === 'number' ? row.TRUE : 0,
      FALSE: typeof row.FALSE === 'number' ? row.FALSE : 0,
      NOT_CHECKED: typeof row.NOT_CHECKED === 'number' ? row.NOT_CHECKED : 0,
      helpB: helpBLabel(row.n),
    });
  }
  if (rows.length === 0) return null;
  return { source: 'counted', rows, columns: exposedColumns(body) };
}

export function fixtureCard(): HonestyCard {
  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures/hal-last-week.fixture.json'), 'utf8'),
  ) as { rows: ReceiptRow[] };
  return {
    source: 'FIXTURE',
    rows: modelCardRows(fixture.rows).map((row) => ({
      family: row.family,
      host: row.host,
      TRUE: row.TRUE,
      FALSE: row.FALSE,
      NOT_CHECKED: row.NOT_CHECKED,
      helpB: NO_RATINGS,
    })),
    columns: exposedColumns(fixture),
  };
}

export async function loadHonestyCard(opts: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<HonestyCard> {
  const base = engineBase(opts.env ?? process.env);
  if (!base) return fixtureCard();
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${base}/api/v1/hal/honesty-a`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return fixtureCard();
    return cardFromPayload(await res.json()) ?? fixtureCard();
  } catch {
    return fixtureCard();
  }
}
