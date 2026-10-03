"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRAPS_RECEIPT_FILE = exports.TRAPS_DIR = exports.TRAPS = void 0;
exports.trapsReceiptPath = trapsReceiptPath;
exports.loadReceipts = loadReceipts;
exports.trapStatus = trapStatus;
exports.buildTrapsList = buildTrapsList;
exports.formatTrapsList = formatTrapsList;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const traps_fixture_json_1 = __importDefault(require("./traps-fixture.json"));
/** The ten fixture HAL claims shipped in-repo. */
exports.TRAPS = traps_fixture_json_1.default;
exports.TRAPS_DIR = '.trustshell';
exports.TRAPS_RECEIPT_FILE = 'traps.json';
/** Path to the local receipt store for a given working directory. */
function trapsReceiptPath(cwd) {
    return (0, node_path_1.join)(cwd, exports.TRAPS_DIR, exports.TRAPS_RECEIPT_FILE);
}
/** Load the receipt-id store, returning an empty map when it is missing or invalid. */
function loadReceipts(cwd) {
    const path = trapsReceiptPath(cwd);
    if (!(0, node_fs_1.existsSync)(path))
        return {};
    try {
        const data = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return data.receipts ?? {};
    }
    catch {
        return {};
    }
}
/** Receipt status for one trap. Missing or blank ids stay NOT_CHECKED, never a default id. */
function trapStatus(receipts, slug) {
    const id = receipts[slug];
    return typeof id === 'string' && id.trim().length > 0 ? id.trim() : 'NOT_CHECKED';
}
/** Build the ten trap rows with their current receipt status. */
function buildTrapsList(cwd) {
    const receipts = loadReceipts(cwd);
    return exports.TRAPS.map((trap) => {
        const status = trapStatus(receipts, trap.slug);
        const row = { ...trap, status };
        if (status !== 'NOT_CHECKED')
            row.receipt_id = status;
        return row;
    });
}
/** Render rows as plain text or JSON. */
function formatTrapsList(rows, json) {
    if (json)
        return JSON.stringify(rows, null, 2);
    return rows.map((row) => `${row.slug} ${row.status}`).join('\n');
}
