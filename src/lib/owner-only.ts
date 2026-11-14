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
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

/**
 * The default TrustShell home, `<home>/.trustshell` (case-insensitive on Windows). A FOLDER is only narrowed
 * when it is this one or TrustShell has just created it: TRUSTSHELL_HOME or TRUSTSHELL_MEMORY may name a
 * project folder or a whole home folder, and resetting that tree would strip grants other programs rely on.
 */
export function isDefaultHome(dir: string, home: string = homedir(), platform: NodeJS.Platform = process.platform): boolean {
  // The path rules of `platform`, not the host's: CI caught posix resolve() mangling a Windows path.
  const p = platform === 'win32' ? win32 : posix;
  const a = p.resolve(dir);
  const b = p.resolve(p.join(home, '.trustshell'));
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export type Run = (file: string, args: string[], opts: { encoding?: 'utf8'; stdio?: 'pipe'; windowsHide: boolean }) => string | Buffer;

const SYSTEM = '*S-1-5-18';
const ADMINISTRATORS = '*S-1-5-32-544';

function windowsSid(sys32: string, run: Run): string {
  const line = String(run(win32.join(sys32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }));
  const sid = line.split(',')[1]?.trim().replace(/^"|"$/g, '');
  if (!sid || !/^S-1-[0-9-]+$/.test(sid)) throw new Error('whoami did not report this user\'s SID');
  return sid;
}

/** Narrow `p` to this user. Throws when it cannot; the callers decide whether that is fatal. */
export function ownerOnly(p: string, kind: 'file' | 'dir', platform: NodeJS.Platform = process.platform, run: Run = execFileSync as unknown as Run): void {
  if (platform !== 'win32') {
    (require('node:fs') as typeof import('node:fs')).chmodSync(p, kind === 'dir' ? 0o700 : 0o600);
    return;
  }
  const sys32 = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const sid = windowsSid(sys32, run);
  const icacls = win32.join(sys32, 'icacls.exe');
  const inherit = kind === 'dir' ? '(OI)(CI)' : '';
  run(icacls, [p, '/reset'], { stdio: 'pipe', windowsHide: true });
  run(icacls, [p, '/inheritance:r', '/grant:r', `*${sid}:${inherit}(F)`, `${SYSTEM}:${inherit}(F)`, `${ADMINISTRATORS}:${inherit}(F)`], { stdio: 'pipe', windowsHide: true });
}

const done = new Set<string>();

/**
 * ownerOnly, at most once per path per process (a folder is not re-narrowed on every call), and never
 * fatal: an unrestricted file is what every earlier version had, so failing the command would not make
 * it safer. A failure is reported as a process warning with `code`, never swallowed.
 */
export function tryOwnerOnly(p: string, kind: 'file' | 'dir', code: string, narrow: (p: string, kind: 'file' | 'dir') => void = ownerOnly): void {
  const key = `${kind}:${p}`;
  if (done.has(key)) return;
  done.add(key); // success or failure, once per process: a long-lived MCP server must not repeat the warning
  try {
    narrow(p, kind);
  } catch (e) {
    process.emitWarning(`${p} could not be limited to this user (${(e as Error)?.message ?? 'unknown error'}); other accounts on this machine may be able to read it`, { code });
  }
}

/** Test seam: forget which paths were narrowed in this process. */
export function __resetOwnerOnlyCache(): void {
  done.clear();
}
