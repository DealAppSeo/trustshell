/**
 * THE KEY IS A PLACE A SECRET CAN LAND.
 *
 * `remember` takes two positionals — `remember KEY VALUE` — so `remember <secret> <label>`
 * is one transposition away from the correct call, and it is the slip a hurried user
 * actually makes. Until 2026-10-11 `rememberKey` checked only the VALUE. That call therefore
 * wrote the secret to disk as the KEY, in plain text, and `recall` prints keys — so the
 * credential also came back out on stdout.
 *
 * What makes it worth a dedicated file: nothing failed. The command printed `remembered` and
 * exited 0. A user who had just watched `remember` correctly refuse a secret in the value
 * position had every reason to believe the guard covered them. It did not, and the only signal
 * was a success message. That is this project's house defect — a system reporting success it
 * has not earned — inside the one command whose entire job is to refuse.
 *
 * MEASURED before the fix, against published 1.6.0:
 *   remember sb_secret_aaaaaaaaaaaaaaaaaaaa harmless   -> exit 0, "remembered"   (stored)
 * and after:
 *   remember sb_secret_aaaaaaaaaaaaaaaaaaaa harmless   -> exit 2, "remember refused"
 *
 * The fixtures below are synthetic shapes, never real credentials — prod-fixture rules apply.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rememberKey, refusedValue } from '../src/cli/remember';
import { readKeyed } from '../src/memory/local-store';

/** Synthetic, shape-only. Each is a credential format the value position already refused. */
const SECRET_SHAPES: ReadonlyArray<readonly [string, string]> = [
  ['supabase secret', 'sb_secret_aaaaaaaaaaaaaaaaaaaa'],
  ['postgres URI', 'postgresql://user:pw@host:5432/db'],
  ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig'],
  ['github PAT', 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['openai sk-', 'sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['aws key id', 'AKIAIOSFODNN7EXAMPLE'],
];

describe('rememberKey scans the key, not only the value', () => {
  const prev = process.env.TRUSTSHELL_MEMORY;
  let dir = '';
  let db = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-kv-keyscan-'));
    db = join(dir, 'memory.sqlite');
    process.env.TRUSTSHELL_MEMORY = db;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.TRUSTSHELL_MEMORY;
    else process.env.TRUSTSHELL_MEMORY = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  for (const [label, secret] of SECRET_SHAPES) {
    it(`refuses a ${label} in the KEY position and writes nothing`, () => {
      expect(rememberKey(secret, 'harmless')).toBe(false);
      // Nothing stored: the refusal must be a no-write, not a write-then-complain.
      // readKeyed returns the STRING 'NOT_CHECKED' for an absent key by contract — a
      // placeholder would otherwise be read by a script as the value itself.
      expect(readKeyed(db, secret)).toBe('NOT_CHECKED');
    });
  }

  it('still refuses the same shapes in the value position', () => {
    for (const [, secret] of SECRET_SHAPES) {
      expect(rememberKey('LABEL', secret)).toBe(false);
      expect(readKeyed(db, 'LABEL')).toBe('NOT_CHECKED');
    }
  });

  it('still stores a benign key and value', () => {
    expect(rememberKey('GREETING', 'hello world')).toBe(true);
    expect(readKeyed(db, 'GREETING')).toBe('hello world');
  });

  it('refuses sb_secret_ regardless of case', () => {
    // `postgresql://` was already matched case-insensitively in the same function while
    // `sb_secret_` was not, so SB_SECRET_ walked past a guard its lowercase twin stopped.
    // The literal is never benign prose in any case, so over-refusing here costs nothing.
    expect(refusedValue('SB_SECRET_AAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(refusedValue('Sb_Secret_aaaaaaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('does NOT claim to catch base64-wrapped secrets, and that is deliberate', () => {
    // Detecting an encoded secret means decoding every value and rescanning, which drags in
    // a large false-positive surface for a guard that is explicitly a list of SHAPES, not a
    // judgement. Pinned so nobody reads the gap as an oversight and "fixes" it into noise.
    // 40 base64 characters is the shape of a bare AWS secret access key, which the scrubber DOES
    // catch (2026-10-12, by shape, not by decoding). So this wraps a secret whose base64 is longer
    // than that: the guard still does not decode and rescan.
    const base64OfASecret = Buffer.from('sb_secret_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').toString('base64');
    expect(base64OfASecret).toHaveLength(56);
    expect(refusedValue(base64OfASecret)).toBe(false);
  });

  it('does not refuse personal data — local memory is where that belongs', () => {
    expect(refusedValue('ada@example.com')).toBe(false);
    expect(rememberKey('CONTACT', 'ada@example.com')).toBe(true);
  });
});
