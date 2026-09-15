/**
 * #159 — a legacy JWT must not be the browser Supabase key.
 * Synthetic strings only. No live JWT.
 */
import { pickBrowserSupabaseKey } from '../lib/supabase';

describe('dead JWT fail-closed', () => {
  it('prefers a publishable key', () => {
    expect(pickBrowserSupabaseKey('sb_publishable_test', 'eyJhbGciOiJfake')).toBe('sb_publishable_test');
  });

  it('refuses a JWT anon fallback', () => {
    expect(() => pickBrowserSupabaseKey(undefined, 'eyJhbGciOiJfake')).toThrow(/dead_jwt_refused/);
  });

  it('throws when nothing is set', () => {
    expect(() => pickBrowserSupabaseKey(undefined, undefined)).toThrow(/supabase_key_missing/);
  });
});
