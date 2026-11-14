/**
 * The install signing key AND the TrustShell home folder that holds it are limited to this user, on create
 * and on load (2026-11-14). See src/lib/owner-only.ts.
 *
 * Why: Windows ignores the 0600/0700 `mode` TrustShell wrote with, so files took whatever their folder
 * granted. Measured on a real machine: another tool had added an EXPLICIT `(OI)(CI)(RX)` grant for a sandbox
 * group on ~/.trustshell, so that group could read the private key, the memory and the policy.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ownFingerprint, signingKey, type KeyFs } from '../src/lib/install-key';
import { isDefaultHome, ownerOnly, tryOwnerOnly, __resetOwnerOnlyCache } from '../src/lib/owner-only';

beforeEach(() => __resetOwnerOnlyCache());

function memFs(fail?: { file?: boolean; dir?: boolean }, existingDirs: string[] = []): KeyFs & { files: Map<string, string>; calls: string[] } {
  const files = new Map<string, string>();
  const dirs = new Set(existingDirs);
  const calls: string[] = [];
  return {
    files,
    calls,
    exists: (p) => files.has(p) || dirs.has(p),
    read: (p) => files.get(p) as string,
    writeNew: (p, d) => {
      if (files.has(p)) throw new Error('exists');
      files.set(p, d);
    },
    mkdirp: (p) => {
      dirs.add(p);
    },
    restrict: (p) => {
      calls.push(`file:${p}`);
      if (fail?.file) throw new Error('icacls is not available');
    },
    restrictDir: (p) => {
      calls.push(`dir:${p}`);
      if (fail?.dir) throw new Error('folder refused');
    },
  };
}

describe('signingKey narrows the key, and the folder only when it is TrustShell\'s own', () => {
  it('a folder it creates: folder then key; once per process; the key again in a new process (an older key is repaired)', () => {
    const fs = memFs();
    const first = signingKey('/somewhere/new', fs);
    expect(first.created).toBe(true);
    expect(fs.calls).toEqual(['dir:/somewhere/new', `file:${first.path}`]);
    signingKey('/somewhere/new', fs); // same process: not repeated
    expect(fs.calls).toHaveLength(2);
    __resetOwnerOnlyCache(); // a new process: the folder now pre-exists and is not ~/.trustshell, so only the key
    expect(signingKey('/somewhere/new', fs).created).toBe(false);
    expect(fs.calls).toEqual(['dir:/somewhere/new', `file:${first.path}`, `file:${first.path}`]);
  });

  it('the default ~/.trustshell is narrowed even when it already exists (another tool may have widened it)', () => {
    const home = join(homedir(), '.trustshell');
    const fs = memFs(undefined, [home]);
    const k = signingKey(home, fs);
    expect(fs.calls).toEqual([`dir:${home}`, `file:${k.path}`]);
  });

  it('ownFingerprint (the reader behind `run` and `bundle verify`) narrows the key too, and touches nothing when there is no key', () => {
    // Strix, #718: the first version narrowed only inside signingKey.
    const fs = memFs(undefined, ['/projects/app']);
    expect(ownFingerprint('/projects/app', fs)).toBeNull();
    expect(fs.calls).toEqual([]); // nothing created, nothing narrowed
    const k = signingKey('/projects/app', fs);
    __resetOwnerOnlyCache(); // a later process that only runs `trustshell run`
    fs.calls.length = 0;
    expect(ownFingerprint('/projects/app', fs)).toBe(k.signer.fingerprint);
    expect(fs.calls).toEqual([`file:${k.path}`]);
    const home = join(homedir(), '.trustshell');
    const fs2 = memFs(undefined, [home]);
    const k2 = signingKey(home, fs2);
    __resetOwnerOnlyCache();
    fs2.calls.length = 0;
    ownFingerprint(home, fs2);
    expect(fs2.calls).toEqual([`dir:${home}`, `file:${k2.path}`]);
  });

  it('an existing folder that is not ~/.trustshell (TRUSTSHELL_HOME=a project) is left alone; only the key is narrowed', () => {
    const fs = memFs(undefined, ['/projects/app']);
    const k = signingKey('/projects/app', fs);
    expect(fs.calls).toEqual([`file:${k.path}`]);
  });

  it('when it cannot, the key still works and each failure is a named warning, once', () => {
    const warn = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const fs = memFs({ file: true, dir: true });
      const k = signingKey('/home', fs);
      expect(k.key.asymmetricKeyType).toBe('ed25519');
      signingKey('/home', fs); // same process: no repeat warnings
      const codes = warn.mock.calls.map((c) => (c[1] as { code: string }).code);
      expect(codes).toEqual(['TRUSTSHELL_HOME_PERMISSIONS', 'TRUSTSHELL_KEY_PERMISSIONS']);
      expect(String(warn.mock.calls[1]![0])).toMatch(/could not be limited to this user \(icacls is not available\)/);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ownerOnly on Windows: reset, then owner + SYSTEM + Administrators by SID', () => {
  const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
  const fake = () => {
    const calls: Array<[string, string[]]> = [];
    const run = (file: string, args: string[]) => {
      calls.push([file, args]);
      return /whoami\.exe$/i.test(file) ? `"machine\\someone","${SID}"\r\n` : '';
    };
    return { calls, run };
  };

  it('a file: full System32 paths (a bare whoami from Git Bash is Git\'s Unix one) and no inheritance flags', () => {
    const { calls, run } = fake();
    ownerOnly('C:\\k.pem', 'file', 'win32', run);
    expect(calls.map(([f]) => f)).toEqual([
      expect.stringMatching(/[\\/]System32[\\/]whoami\.exe$/i),
      expect.stringMatching(/[\\/]System32[\\/]icacls\.exe$/i),
      expect.stringMatching(/[\\/]System32[\\/]icacls\.exe$/i),
    ]);
    expect(calls.map(([, a]) => a)).toEqual([
      ['/user', '/fo', 'csv', '/nh'],
      ['C:\\k.pem', '/reset'],
      ['C:\\k.pem', '/inheritance:r', '/grant:r', `*${SID}:(F)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'],
    ]);
  });

  it('a folder: the same grants with (OI)(CI), so new files inherit them', () => {
    const { calls, run } = fake();
    ownerOnly('C:\\home', 'dir', 'win32', run);
    expect(calls[2]![1]).toEqual(['C:\\home', '/inheritance:r', '/grant:r', `*${SID}:(OI)(CI)(F)`, '*S-1-5-18:(OI)(CI)(F)', '*S-1-5-32-544:(OI)(CI)(F)']);
  });

  it('refuses, before touching the file, when whoami reports no SID', () => {
    const calls: string[] = [];
    const run = (file: string) => {
      calls.push(file);
      return 'not csv';
    };
    expect(() => ownerOnly('C:\\k.pem', 'file', 'win32', run)).toThrow(/did not report this user's SID/);
    expect(calls).toEqual([expect.stringMatching(/whoami\.exe$/i)]); // icacls never ran
  });
});

describe('tryOwnerOnly', () => {
  it('runs once per path per process, and turns a failure into one named warning', () => {
    const warn = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      let n = 0;
      const narrow = () => {
        n += 1;
        throw new Error('nope');
      };
      tryOwnerOnly('/x', 'dir', 'TRUSTSHELL_HOME_PERMISSIONS', narrow);
      tryOwnerOnly('/x', 'dir', 'TRUSTSHELL_HOME_PERMISSIONS', narrow);
      expect(n).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('the memory store narrows the default home even when it already exists, and only that one', () => {
  it('~/.trustshell is the default home; a folder TRUSTSHELL_MEMORY names is not', () => {
    expect(isDefaultHome('/home/u/.trustshell', '/home/u', 'linux')).toBe(true);
    expect(isDefaultHome('/home/u/projects/notes', '/home/u', 'linux')).toBe(false);
    expect(isDefaultHome('C:\\Users\\U\\.TrustShell', 'C:\\Users\\u', 'win32')).toBe(true);
  });
});

const posix = process.platform === 'win32' ? it.skip : it;
const windows = process.platform === 'win32' ? it : it.skip;

describe('on the real filesystem', () => {
  posix('POSIX: a loosened key (0644) is back to 0600 after the next load; a folder that is not ~/.trustshell keeps its mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-key-'));
    try {
      const { path } = signingKey(dir);
      chmodSync(path, 0o644);
      chmodSync(dir, 0o755);
      __resetOwnerOnlyCache();
      signingKey(dir);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(dir).mode & 0o777).toBe(0o755); // existing, not ~/.trustshell: left alone
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  posix('POSIX: a loosened ~/.trustshell (0755) is back to 0700 after the next load', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ts-home-'));
    const home = join(parent, '.trustshell');
    const spy = jest.spyOn(require('node:os') as typeof import('node:os'), 'homedir').mockReturnValue(parent);
    try {
      mkdirSync(home);
      chmodSync(home, 0o755);
      const { path } = signingKey(home);
      expect(statSync(home).mode & 0o777).toBe(0o700);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    } finally {
      spy.mockRestore();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  windows('Windows: an existing folder that is not ~/.trustshell keeps its grants; only the key is narrowed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-proj-'));
    try {
      execFileSync('icacls', [dir, '/grant', '*S-1-5-32-545:(OI)(CI)(RX)'], { stdio: 'pipe' });
      const { path } = signingKey(dir);
      expect(String(execFileSync('icacls', [dir], { encoding: 'utf8' }))).toMatch(/\\Users:\(OI\)\(CI\)\(RX\)/); // untouched
      expect(String(execFileSync('icacls', [path], { encoding: 'utf8' }))).not.toMatch(/\\Users:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  windows('Windows: an explicit read grant on ~/.trustshell (the measured case) is removed from the folder, the key and files already there', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ts-home-'));
    const home = join(parent, '.trustshell');
    // This temp folder plays the user's home. (Setting process.env.USERPROFILE does not reach os.homedir() under jest.)
    const spy = jest.spyOn(require('node:os') as typeof import('node:os'), 'homedir').mockReturnValue(parent);
    try {
      expect(isDefaultHome(home)).toBe(true);
      mkdirSync(home);
      // The measured case: an EXPLICIT inheritable read grant for another group on the home folder.
      execFileSync('icacls', [home, '/grant', '*S-1-5-32-545:(OI)(CI)(RX)'], { stdio: 'pipe' });
      const memory = join(home, 'memory.sqlite');
      writeFileSync(memory, 'notes');
      // Control: before the fix, the existing file IS readable by Users (the instrument can see the grant).
      expect(String(execFileSync('icacls', [memory], { encoding: 'utf8' }))).toMatch(/\\Users:\(I\)/);
      const { path } = signingKey(home);
      for (const p of [home, path, memory]) {
        expect(String(execFileSync('icacls', [p], { encoding: 'utf8' }))).not.toMatch(/\\Users:/);
      }
      expect(String(execFileSync('icacls', [path], { encoding: 'utf8' }))).not.toMatch(/\(I\)/); // the key inherits nothing
      __resetOwnerOnlyCache();
      expect(signingKey(home).created).toBe(false); // still readable by this user
    } finally {
      spy.mockRestore();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
