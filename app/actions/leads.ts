'use server';

import { sbInsert } from '@/lib/supabase';

export async function submitLead(formData: {
  email: string;
  github?: string;
  interest?: string;
  role?: string;
  source: string;
}) {
  try {
    if (!formData.email || !formData.email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }

    await sbInsert('trinity_leads', {
      email: formData.email.trim(),
      github_handle: formData.github?.trim() || null,
      interest: formData.interest?.trim() || null,
      role: formData.role?.trim() || null,
      status: 'new',
      metadata: { source: formData.source },
      created_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to submit lead:', error);
    return { success: false, error: error.message || 'Server error' };
  }
}
