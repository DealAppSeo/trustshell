import { classifyVerdict, type ReceiptRow } from './hal-receipt';

/** No human-ratings table exists in this repo. Do not invent a count. */
export const HELP_B = 'no ratings';

export type ModelCardRow = {
  family: string;
  host: string;
  TRUE: number;
  FALSE: number;
  NOT_CHECKED: number;
  helpB: typeof HELP_B;
};

/** One row per family and host. UNCERTAIN is left out of A. It is not FALSE and not NOT_CHECKED. */
export function modelCardRows(rows: ReceiptRow[]): ModelCardRow[] {
  const groups = new Map<string, ModelCardRow>();
  for (const row of rows) {
    const key = `${row.family}\0${row.host}`;
    let card = groups.get(key);
    if (!card) {
      card = {
        family: row.family,
        host: row.host,
        TRUE: 0,
        FALSE: 0,
        NOT_CHECKED: 0,
        helpB: HELP_B,
      };
      groups.set(key, card);
    }
    const verdict = classifyVerdict(row.verdict);
    if (verdict === 'TRUE') card.TRUE += 1;
    else if (verdict === 'FALSE') card.FALSE += 1;
    else if (verdict === 'NOT_CHECKED') card.NOT_CHECKED += 1;
  }
  return [...groups.values()].sort((a, b) =>
    a.family === b.family ? a.host.localeCompare(b.host) : a.family.localeCompare(b.family),
  );
}
