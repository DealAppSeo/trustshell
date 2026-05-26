'use server';

import { sbInsert, supabaseConfigured } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const GH_RE = /^[A-Za-z0-9-]{1,39}$/;

export async function submitSuggestion(formData: FormData): Promise<SubmitResult> {
  const email = String(formData.get('email') ?? '').trim();
  const github = String(formData.get('github_username') ?? '').trim();
  const suggestion = String(formData.get('suggestion') ?? '').trim();

  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (github && !GH_RE.test(github)) {
    return { ok: false, error: 'GitHub username may contain letters, numbers, and hyphens only (max 39 chars).' };
  }
  if (!suggestion) {
    return { ok: false, error: 'Suggestion is required.' };
  }
  if (suggestion.length > 1000) {
    return { ok: false, error: 'Suggestion is too long (max 1000 characters).' };
  }

  if (!supabaseConfigured()) {
    return { ok: false, error: 'Submissions are temporarily unavailable. Please open a GitHub issue at github.com/DealAppSeo/hyperdag-protocol instead.' };
  }

  try {
    await sbInsert<{ id: number }>('repid_governance_suggestions', {
      email,
      github_username: github || null,
      suggestion,
      source: 'trustshell.dev/repid',
    });
  } catch (e) {
    return { ok: false, error: 'Could not save your suggestion. Please try again, or open a GitHub issue.' };
  }

  revalidatePath('/repid');
  return { ok: true };
}
