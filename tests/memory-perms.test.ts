/**
 * SEC F6 (security run 2026-10-16). The local memory (the operator's notes and keyed values) was
 * created with the process defaults: on a typical umask the folder 0755 and the file 0644, readable
 * by every account on the machine. Now the folder is created 0700 and the file is created, and kept,
 * 0600. On Windows, where those modes do nothing, a folder TrustShell creates gets an ACL for the
 * current user only (icacls), best effort.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { readKeyed, writeKeyed } from '../src/memory/local-store';

const posix = process.platform !== 'win32';

describe('SEC F6: the memory folder and file are owner-only', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-f6-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  (posix ? it : it.skip)('POSIX: a new folder is 0700 and a new file 0600', () => {
    const dir = join(root, 'fresh', '.trustshell');
    const db = join(dir, 'memory.sqlite');
    writeKeyed(db, 'desk', 'value');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(root, 'fresh')).mode & 0o777).toBe(0o700);
    expect(statSync(db).mode & 0o777).toBe(0o600);
    expect(readKeyed(db, 'desk')).toBe('value');
  });

  (posix ? it : it.skip)('POSIX: an existing file left world-readable is tightened to 0600 on the next open', () => {
    const db = join(root, 'memory.sqlite');
    writeFileSync(db, '');
    chmodSync(db, 0o644);
    writeKeyed(db, 'desk', 'value');
    expect(statSync(db).mode & 0o777).toBe(0o600);
  });

  (posix ? it.skip : it)('Windows: a new folder grants only the current user, nothing inherited', () => {
    const dir = join(root, 'fresh-win');
    writeKeyed(join(dir, 'memory.sqlite'), 'desk', 'value');
    const acl = execFileSync('icacls', [dir], { encoding: 'utf8' });
    expect(acl).toContain(userInfo().username);
    expect(acl).not.toMatch(/\(I\)/); // no inherited entry
    expect(acl).not.toMatch(/BUILTIN\\Users|Everyone|Authenticated Users/i);
    expect(readKeyed(join(dir, 'memory.sqlite'), 'desk')).toBe('value');
  });
});
