'use client';

import { useState } from 'react';
import { Settings, FileCode, Shield, DollarSign, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const tiers = [
  { name: 'Probationary', range: '0-30%' },
  { name: 'Agent', range: '30-50%' },
  { name: 'Conductor', range: '50-70%' },
  { name: 'Senior', range: '70-80%' },
  { name: 'Orchestrator', range: '80-95%' },
  { name: 'Architect', range: '95-100%' },
];

const notifications = [
  { icon: Settings, text: 'Modify its own configuration' },
  { icon: FileCode, text: 'Change its constitution or code' },
  { icon: Shield, text: 'Elevate its own permissions' },
  { icon: DollarSign, text: 'Execute financial transactions above your limit' },
  { icon: Wrench, text: 'Call external tools beyond its scope' },
];

export function RoadmapV15() {
  const [email, setEmail] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [github, setGithub] = useState('');
  const [notifyOnLaunch, setNotifyOnLaunch] = useState(true);
  const [privateBeta, setPrivateBeta] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'duplicate'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const supabase = createClient();
      const { error } = await supabase.from('trustshell_v15_waitlist').insert({
        email,
        telegram_chat_id: telegramId || null,
        github_username: github || null,
        notify_on_launch: notifyOnLaunch,
        private_beta_interest: privateBeta,
        source: 'trustshell.dev/v15-form',
      });

      if (error) {
        if (error.code === '23505') {
          setStatus('duplicate');
        } else {
          setStatus('error');
          setErrorMessage(error.message);
        }
        return;
      }

      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong — please try again or email sean@ccanaheim.com');
    }
  };

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Coming in V1.5: You stay in control.
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            Your agent grows trust by acting honestly. As its RepID grows, you decide what it can do without asking. Until then, you get a notification before any action you didn&apos;t pre-authorize. The agent earns its way.
          </p>
        </div>

        {/* Tier diagram */}
        <div className="overflow-x-auto">
          <div className="hidden md:flex items-center gap-0 min-w-max">
            {tiers.map((tier, index) => (
              <div key={tier.name} className="flex items-center">
                <div className="flex flex-col items-center px-4">
                  <div className={`px-4 py-2 rounded-lg border ${index === 0 ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}>
                    <p className="font-semibold text-sm text-foreground">{tier.name}</p>
                  </div>
                  <p className="text-xs text-muted mt-1">{tier.range}</p>
                </div>
                {index < tiers.length - 1 && (
                  <div className="text-muted">&rarr;</div>
                )}
              </div>
            ))}
          </div>
          {/* Mobile version - vertical */}
          <div className="md:hidden space-y-3">
            {tiers.map((tier, index) => (
              <div key={tier.name} className="flex items-center gap-4">
                <div className={`px-4 py-2 rounded-lg border flex-1 ${index === 0 ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}>
                  <p className="font-semibold text-sm text-foreground">{tier.name}</p>
                  <p className="text-xs text-muted">{tier.range}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notification list */}
        <div className="p-6 bg-card rounded-xl border border-border">
          <h3 className="font-semibold text-foreground mb-4">You get notified when your agent tries to:</h3>
          <ul className="space-y-3">
            {notifications.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-muted">
                <item.icon className="w-4 h-4 text-accent flex-shrink-0" />
                <span className="text-sm">{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted/70 mt-4">
            Notifications via Telegram at launch. Discord, email, and webhook channels follow.
          </p>
        </div>

        {/* Email signup form */}
        {status === 'success' ? (
          <div className="p-6 bg-card rounded-xl border border-border text-center">
            <p className="text-foreground">You&apos;re on the list. We&apos;ll DM when V1.5 ships.</p>
          </div>
        ) : status === 'duplicate' ? (
          <div className="p-6 bg-card rounded-xl border border-border text-center">
            <p className="text-foreground">You&apos;re already on the list — see you at V1.5 launch.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 bg-card rounded-xl border border-border space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                  Email <span className="text-accent">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="telegram" className="block text-sm font-medium text-foreground mb-1">
                  Telegram chat_id
                </label>
                <input
                  type="text"
                  id="telegram"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="123456789"
                />
                <p className="text-xs text-muted/70 mt-1">We&apos;ll DM you with /start instructions</p>
              </div>
              <div>
                <label htmlFor="github" className="block text-sm font-medium text-foreground mb-1">
                  GitHub username
                </label>
                <input
                  type="text"
                  id="github"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="octocat"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnLaunch}
                  onChange={(e) => setNotifyOnLaunch(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-accent focus:ring-accent/50"
                />
                <span className="text-sm text-muted">I want to be notified when V1.5 ships</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privateBeta}
                  onChange={(e) => setPrivateBeta(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-accent focus:ring-accent/50"
                />
                <span className="text-sm text-muted">I want to participate in private beta</span>
              </label>
            </div>

            {status === 'error' && (
              <p className="text-red-500 text-sm">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Submitting...' : 'Get early access →'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
