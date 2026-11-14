"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDefaultHome = isDefaultHome;
exports.ownerOnly = ownerOnly;
exports.tryOwnerOnly = tryOwnerOnly;
exports.__resetOwnerOnlyCache = __resetOwnerOnlyCache;
/**
 * Limit a TrustShell file or folder to this user: the install signing key, and the TrustShell home folder
 * that holds it with the memory, the owner policy and the guard receipts.
 *
 * POSIX: chmod 0600 (file) or 0700 (folder). That also repairs a mode loosened after creation.
 *
 * Windows ignores `mode`, so files take whatever their folder grants. Measured 2026-11-14 on a real machine:
 * another tool had added an EXPLICIT `(OI)(CI)(RX)` grant for a sandbox group on ~/.trustshell, and every
 * file in it, the private key included, inherited read access. So set the ACL Windows OpenSSH accepts for a
 * private key: this user, SYSTEM and Administrators, nothing else.
 *  - `/reset` first: `/inheritance:r` alone keeps explicit grants (measured: a `Users:(R)` entry survived it,
 *    and the sandbox grant above is explicit).
 *  - SIDs, not names, so it works in any Windows language and with renamed accounts.
 *  - On a folder, `(OI)(CI)` so new files inherit it; measured: files ALREADY in the folder, nested ones
 *    included, lose the old inherited grant when the folder changes.
 *  - Full System32 paths: from Git Bash a bare `whoami` is Git's Unix one, which rejects `/user`.
 *
 * Not mediated: an explicit grant someone adds by hand to one file INSIDE the folder (other than the key,
 * which is narrowed itself) stays until that file is reset.
 */
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
/**
 * The default TrustShell home, `<home>/.trustshell` (case-insensitive on Windows). A FOLDER is only narrowed
 * when it is this one or TrustShell has just created it: TRUSTSHELL_HOME or TRUSTSHELL_MEMORY may name a
 * project folder or a whole home folder, and resetting that tree would strip grants other programs rely on.
 */
function isDefaultHome(dir, home = (0, node_os_1.homedir)(), platform = process.platform) {
    // The path rules of `platform`, not the host's: CI caught posix resolve() mangling a Windows path.
    const p = platform === 'win32' ? node_path_1.win32 : node_path_1.posix;
    const a = p.resolve(dir);
    const b = p.resolve(p.join(home, '.trustshell'));
    return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
const SYSTEM = '*S-1-5-18';
const ADMINISTRATORS = '*S-1-5-32-544';
function windowsSid(sys32, run) {
    const line = String(run(node_path_1.win32.join(sys32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }));
    const sid = line.split(',')[1]?.trim().replace(/^"|"$/g, '');
    if (!sid || !/^S-1-[0-9-]+$/.test(sid))
        throw new Error('whoami did not report this user\'s SID');
    return sid;
}
const isLinkOnDisk = (p) => require('node:fs').lstatSync(p).isSymbolicLink();
/**
 * Narrow `p` to this user. Throws when it cannot; the callers decide whether that is fatal.
 *
 * Refuses a symbolic link or Windows junction (Node's lstat reports both, measured): icacls and chmod follow
 * the link, so ~/.trustshell pointing at another folder would reset THAT folder's permissions (Grok, #718).
 * macOS: chmod leaves extended ACL entries in place, so `chmod -N` removes them too (Grok, #718).
 */
function ownerOnly(p, kind, platform = process.platform, run = node_child_process_1.execFileSync, isLink = isLinkOnDisk) {
    if (isLink(p))
        throw new Error('it is a symbolic link or junction, so the change would land on its target instead; not narrowed');
    if (platform !== 'win32') {
        require('node:fs').chmodSync(p, kind === 'dir' ? 0o700 : 0o600);
        if (platform === 'darwin')
            run('/bin/chmod', ['-N', p], { stdio: 'pipe', windowsHide: true });
        return;
    }
    const sys32 = node_path_1.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const sid = windowsSid(sys32, run);
    const icacls = node_path_1.win32.join(sys32, 'icacls.exe');
    const inherit = kind === 'dir' ? '(OI)(CI)' : '';
    run(icacls, [p, '/reset'], { stdio: 'pipe', windowsHide: true });
    run(icacls, [p, '/inheritance:r', '/grant:r', `*${sid}:${inherit}(F)`, `${SYSTEM}:${inherit}(F)`, `${ADMINISTRATORS}:${inherit}(F)`], { stdio: 'pipe', windowsHide: true });
}
const done = new Set();
/**
 * ownerOnly, at most once per path per process (a folder is not re-narrowed on every call), and never
 * fatal: an unrestricted file is what every earlier version had, so failing the command would not make
 * it safer. A failure is reported as a process warning with `code`, never swallowed.
 */
function tryOwnerOnly(p, kind, code, narrow = ownerOnly) {
    const key = `${kind}:${p}`;
    if (done.has(key))
        return;
    done.add(key); // success or failure, once per process: a long-lived MCP server must not repeat the warning
    try {
        narrow(p, kind);
    }
    catch (e) {
        process.emitWarning(`${p} could not be limited to this user (${e?.message ?? 'unknown error'}); other accounts on this machine may be able to read it`, { code });
    }
}
/** Test seam: forget which paths were narrowed in this process. */
function __resetOwnerOnlyCache() {
    done.clear();
}
