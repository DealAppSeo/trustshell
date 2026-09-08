/**
 * The browser Supabase key has to survive the bundler.
 *
 * `NEXT_PUBLIC_*` reaches the browser only because Next SUBSTITUTES the value
 * at build time wherever it sees the literal text `process.env.NAME`. A
 * computed lookup is not substituted and is `undefined` in the browser — which
 * fails at runtime, in the client, where no test or typecheck is watching.
 *
 * That makes a multi-name fallback a source-level contract rather than a style
 * choice, so it is pinned here. Written while renaming ANON_KEY to
 * PUBLISHABLE_KEY: during the transition both names must be inlined, or the
 * rename takes the site down the moment one variable is removed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'lib', 'supabase.ts'), 'utf8');

describe('the browser Supabase key survives the bundler', () => {
  it('spells out both candidate names as literal process.env references', () => {
    expect(SRC).toContain('process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(SRC).toContain('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('never reads an env var through a computed lookup', () => {
    // Anything of the form process.env[...] is not inlined by Next.
    expect(SRC).not.toMatch(/process\.env\s*\[/);
  });

  it('prefers the accurately-named variable over the legacy one', () => {
    const publishable = SRC.indexOf('process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    const legacy = SRC.indexOf('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(publishable).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(publishable);
  });
});
