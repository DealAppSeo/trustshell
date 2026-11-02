"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256hex = exports.DEFAULT_AIRLOCK = exports.REFUSED_CLASSES = exports.HELD_CLASSES = void 0;
exports.nameProblem = nameProblem;
exports.classify = classify;
exports.canaryHit = canaryHit;
exports.inspectOutbox = inspectOutbox;
/**
 * Airlock: outbox -> quarantine. Deterministic inspection of what a sandbox worker left behind, done on
 * the trusted side AFTER the container is gone (so nothing can change a file while it is read).
 *
 * This is ordinary importer validation (the same family as zip-slip checks), not a malware scanner.
 * Each outbox entry is either QUARANTINED (a content-addressed, read-only copy: `<quarantine>/<sha256>`)
 * or REFUSED with reasons. Quarantine is not promotion: only `promote.ts`, with its own key, promotes.
 *
 * Refused: bad names (absolute, `..`, separators, control characters), symlinks, hardlinks, directories
 * (the outbox is flat), fifos/sockets/devices, oversize files, files with an executable bit (REFUSED, not
 * stripped), any file containing a registered canary, and any approval or policy the worker wrote about
 * itself. Tool configs and proposed memory are quarantined but HELD: the promoter never auto-promotes them.
 */
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Quarantined, but a human decides; never auto-promoted. */
exports.HELD_CLASSES = ['tool-config', 'memory'];
/** A worker may not hand itself an approval or a policy. Refused at the airlock and again at the gate. */
exports.REFUSED_CLASSES = ['approval', 'policy'];
exports.DEFAULT_AIRLOCK = { maxFileBytes: 1024 * 1024, maxFiles: 32 };
const sha256hex = (b) => (0, node_crypto_1.createHash)('sha256').update(b).digest('hex');
exports.sha256hex = sha256hex;
/** Why a name may not be imported, or null. Names come from the worker, so they are untrusted. */
function nameProblem(name) {
    if (name.length === 0 || name === '.' || name === '..')
        return 'empty or dot name';
    if (name.length > 255)
        return 'name longer than 255 characters';
    if (/[\u0000-\u001f\u007f]/.test(name))
        return 'control character in name';
    if (node_path_1.posix.isAbsolute(name) || node_path_1.win32.isAbsolute(name))
        return 'absolute path';
    if (name.split(/[\\/]/).includes('..'))
        return 'parent traversal (..)';
    if (/[\\/]/.test(name))
        return 'path separator in name (the outbox is flat)';
    return null;
}
const APPROVAL_KEYS = ['approved', 'approval', 'approved_by', 'approver', 'approvals'];
const POLICY_KEYS = ['policy', 'allow', 'allowlist', 'permissions', 'grants'];
/**
 * What a file claims to be. ponytail: name patterns plus top-level JSON keys; a renamed approval passes
 * as an artifact here. That is defence in depth only: the promoter never takes an approval from the outbox.
 */
function classify(name, body) {
    const n = name.toLowerCase();
    let keys = [];
    try {
        const v = JSON.parse(body.toString('utf8'));
        if (v && typeof v === 'object' && !Array.isArray(v))
            keys = Object.keys(v).map((k) => k.toLowerCase());
    }
    catch {
        keys = [];
    }
    if (/approv|sign-?off/.test(n) || keys.some((k) => APPROVAL_KEYS.includes(k)))
        return 'approval';
    if (/polic|allowlist|permission|grant/.test(n) || keys.some((k) => POLICY_KEYS.includes(k)))
        return 'policy';
    if (/memor|^claude\.md$|^agents\.md$/.test(n))
        return 'memory';
    if (n.startsWith('.') || /(^|[._-])(mcp|tools?|settings|config|hooks?)([._-]|$)/.test(n) || /\.(toml|ini|ya?ml|env)$/.test(n))
        return 'tool-config';
    return 'artifact';
}
/** Index of the first registered canary the bytes contain, or -1. Literal match only. */
function canaryHit(body, canaries) {
    return canaries.findIndex((c) => c.length > 0 && body.includes(Buffer.from(c, 'utf8')));
}
function sniff(b) {
    if (b.includes(0))
        return 'binary';
    let s;
    try {
        s = new TextDecoder('utf-8', { fatal: true }).decode(b);
    }
    catch {
        return 'binary';
    }
    try {
        JSON.parse(s);
        return 'json';
    }
    catch {
        return 'text';
    }
}
/** Open without following a link and without blocking on a fifo; every decision uses fstat of what was opened. */
function openRead(path, max) {
    const fd = (0, node_fs_1.openSync)(path, node_fs_1.constants.O_RDONLY | (node_fs_1.constants.O_NOFOLLOW ?? 0) | (node_fs_1.constants.O_NONBLOCK ?? 0));
    try {
        const st = (0, node_fs_1.fstatSync)(fd);
        if (!st.isFile() || st.size > max)
            return { buf: Buffer.alloc(0), isFile: st.isFile(), size: st.size, nlink: st.nlink, mode: st.mode };
        const buf = Buffer.alloc(st.size);
        let off = 0;
        while (off < buf.length) {
            const n = (0, node_fs_1.readSync)(fd, buf, off, buf.length - off, off);
            if (n === 0)
                break;
            off += n;
        }
        return { buf: buf.subarray(0, off), isFile: true, size: st.size, nlink: st.nlink, mode: st.mode };
    }
    finally {
        (0, node_fs_1.closeSync)(fd);
    }
}
function inspectOne(outbox, quarantine, name, index, o) {
    const c = { name, class: 'artifact', size: null, sha256: null, type: null, status: 'refused', reasons: [] };
    const refuse = (why) => {
        c.reasons.push(why);
        return c;
    };
    if (index >= o.maxFiles)
        return refuse(`more than ${o.maxFiles} entries in the outbox`);
    const bad = nameProblem(name);
    if (bad)
        return refuse(bad);
    const p = (0, node_path_1.join)(outbox, name);
    const l = (0, node_fs_1.lstatSync)(p);
    if (l.isSymbolicLink())
        return refuse('symlink');
    if (l.isDirectory())
        return refuse('directory (the outbox is flat)');
    if (!l.isFile())
        return refuse('special file (fifo, socket or device)');
    let r;
    try {
        r = openRead(p, o.maxFileBytes);
    }
    catch (e) {
        return refuse(`could not open safely (${String(e.code ?? e)})`);
    }
    c.size = r.size;
    if (!r.isFile)
        return refuse('special file (fifo, socket or device)');
    if (r.nlink > 1)
        return refuse('hardlink (the same file has more than one name)');
    if (r.size > o.maxFileBytes)
        return refuse(`oversize: ${r.size} bytes, limit ${o.maxFileBytes}`);
    c.sha256 = (0, exports.sha256hex)(r.buf);
    c.type = sniff(r.buf);
    c.class = classify(name, r.buf);
    if (process.platform !== 'win32' && (r.mode & 0o111) !== 0)
        return refuse('executable bit set (refused, not stripped)');
    const hit = canaryHit(r.buf, o.canaries);
    if (hit >= 0)
        return refuse(`contains registered canary #${hit}`);
    if (exports.REFUSED_CLASSES.includes(c.class))
        return refuse(`worker-written ${c.class} about itself`);
    const q = (0, node_path_1.join)(quarantine, c.sha256);
    try {
        (0, node_fs_1.writeFileSync)(q, r.buf, { flag: 'wx', mode: 0o444 });
    }
    catch (e) {
        if (e.code !== 'EEXIST' || (0, exports.sha256hex)((0, node_fs_1.readFileSync)(q)) !== c.sha256) {
            return refuse(`quarantine write failed (${String(e.code ?? e)})`);
        }
    }
    c.status = 'quarantined';
    if (exports.HELD_CLASSES.includes(c.class))
        c.reasons.push(`held: ${c.class} is never auto-promoted`);
    return c;
}
/** Inspect every entry of a flat outbox, in name order. Never throws for one bad entry; it is refused instead. */
function inspectOutbox(outbox, quarantine, o) {
    (0, node_fs_1.mkdirSync)(quarantine, { recursive: true, mode: 0o700 });
    return (0, node_fs_1.readdirSync)(outbox)
        .sort()
        .map((name, i) => {
        try {
            return inspectOne(outbox, quarantine, name, i, o);
        }
        catch (e) {
            return { name, class: 'artifact', size: null, sha256: null, type: null, status: 'refused', reasons: [`inspection error (${String(e.code ?? e)})`] };
        }
    });
}
