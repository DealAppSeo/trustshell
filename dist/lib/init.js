"use strict";
/**
 * `trustshell init` — create `.trustshell/` and a blank profile.
 * --------------------------------------------------------------
 * EGRESS: none. No account, no key, no telemetry, no socket. This is the first
 * command a sceptic runs, and it has to be the easiest one to audit: it writes
 * one file, in one directory, containing nothing it did not ask you for.
 *
 * It NEVER overwrites without `--force`, because the file it would clobber is
 * the one holding your trust settings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_FILE = exports.TRUSTSHELL_DIR = void 0;
exports.stillManual = stillManual;
exports.runInit = runInit;
exports.initExitCode = initExitCode;
exports.formatInitCard = formatInitCard;
const profile_1 = require("./profile");
exports.TRUSTSHELL_DIR = '.trustshell';
exports.PROFILE_FILE = 'profile.md';
/**
 * The seam that is NOT designed, named out loud rather than faked.
 *
 * `init` should be able to register the recorder with the OpenClaw shell, but
 * that plugin is not in this repository and its interface is unknown. Inventing
 * one here would produce a command that claims to have wired something up and
 * has not — the exact failure this product exists to catch. So it says so.
 */
function stillManual() {
    return [
        'Nothing writes .trustshell/session.jsonl yet. `inspect` will report NO_LOG until a recorder appends to it.',
        'The OpenClaw plugin seam is not implemented — its interface is not in this repository, so init cannot register a recorder.',
        'Both share flags are false. `report` will withhold identity and context until you set them yourself.',
    ];
}
/** Join without importing `path`, so this stays trivially portable and pure-ish. */
function joinPath(...parts) {
    return parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');
}
/**
 * Create the directory and profile. Returns what it did — it does not print, and
 * it does not exit. The caller decides how to render and what code to exit with.
 */
function runInit(fs, opts = {}) {
    const cwd = opts.cwd ?? '.';
    const dir = joinPath(cwd, exports.TRUSTSHELL_DIR);
    const path = joinPath(dir, exports.PROFILE_FILE);
    const already = fs.exists(path);
    if (already && !opts.force) {
        // Not an error. The profile exists and holds settings; refusing to touch it
        // is the correct outcome, and exit 0 says "nothing to do", not "failed".
        return { outcome: 'EXISTS', dir, path, still_manual: stillManual() };
    }
    fs.mkdirp(dir);
    const body = (0, profile_1.renderProfile)(opts.profile ?? (0, profile_1.defaultProfile)());
    fs.writeFile(path, body);
    return {
        outcome: already ? 'OVERWRITTEN' : 'CREATED',
        dir,
        path,
        bytes: Buffer.byteLength(body, 'utf8'),
        still_manual: stillManual(),
    };
}
/** Exit code. EXISTS is 0 — "already done" is not a failure. */
function initExitCode(outcome) {
    return outcome === 'CREATED' || outcome === 'EXISTS' || outcome === 'OVERWRITTEN' ? 0 : 1;
}
function formatInitCard(r) {
    const head = r.outcome === 'CREATED'
        ? `created  ${r.path}`
        : r.outcome === 'OVERWRITTEN'
            ? `overwritten  ${r.path}  (--force)`
            : `already exists  ${r.path}  — left untouched (use --force to replace)`;
    const lines = [
        'trustshell init',
        '',
        `  ${head}`,
        '',
        '  no network  ·  no account  ·  nothing collected',
        '',
        '  Still manual:',
        ...r.still_manual.map((s) => `    - ${s}`),
    ];
    return lines.join('\n');
}
