'use client';

/**
 * T0.5 commitment gate — shown when an anonymous visitor uses up the free
 * taste of hosted runs. Benefit-framed per DESIGN_PRINCIPLES: the ask is
 * "save your progress and keep going free," never "sign up to try."
 */

import { useState } from 'react';
import { requestCode, verifyCode } from '@/lib/agent-gate';

const ERROR_COPY: Record<string, string> = {
  invalid_email: "That doesn't look like an email address — check it and try again.",
  too_many_requests: 'Too many codes requested — wait a bit and try again.',
  email_disabled: "Code sending is temporarily unavailable. Try again shortly, or bring your own key on /connect for unmetered runs.",
  send_failed: "The code didn't send. Try again in a minute.",
  wrong_code: "That code doesn't match — check the digits and try again.",
  code_expired: 'That code expired (they last 10 minutes). Request a fresh one.',
  too_many_attempts: 'Too many tries — request a fresh code.',
  network: "Couldn't reach the server — check your connection and try again.",
};

export function GateModal({ onVerified, onClose }: { onVerified: () => void; onClose: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await requestCode(email);
    setBusy(false);
    if (res.ok) setStep('code');
    else setError(ERROR_COPY[res.error ?? ''] ?? 'Something went wrong — try again.');
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await verifyCode(email, code.trim());
    setBusy(false);
    if (res.ok) onVerified();
    else setError(ERROR_COPY[res.error ?? ''] ?? 'Something went wrong — try again.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 space-y-4">
        <h3 className="text-xl font-bold text-white">
          {step === 'email' ? 'Save your progress — keep going free' : `Enter the code we sent to ${email}`}
        </h3>

        {step === 'email' ? (
          <>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              You&apos;ve used today&apos;s free anonymous runs. Add your email and your agent, its
              history, and its RepID progress are saved — and you keep running free at a higher daily
              limit. We use your email for your agent&apos;s trust reports only. No spam, no selling
              your address.
            </p>
            <form onSubmit={handleEmail} className="space-y-3">
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold p-3 rounded"
              >
                {busy ? 'Sending code…' : 'Email me a 6-digit code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              The code lasts 10 minutes. Wrong address?{' '}
              <button type="button" className="underline decoration-dotted" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                Change email
              </button>
            </p>
            <form onSubmit={handleCode} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white font-mono tracking-widest text-center"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold p-3 rounded"
              >
                {busy ? 'Checking…' : 'Verify and continue'}
              </button>
            </form>
          </>
        )}

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onClose} className="text-sm text-[#64748b] hover:text-[#94a3b8]">
            Not now — come back tomorrow
          </button>
          <a href="/connect" className="text-sm text-[#64748b] hover:text-[#94a3b8] underline decoration-dotted">
            Or bring your own key
          </a>
        </div>
      </div>
    </div>
  );
}
