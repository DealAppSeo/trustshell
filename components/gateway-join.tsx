'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

/**
 * /gateway, "join us": an email and an optional note, saved to the TrustShell signup table.
 *
 * NOT `waitlist`. Every insert into `waitlist` fires two triggers [MEASURED 2026-10-24, pg_trigger]:
 * `on_waitlist_insert` mails the address a TrustTrader welcome ("0% vs 49.63% without veto", "$499/mo
 * value", from hello@trusttrader.dev), and `trg_notify_new_signup` posts the address to Telegram. A
 * page about trust cannot answer a signup with claims nobody has checked.
 *
 * `trustshell_v15_waitlist` instead [MEASURED 2026-10-24]: RLS on, anon may INSERT and has no read
 * policy, no triggers, every column but email defaulted. The note rides in its `metadata` jsonb. The
 * browser insert with the publishable key is the path components/roadmap-v15.tsx used against this
 * table in production (rows with source trustshell.dev/v15-form, 2026-09-19).
 *
 * A failure is never shown as a success: no key in the build, a refused insert or a dropped request
 * all read "Not saved", with GitHub as the way to reach us instead.
 */
export const SIGNUP_TABLE = 'trustshell_v15_waitlist';
export const SIGNUP_SOURCE = 'trustshell.dev/gateway';
export const MAX_NOTE = 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Status = 'idle' | 'sending' | 'saved' | 'failed';

const FIELD =
  'w-full min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60';

export function GatewayJoin() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return;
    setStatus('sending');
    try {
      const text = note.trim();
      const { error } = await createClient()
        .from(SIGNUP_TABLE)
        .insert({ email: email.trim(), source: SIGNUP_SOURCE, ...(text ? { metadata: { note: text } } : {}) });
      setStatus(error ? 'failed' : 'saved');
    } catch {
      // No key in this build, or the request never left: still a failure, never a success.
      setStatus('failed');
    }
  }

  if (status === 'saved') {
    return (
      <p data-testid="join-saved" role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-100">
        Saved. Thank you. Nothing is emailed to you automatically; we will write when there is something worth your time.
      </p>
    );
  }

  return (
    <form onSubmit={submit} data-testid="join-form" className="space-y-4">
      <div>
        <label htmlFor="join-email" className="mb-1 block text-sm font-medium text-white">
          Email
        </label>
        <input
          id="join-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="join-note" className="mb-1 block text-sm font-medium text-white">
          What would make you trust an AI agent? Anything else we should hear? (optional)
        </label>
        <textarea
          id="join-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          rows={4}
          maxLength={MAX_NOTE}
          className={`${FIELD} resize-y`}
        />
        <p className="mt-1 text-xs text-slate-500">
          {note.length}/{MAX_NOTE}
        </p>
      </div>
      <p className="text-sm text-slate-400">
        We store the email and note you send, and use them only to write to you about TrustShell. Don&apos;t include anything
        private.
      </p>
      {status === 'failed' && (
        <p data-testid="join-failed" role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-100">
          Not saved, so nothing was stored. Please tell us on{' '}
          <a href="https://github.com/DealAppSeo/trustshell/issues/new/choose" className="underline underline-offset-4">
            GitHub
          </a>{' '}
          instead.
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="min-h-11 rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-black hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' ? 'Saving…' : 'Count me in'}
      </button>
    </form>
  );
}
