'use client';

import { useState } from 'react';
import { submitLead } from '@/app/actions/leads';

export function BuilderWaitlist() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [github, setGithub] = useState('');
  const [building, setBuilding] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const result = await submitLead({
        email,
        github: github || undefined,
        interest: `Name: ${name || 'N/A'}. Building: ${building || 'N/A'}`,
        role: 'builder',
        source: 'trustshell.dev/builder-form',
      });

      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error || 'Failed to submit waitlist.');
        return;
      }

      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong — please try again.');
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
