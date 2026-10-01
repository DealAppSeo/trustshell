import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import trapsFixture from './traps-fixture.json';

export interface TrapClaim {
  slug: string;
  title: string;
  claim: string;
}

export interface TrapRow {
  slug: string;
  title: string;
  claim: string;
  status: string;
  receipt_id?: string;
}

export interface TrapReceiptStore {
  receipts?: Record<string, string>;
}

/** The ten fixture HAL claims shipped in-repo. */
export const TRAPS: readonly TrapClaim[] = trapsFixture;

export const TRAPS_DIR = '.trustshell';
export const TRAPS_RECEIPT_FILE = 'traps.json';

/** Path to the local receipt store for a given working directory. */
export function trapsReceiptPath(cwd: string): string {
  return join(cwd, TRAPS_DIR, TRAPS_RECEIPT_FILE);
}

/** Load the receipt-id store, returning an empty map when it is missing or invalid. */
export function loadReceipts(cwd: string): Record<string, string> {
  const path = trapsReceiptPath(cwd);
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as TrapReceiptStore;
    return data.receipts ?? {};
  } catch {
    return {};
  }
}

/** Receipt status for one trap. Missing or blank ids stay NOT_CHECKED, never a default id. */
export function trapStatus(receipts: Record<string, string>, slug: string): string {
  const id = receipts[slug];
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : 'NOT_CHECKED';
}

/** Build the ten trap rows with their current receipt status. */
export function buildTrapsList(cwd: string): TrapRow[] {
  const receipts = loadReceipts(cwd);
  return TRAPS.map((trap) => {
    const status = trapStatus(receipts, trap.slug);
    const row: TrapRow = { ...trap, status };
    if (status !== 'NOT_CHECKED') row.receipt_id = status;
    return row;
  });
}

/** Render rows as plain text or JSON. */
export function formatTrapsList(rows: TrapRow[], json: boolean): string {
  if (json) return JSON.stringify(rows, null, 2);
  return rows.map((row) => `${row.slug} ${row.status}`).join('\n');
}
