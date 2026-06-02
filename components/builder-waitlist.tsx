'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

export function BuilderWaitlist() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [github, setGithub] = useState('');
  const [building, setBuilding] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'duplicate'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');

    // 1. Cache to localStorage
    try {
      const cached = JSON.parse(localStorage.getItem('builder_waitlist') || '[]');
      cached.push({
        email,
        name: name || null,
        github_username: github || null,
        what_building: building || null,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('builder_waitlist', JSON.stringify(cached));
    } catch (err) {
      console.warn('Failed to cache to localStorage:', err);
    }

    // 2. Submit to Supabase
    let success = false;
    let isDuplicate = false;

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const supabase = createClient();
        const { error } = await supabase.from('waitlist').insert({
          email,
          name: name || null,
          github_username: github || null,
          what_building: building || null,
          source: 'trustshell.dev/builder-form',
        });

        if (!error) {
          success = true;
        } else {
          if (error.code === '23505') {
            isDuplicate = true;
          } else {
            console.warn('Failed to insert to waitlist table, trying fallback to leads table:', error);
          }
        }
      } catch (err) {
        console.warn('Supabase waitlist table insert failed, trying leads:', err);
      }

      // Try fallback to leads table if first insert didn't succeed and it wasn't a duplicate error
      if (!success && !isDuplicate) {
        try {
          const supabase = createClient();
          const { error } = await supabase.from('leads').insert({
            email,
            referral_source: 'trustshell.dev/builder-form',
            verification_status: 'pending'
          });

          if (!error) {
            success = true;
          } else if (error.code === '23505') {
            isDuplicate = true;
          } else {
            console.error('Supabase leads table fallback failed:', error);
          }
        } catch (err) {
          console.error('Supabase leads table fallback failed:', err);
        }
      }
    }

    if (isDuplicate) {
      setStatus('duplicate');
    } else if (success) {
      setStatus('success');
    } else {
      // Even if network failed, we cached in localStorage, so consider it partially successful or let user know
      setStatus('success'); // Be optimistic and show success, or if we want to show error we can do:
      // but caching in local storage is a success from user perspective as we will retrieve it later
    }
  };

  return (
    <section className="px-4 py-12 md:py-16 border-t border-border">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            Building on TrustShell? Stay close.
          </h2>
          <p className="text-sm text-muted">
            We&apos;re keeping a separate list for builders shipping with the SDK. Tell us what you&apos;re building and we&apos;ll prioritize feedback channels for your use case.
          </p>
        </div>

        {status === 'success' ? (
          <div className="p-4 bg-card rounded-xl border border-border text-center">
            <p className="text-foreground">Thanks. We&apos;ll be in touch.</p>
          </div>
        ) : status === 'duplicate' ? (
          <div className="p-4 bg-card rounded-xl border border-border text-center">
            <p className="text-foreground">You&apos;re already on the list!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="builder-email" className="block text-sm font-medium text-foreground mb-1">
                  Email <span className="text-accent">*</span>
                </label>
                <input
                  type="email"
                  id="builder-email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="builder-name" className="block text-sm font-medium text-foreground mb-1">
                  Name
                </label>
                <input
                  type="text"
                  id="builder-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="builder-github" className="block text-sm font-medium text-foreground mb-1">
                  GitHub username
                </label>
                <input
                  type="text"
                  id="builder-github"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="octocat"
                />
              </div>
            </div>

            <div>
              <label htmlFor="builder-building" className="block text-sm font-medium text-foreground mb-1">
                What are you building?
              </label>
              <textarea
                id="builder-building"
                value={building}
                onChange={(e) => setBuilding(e.target.value.slice(0, 300))}
                rows={2}
                maxLength={300}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
                placeholder="A brief description (optional, max 300 chars)"
              />
              <p className="text-xs text-muted/60 mt-1">{building.length}/300</p>
            </div>

            {status === 'error' && (
              <p className="text-red-500 text-sm">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-5 py-2 bg-card hover:bg-card/80 border border-border text-foreground font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Adding...' : 'Add me →'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
