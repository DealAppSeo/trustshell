// Supabase client helpers for both server and browser.
import { createBrowserClient } from '@supabase/ssr'

// Browser client for client-side operations (waitlist forms, etc.)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server-side REST helpers
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(url && serviceRoleKey);
}

function headers() {
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

export async function sbInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  if (!supabaseConfigured()) throw new Error('Supabase not configured');
  const resp = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(row),
    cache: 'no-store',
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase insert ${table}: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (Array.isArray(data) ? data[0] : data) as T;
}

export async function sbSelect<T>(
  table: string,
  opts: { select?: string; orderBy?: string; limit?: number; filter?: string } = {}
): Promise<T[]> {
  if (!supabaseConfigured()) return [];
  const params = new URLSearchParams();
  if (opts.select) params.set('select', opts.select);
  if (opts.orderBy) params.set('order', opts.orderBy);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.filter) {
    for (const part of opts.filter.split('&')) {
      const [k, v] = part.split('=');
      if (k && v) params.set(k, v);
    }
  }
  const resp = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
    method: 'GET',
    headers: headers(),
    cache: 'no-store',
  });
  if (!resp.ok) return [];
  return (await resp.json().catch(() => [])) as T[];
}
