"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trustshellApiUrlSet = trustshellApiUrlSet;
exports.bindCell = bindCell;
exports.honestyLine = honestyLine;
exports.firstPassObject = firstPassObject;
exports.postHalValue = postHalValue;
exports.firstPassLines = firstPassLines;
exports.familyHostVerdictLine = familyHostVerdictLine;
exports.honestyRowsValue = honestyRowsValue;
exports.honestyRowsLine = honestyRowsLine;
exports.receiptIdToken = receiptIdToken;
exports.receiptHumanLine = receiptHumanLine;
exports.receiptWrittenValue = receiptWrittenValue;
exports.postHalReceipt = postHalReceipt;
exports.loadHonestyBody = loadHonestyBody;
exports.firstPassText = firstPassText;
exports.buildStatusReport = buildStatusReport;
exports.statusJsonFromText = statusJsonFromText;
const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';
const NOT_CHECKED_LINES = [
    'can_verify NOT_CHECKED',
    'can_bind NOT_CHECKED',
    'can_stake NOT_CHECKED',
    'can_rate_models NOT_CHECKED',
    'honesty-a NOT_CHECKED',
    'first-pass NOT_CHECKED',
].join('\n');
function engineBase(env) {
    if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL'))
        return DEFAULT_ENGINE;
    const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim();
    return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
}
/** True only when the caller set TRUSTSHELL_API_URL to a non-empty value. */
function trustshellApiUrlSet(env) {
    if (!Object.prototype.hasOwnProperty.call(env, 'TRUSTSHELL_API_URL'))
        return false;
    return (env.TRUSTSHELL_API_URL ?? '').trim().length > 0;
}
/** True only when SAYS_STAKE_LIVE is the exact string 'true'. */
function saysStakeLive(env) {
    return env.SAYS_STAKE_LIVE === 'true';
}
function cell(value) {
    if (value === true)
        return 'true';
    if (value === false)
        return 'false';
    return 'NOT_CHECKED';
}
function stakeCell(value, liveLabel) {
    if (value === true)
        return liveLabel ? 'live' : 'shadow — not live';
    if (value === false)
        return 'false';
    return 'NOT_CHECKED';
}
/** can_bind is true only when readiness exact_true.HUMAN_AGENT_BIND_ENABLED is boolean true. */
function bindCell(body) {
    if (!body || typeof body !== 'object')
        return 'NOT_CHECKED';
    const exact = body.exact_true;
    if (!exact || typeof exact !== 'object')
        return 'NOT_CHECKED';
    if (!Object.prototype.hasOwnProperty.call(exact, 'HUMAN_AGENT_BIND_ENABLED'))
        return 'NOT_CHECKED';
    return exact.HUMAN_AGENT_BIND_ENABLED === true ? 'true' : 'false';
}
function afterLines(body, liveLabel, bind) {
    const record = body && typeof body === 'object' ? body : {};
    return [
        `can_verify ${cell(record.can_verify)}`,
        `can_bind ${bind}`,
        `can_stake ${stakeCell(record.can_stake, liveLabel)}`,
        `can_rate_models ${cell(record.can_rate_models)}`,
    ];
}
/** One Honesty A line. A missing count is NOT_CHECKED, not a blended score. */
function honestyLine(body) {
    if (!body || typeof body !== 'object')
        return 'honesty-a NOT_CHECKED';
    const record = body;
    if (record.status !== 'counted' || !Array.isArray(record.rows) || record.rows.length === 0) {
        return 'honesty-a NOT_CHECKED';
    }
    const row = record.rows[0];
    if (!row || typeof row !== 'object')
        return 'honesty-a NOT_CHECKED';
    const vote = row;
    if (typeof vote.family !== 'string' || typeof vote.host !== 'string')
        return 'honesty-a NOT_CHECKED';
    return `honesty-a ${vote.family} ${vote.host} TRUE ${countCell(vote.TRUE)} FALSE ${countCell(vote.FALSE)} NOT_CHECKED ${countCell(vote.NOT_CHECKED)}`;
}
function countCell(value) {
    return typeof value === 'number' ? String(value) : 'NOT_CHECKED';
}
function passCounts(value) {
    if (!value || typeof value !== 'object')
        return null;
    const row = value;
    if (typeof row.TRUE !== 'number' || typeof row.FALSE !== 'number' || typeof row.NOT_CHECKED !== 'number') {
        return null;
    }
    return { TRUE: row.TRUE, FALSE: row.FALSE, NOT_CHECKED: row.NOT_CHECKED };
}
/** Counted first_pass for verify --json. Missing is omitted, never 0. */
function firstPassObject(body) {
    if (!body || typeof body !== 'object')
        return undefined;
    const record = body;
    if (record.status !== 'counted')
        return undefined;
    const row = Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
        ? record.rows[0]
        : null;
    const pass = passCounts(row?.first_pass) ?? passCounts(record.first_pass);
    if (!pass)
        return undefined;
    return { true: pass.TRUE, false: pass.FALSE, not_checked: pass.NOT_CHECKED };
}
/** verify --json post_hal. A missing column is omitted. A non-verdict is NOT_CHECKED, never 0. */
function postHalValue(body) {
    if (!body || typeof body !== 'object')
        return undefined;
    const record = body;
    const row = Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
        ? record.rows[0]
        : null;
    const holder = row && Object.prototype.hasOwnProperty.call(row, 'post_hal_verdict') ? row : record;
    if (!Object.prototype.hasOwnProperty.call(holder, 'post_hal_verdict'))
        return undefined;
    const word = verdictWord(holder.post_hal_verdict);
    return word === 'TRUE' || word === 'FALSE' ? word : 'NOT_CHECKED';
}
function verdictWord(value) {
    return value === 'TRUE' || value === 'FALSE' ? value : 'NOT_CHECKED';
}
/**
 * Print counted first_pass fields. A NOT_CHECKED body or a missing column is
 * NOT_CHECKED, not 0. post-HAL is printed only when post_hal_verdict is present.
 */
function firstPassLines(body) {
    if (!body || typeof body !== 'object')
        return ['first-pass NOT_CHECKED'];
    const record = body;
    const row = Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
        ? record.rows[0]
        : null;
    const lines = [];
    if (record.status !== 'counted') {
        lines.push('first-pass NOT_CHECKED');
    }
    else {
        const pass = passCounts(row?.first_pass) ?? passCounts(record.first_pass);
        const family = typeof row?.family === 'string' ? row.family : typeof record.family === 'string' ? record.family : '';
        const host = typeof row?.host === 'string' ? row.host : typeof record.host === 'string' ? record.host : '';
        lines.push(pass && family && host
            ? `first-pass ${family} ${host} TRUE ${pass.TRUE} FALSE ${pass.FALSE} NOT_CHECKED ${pass.NOT_CHECKED}`
            : 'first-pass NOT_CHECKED');
    }
    const holder = row && Object.prototype.hasOwnProperty.call(row, 'post_hal_verdict') ? row : record;
    if (Object.prototype.hasOwnProperty.call(holder, 'post_hal_verdict')) {
        lines.push(`post-HAL ${verdictWord(holder.post_hal_verdict)}`);
    }
    return lines;
}
function oneToken(value) {
    if (typeof value !== 'string')
        return '';
    const trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed))
        return '';
    return trimmed;
}
/** family, host, and this check's verdict. Missing or multi-word tokens are absent. */
function quorumReceipt(body, verdict) {
    if (!body || typeof body !== 'object')
        return null;
    const record = body;
    const row = Array.isArray(record.rows) && record.rows[0] && typeof record.rows[0] === 'object'
        ? record.rows[0]
        : null;
    const family = oneToken(row?.family) || oneToken(record.family);
    const host = oneToken(row?.host) || oneToken(record.host);
    if (!family || !host)
        return null;
    return { family, host, verdict };
}
/** One line after verify: family, host, and the verdict from this check. Missing columns are NOT_CHECKED. */
function familyHostVerdictLine(body, verdict) {
    const fields = quorumReceipt(body, verdict);
    if (!fields)
        return 'NOT_CHECKED';
    return `${fields.family} ${fields.host} ${fields.verdict}`;
}
/**
 * One extra line after verify. A counted body prints the real row count.
 * Timeout, non-200, or a missing status is NOT_CHECKED, never rows=0.
 */
/** verify --json row count. A missing status or rows array is omitted, never 0. */
function honestyRowsValue(body) {
    if (!body || typeof body !== 'object')
        return undefined;
    const record = body;
    if (record.status !== 'counted' || !Array.isArray(record.rows))
        return undefined;
    return record.rows.length;
}
function honestyRowsLine(body) {
    const missing = 'honesty-a rows=NOT_CHECKED status=NOT_CHECKED';
    if (!body || typeof body !== 'object')
        return missing;
    const record = body;
    if (record.status !== 'counted' || !Array.isArray(record.rows))
        return missing;
    return `honesty-a rows=${record.rows.length} status=counted`;
}
const NAMED_RECEIPT = new Set(['columns-missing', 'receipt-missing', 'insert-error']);
/** A receipt id from a response. Missing, blank, and 0 are NOT_CHECKED. */
function receiptIdToken(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0)
        return String(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed !== '0')
            return trimmed;
    }
    return 'NOT_CHECKED';
}
function halReceiptPost(status, parsed) {
    return { status, receiptId: receiptIdToken(parsed?.receipt_id) };
}
/** Human line for a receipt result. OFFLINE prints nothing. Missing is never 0. */
function receiptHumanLine(result) {
    if (result === 'skipped')
        return null;
    if (result === 'written')
        return 'receipt written';
    if (result === '204')
        return 'receipt 204';
    if (result === 'columns-missing')
        return 'receipt columns-missing';
    if (result === 'receipt-missing')
        return 'receipt receipt-missing';
    if (result === 'insert-error')
        return 'receipt insert-error';
    return 'receipt NOT_CHECKED';
}
/**
 * verify --json field. true when the receipt was written, false when the write
 * said it was not, NOT_CHECKED when the receipt is missing. Never 0.
 */
function receiptWrittenValue(result) {
    if (result === 'written' || result === '204')
        return true;
    if (result === 'unwritten' || result === 'insert-error')
        return false;
    return 'NOT_CHECKED';
}
function namedReceipt(parsed) {
    for (const key of ['code', 'error', 'reason', 'status']) {
        const value = parsed[key];
        if (typeof value === 'string' && NAMED_RECEIPT.has(value))
            return value;
    }
    return null;
}
/**
 * POST {family, host, verdict} after a live verify quorum.
 * OFFLINE skips. A body without family and host is columns-missing.
 * 404 or a receipt-missing token is receipt-missing. An insert-error token is insert-error.
 * Timeout or any other failure is NOT_CHECKED.
 */
async function postHalReceipt(opts) {
    if (opts.env.OFFLINE === '1')
        return halReceiptPost('skipped');
    const base = engineBase(opts.env);
    if (!base)
        return halReceiptPost('NOT_CHECKED');
    const fields = quorumReceipt(opts.body, opts.verdict);
    if (!fields) {
        return halReceiptPost(opts.body && typeof opts.body === 'object' ? 'columns-missing' : 'NOT_CHECKED');
    }
    try {
        const res = await opts.fetchImpl(`${base}/api/v1/hal/receipt`, {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify(fields),
            signal: AbortSignal.timeout(8000),
        });
        if (res.status === 204)
            return halReceiptPost('204');
        const raw = await res.text();
        let parsed = null;
        if (raw.trim()) {
            try {
                const body = JSON.parse(raw);
                parsed = body && typeof body === 'object' ? body : null;
                if (!parsed)
                    return halReceiptPost('NOT_CHECKED');
            }
            catch {
                return halReceiptPost('NOT_CHECKED');
            }
        }
        const named = parsed ? namedReceipt(parsed) : null;
        if (res.status === 200) {
            if (parsed?.written === false)
                return halReceiptPost(named ?? 'unwritten', parsed);
            return halReceiptPost('written', parsed);
        }
        if (named)
            return halReceiptPost(named, parsed);
        if (res.status === 404)
            return halReceiptPost('receipt-missing', parsed);
        return halReceiptPost('NOT_CHECKED', parsed);
    }
    catch {
        return halReceiptPost('NOT_CHECKED');
    }
}
async function readJson(fetchImpl, url) {
    try {
        const res = await fetchImpl(url, {
            signal: AbortSignal.timeout(8000),
            headers: { accept: 'application/json' },
        });
        if (!res.ok)
            return { ok: false };
        return { ok: true, body: await res.json() };
    }
    catch {
        return { ok: false };
    }
}
/** The honesty-a body, or null when the check cannot be counted. */
async function loadHonestyBody(opts) {
    if (opts.env.OFFLINE === '1')
        return null;
    const base = engineBase(opts.env);
    if (!base)
        return null;
    const honesty = await readJson(opts.fetchImpl, `${base}/api/v1/hal/honesty-a`);
    return honesty.ok ? honesty.body : null;
}
/** The first-pass lines from honesty-a. A missing column is NOT_CHECKED, never 0. */
async function firstPassText(opts) {
    const body = await loadHonestyBody(opts);
    return (body == null ? ['first-pass NOT_CHECKED'] : firstPassLines(body)).join('\n');
}
async function buildStatusReport(opts) {
    if (opts.env.OFFLINE === '1')
        return NOT_CHECKED_LINES;
    const base = engineBase(opts.env);
    if (!base)
        return NOT_CHECKED_LINES;
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
function statusJsonFromText(text) {
    const out = {};
    for (const line of text.split('\n')) {
        if (!line)
            continue;
        if (line.startsWith('first-pass ')) {
            const rest = line.slice('first-pass '.length);
            if (rest !== 'NOT_CHECKED')
                out.first_pass = rest;
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
        if (space > 0)
            out[line.slice(0, space)] = line.slice(space + 1);
    }
    return out;
}
