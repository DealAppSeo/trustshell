"use strict";
/**
 * `trustshell inspect` — verify an append-only tool-call log.
 * -----------------------------------------------------------
 * `check` answers "did it really pass?" from OUTSIDE evidence — what GitHub can
 * confirm. `inspect` answers it from INSIDE evidence — what the agent actually
 * did. Neither can do the other's job.
 *
 * EGRESS: none. This reads a local file and computes hashes. It opens no socket,
 * needs no account and no key.
 *
 * WHY A CHAIN. Each line's `prev` is the previous line's `hash`, so removing or
 * editing any line breaks every line after it. An unchained log proves only that
 * somebody wrote a file.
 *
 * OUTPUTS ARE HASHED, NEVER STORED. `output_sha256` only, mirroring the org's
 * existing `tool_call_log`. A local audit log that quietly accumulates verbatim
 * command output is a secret leak waiting to happen; a hash still proves the
 * output has not changed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalBytes = canonicalBytes;
exports.entryHash = entryHash;
exports.inspectLimits = inspectLimits;
exports.verifyChain = verifyChain;
exports.nextEntry = nextEntry;
exports.readClaudeCode = readClaudeCode;
exports.inspectExitCode = inspectExitCode;
exports.noLog = noLog;
exports.formatInspectCard = formatInspectCard;
const node_crypto_1 = require("node:crypto");
/**
 * The canonical bytes a line's `hash` covers. Field ORDER is part of the
 * contract — a JSON object whose keys were serialised in a different order
 * hashes differently, so this builds the string explicitly rather than calling
 * JSON.stringify on a record and hoping key order is stable.
 */
function canonicalBytes(e) {
    return JSON.stringify([
        e.seq,
        e.ts,
        e.tool,
        e.input_sha256,
        e.output_sha256,
        e.prev,
    ]);
}
/** PURE. The hash a well-formed entry must carry. */
function entryHash(e) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalBytes(e), 'utf8').digest('hex');
}
/** The sentences an `inspect` card refuses to let a reader forget. */
function inspectLimits(verdict) {
    const always = [
        'That a tool call is logged does not mean it did what its name suggests — this checks the record, not the work.',
        'Outputs are stored as hashes, so this can prove an output is unchanged but cannot show you what it was.',
    ];
    if (verdict === 'INTACT') {
        return [
            ...always,
            // THIS SENTENCE USED TO CLAIM MORE THAN THE CHAIN CAN CARRY. It said an
            // intact chain "proves no line was altered or removed AFTER it was
            // written". It does not: `entryHash` is an UNKEYED sha256 with no secret,
            // no signature and no anchor outside the file, so anyone who can write the
            // log can re-derive every line and a wholly fabricated log verifies INTACT.
            // Overclaiming in the tool whose whole thesis is honest limits is the
            // failure it exists to catch.
            'This chain has NO trusted anchor — the hashes are unkeyed and reproducible by anyone who can write the file, so INTACT does not rule out a log that was fabricated or rewritten wholesale. It detects edits and deletions that left the later hashes untouched, and nothing more.',
            'It does not prove the log was complete when written — a recorder that never logged a call leaves no gap to find.',
        ];
    }
    if (verdict === 'UNCHAINED') {
        return [
            ...always,
            'This log carries no chain, so nothing here is evidence of integrity. UNCHAINED is NOT CHECKED — it is not a pass.',
        ];
    }
    if (verdict === 'NO_LOG') {
        return [
            'No log, or a log with no entries — so nothing was checked. This is not a clean result; it is an absent one.',
            'A file that exists but is empty lands here too. Zero entries cannot be INTACT: there is nothing for a chain to be intact ABOUT.',
        ];
    }
    return [
        ...always,
        'A broken chain shows the file was altered after writing. It does not show WHO altered it, or whether the change was malicious or a crash.',
    ];
}
/**
 * PURE. Verify the native format from raw file text.
 *
 * `seq` and `prev` are both read from the PRECEDING LINE — there is no counter
 * held in memory across the walk and no sidecar file. The log IS the state. A
 * sidecar counter is a second thing that can disagree with the log, which is the
 * exact defect this product is about.
 */
function verifyChain(text, path) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const breaks = [];
    const tools = new Map();
    let first = null;
    let last = null;
    let prevHash = null;
    let prevSeq = null;
    lines.forEach((raw, i) => {
        const lineNo = i + 1;
        let e;
        try {
            e = JSON.parse(raw);
        }
        catch {
            breaks.push({ line: lineNo, seq: null, reason: 'not valid JSON' });
            return;
        }
        if (typeof e.seq !== 'number' || typeof e.hash !== 'string' || typeof e.tool !== 'string') {
            breaks.push({ line: lineNo, seq: null, reason: 'missing required fields (seq, tool, hash)' });
            return;
        }
        const expectedSeq = prevSeq === null ? 1 : prevSeq + 1;
        if (e.seq !== expectedSeq) {
            breaks.push({ line: lineNo, seq: e.seq, reason: `seq ${e.seq} where ${expectedSeq} was expected` });
        }
        if (e.prev !== prevHash) {
            breaks.push({
                line: lineNo,
                seq: e.seq,
                reason: prevHash === null
                    ? `prev is ${JSON.stringify(e.prev)} on the first line, where null was expected`
                    : 'prev does not match the previous line\'s hash — a line was altered or removed',
            });
        }
        const recomputed = entryHash({
            seq: e.seq,
            ts: e.ts,
            tool: e.tool,
            input_sha256: e.input_sha256,
            output_sha256: e.output_sha256,
            prev: e.prev,
        });
        if (recomputed !== e.hash) {
            breaks.push({ line: lineNo, seq: e.seq, reason: 'hash does not match the line\'s own contents' });
        }
        tools.set(e.tool, (tools.get(e.tool) ?? 0) + 1);
        if (first === null)
            first = e.ts ?? null;
        last = e.ts ?? null;
        prevHash = e.hash;
        prevSeq = e.seq;
    });
    // A log with NO ENTRIES has no chain breaks, so `breaks.length === 0` is
    // vacuously true and the old code called it INTACT — exit 0, and `report` then
    // read it as CONFIRMED. A recorder that initialised and never wrote, or a
    // truncated file, was a verified pass. That is the exact contract this command
    // exists to hold ("exit 3 means NOT CHECKED, and is never 0") broken by the
    // command itself. Zero entries is NOT CHECKED.
    const verdict = breaks.length > 0 ? 'BROKEN' : lines.length === 0 ? 'NO_LOG' : 'INTACT';
    return {
        verdict,
        format: 'trustshell',
        path,
        entries: lines.length,
        first_ts: first,
        last_ts: last,
        tools: [...tools.entries()].map(([tool, calls]) => ({ tool, calls })).sort((a, b) => b.calls - a.calls),
        breaks,
        does_not_prove: inspectLimits(verdict),
    };
}
/**
 * The next line to append, derived from the file's own last line. ONE read gives
 * both `seq` and `prev`. Returns the entry; the caller writes it.
 */
function nextEntry(text, fields) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const lastRaw = lines[lines.length - 1];
    let seq = 1;
    let prev = null;
    if (lastRaw !== undefined) {
        const lastEntry = JSON.parse(lastRaw);
        seq = lastEntry.seq + 1;
        prev = lastEntry.hash;
    }
    const base = { seq, ts: fields.ts, tool: fields.tool, input_sha256: fields.input_sha256, output_sha256: fields.output_sha256, prev };
    return { ...base, hash: entryHash(base) };
}
/**
 * PURE. Read a foreign log through an adapter.
 *
 * ALWAYS UNCHAINED. A log we did not chain proves nothing about its own
 * integrity, however well-formed it looks. The adapter can report what the
 * transcript SAYS happened; it cannot report INTACT, and pretending otherwise
 * would turn a summary into a false attestation.
 *
 * `--from symphony` is deliberately absent: that logger writes to Postgres, so
 * pointing `inspect` at it would make a local, no-account, no-egress command
 * open a database connection.
 */
function readClaudeCode(text, path) {
    const tools = new Map();
    let first = null;
    let last = null;
    let entries = 0;
    for (const raw of text.split(/\r?\n/)) {
        if (raw.trim() === '')
            continue;
        let rec;
        try {
            rec = JSON.parse(raw);
        }
        catch {
            continue;
        }
        const content = rec?.message?.content;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            if (block?.type !== 'tool_use' || typeof block?.name !== 'string')
                continue;
            entries += 1;
            tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
            const ts = typeof rec.timestamp === 'string' ? rec.timestamp : null;
            if (ts) {
                if (first === null)
                    first = ts;
                last = ts;
            }
        }
    }
    return {
        verdict: 'UNCHAINED',
        format: 'claude-code',
        path,
        entries,
        first_ts: first,
        last_ts: last,
        tools: [...tools.entries()].map(([tool, calls]) => ({ tool, calls })).sort((a, b) => b.calls - a.calls),
        breaks: [],
        does_not_prove: inspectLimits('UNCHAINED'),
    };
}
/** INTACT 0 · BROKEN 1 · UNCHAINED and NO_LOG 3, because 3 means NOT CHECKED. */
function inspectExitCode(v) {
    if (v === 'INTACT')
        return 0;
    if (v === 'BROKEN')
        return 1;
    return 3;
}
function noLog(path) {
    return {
        verdict: 'NO_LOG',
        format: 'trustshell',
        path,
        entries: 0,
        first_ts: null,
        last_ts: null,
        tools: [],
        breaks: [],
        does_not_prove: inspectLimits('NO_LOG'),
    };
}
function formatInspectCard(r) {
    const lines = [`trustshell inspect  —  ${r.verdict}`, ''];
    lines.push(`  log      ${r.path}`);
    lines.push(`  format   ${r.format}`);
    lines.push(`  entries  ${r.entries}`);
    if (r.first_ts && r.last_ts)
        lines.push(`  window   ${r.first_ts} → ${r.last_ts}`);
    if (r.tools.length) {
        lines.push('', '  tools');
        for (const t of r.tools)
            lines.push(`    ${String(t.calls).padStart(5)}  ${t.tool}`);
    }
    if (r.breaks.length) {
        lines.push('', '  chain breaks');
        for (const b of r.breaks)
            lines.push(`    line ${b.line}${b.seq !== null ? ` (seq ${b.seq})` : ''}: ${b.reason}`);
    }
    lines.push('', '  What this does NOT prove:');
    for (const d of r.does_not_prove)
        lines.push(`    - ${d}`);
    return lines.join('\n');
}
