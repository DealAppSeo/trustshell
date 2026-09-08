/**
 * A `NEXT_PUBLIC_*` variable is published to every visitor. Never name a secret one.
 *
 * Next inlines `NEXT_PUBLIC_*` into the browser bundle at build time, so the prefix is
 * not a label — it is the act of publishing. A variable called
 * `NEXT_PUBLIC_SOMETHING_ADMIN_KEY` therefore ships an admin key to anyone who views
 * source, and nothing in a typecheck, a test run or a code review necessarily notices,
 * because the code is *correct*: it reads the variable it was told to read.
 *
 * The route in is mundane and was observed live across this fleet: a value is needed in
 * client code, it comes back `undefined`, and the fix that "works" is to duplicate the
 * variable with the magic prefix. The duplicate is then indistinguishable from a
 * deliberate decision.
 *
 * This guard makes that unrepresentable in source. It does NOT protect a deploy
 * platform's variable list — a name can exist there without appearing here — so it is
 * one half of the answer; the other half is not creating such variables in the first
 * place.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.codegraph', 'screenshots', 'public']);

/** Words that mean "this value is a credential", in any position after the prefix. */
const SECRET_WORDS = /(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|ADMIN|SERVICE_ROLE|MASTER|SIGNING|API_KEY)/;

/**
 * Names that ARE safe to publish, with the reason. A Supabase publishable key is
 * public by construction: it authenticates as the `anon` Postgres role, ships in the
 * bundle by design, and is useless without RLS-permitted access. Anything added here
 * needs the same kind of argument, not just a wish to make the test pass.
 */
const ALLOWED = new Map<string, string>([
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable by design — resolves to the anon role, ships in the bundle'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'the legacy name for the same publishable credential; retained as a fallback'],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every NEXT_PUBLIC_ name mentioned anywhere in the tree, with where it was seen. */
function publicNames(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(ROOT)) {
    if (file === __filename) continue; // this file names them on purpose
    let text: string;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
      const name = m[0];
      const where = found.get(name) ?? [];
      const rel = relative(ROOT, file);
      if (!where.includes(rel)) where.push(rel);
      found.set(name, where);
    }
  }
  return found;
}

describe('no secret-shaped name is marked publishable', () => {
  const names = publicNames();

  it('sanity: the scan actually found NEXT_PUBLIC_ names', () => {
    expect(names.size).toBeGreaterThan(0);
  });

  it('no NEXT_PUBLIC_* name reads as a credential', () => {
    const offenders = [...names.entries()]
      .filter(([name]) => SECRET_WORDS.test(name.replace(/^NEXT_PUBLIC_/, '')))
      .filter(([name]) => !ALLOWED.has(name))
      .map(([name, files]) => `${name}  (in ${files.slice(0, 3).join(', ')})`);

    // A failure here is not a naming nit. It means a credential is being compiled
    // into the JavaScript that every visitor downloads.
    expect(offenders).toEqual([]);
  });

  it('every allowlist entry carries a reason, and is still actually used', () => {
    for (const [name, reason] of ALLOWED) {
      expect(reason.length).toBeGreaterThan(20);
    }
    // An allowlist entry for a name nobody uses is a permanent exemption nobody
    // reviews; drop it when the name goes.
    const unused = [...ALLOWED.keys()].filter((n) => !names.has(n));
    expect(unused).toEqual([]);
  });
});
