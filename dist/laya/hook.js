"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.layaHook = layaHook;
exports.layaRecords = layaRecords;
const rows = [];
const allowed = new Set(['cheap', 'escalate', 'ask']);
function layaHook(classify) {
    if (!allowed.has(classify))
        throw new Error('classify must be cheap, escalate, or ask');
    rows.push({ classify });
    if (classify === 'cheap')
        return { action: 'recall', source: 'local' };
    return { classify };
}
function layaRecords() {
    return rows.slice();
}
