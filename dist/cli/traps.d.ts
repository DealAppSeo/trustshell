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
export declare const TRAPS: readonly TrapClaim[];
export declare const TRAPS_DIR = ".trustshell";
export declare const TRAPS_RECEIPT_FILE = "traps.json";
/** Path to the local receipt store for a given working directory. */
export declare function trapsReceiptPath(cwd: string): string;
/** Load the receipt-id store, returning an empty map when it is missing or invalid. */
export declare function loadReceipts(cwd: string): Record<string, string>;
/** Receipt status for one trap. Missing or blank ids stay NOT_CHECKED, never a default id. */
export declare function trapStatus(receipts: Record<string, string>, slug: string): string;
/** Build the ten trap rows with their current receipt status. */
export declare function buildTrapsList(cwd: string): TrapRow[];
/** Render rows as plain text or JSON. */
export declare function formatTrapsList(rows: TrapRow[], json: boolean): string;
