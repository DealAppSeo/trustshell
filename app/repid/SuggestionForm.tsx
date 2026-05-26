'use client';

import { useState, useTransition } from 'react';
import { submitSuggestion, SubmitResult } from './actions';

export default function SuggestionForm() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const [charCount, setCharCount] = useState(0);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: SubmitResult = await submitSuggestion(fd);
      setStatus(result);
      if (result.ok) {
        e.currentTarget?.reset?.();
        setCharCount(0);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[#94a3b8] mb-1">
          Email <span className="text-amber-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          placeholder="you@example.com"
          className="w-full px-4 py-2 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      <div>
        <label htmlFor="github_username" className="block text-sm font-medium text-[#94a3b8] mb-1">
          GitHub username <span className="text-[#475569]">(optional)</span>
        </label>
        <input
          type="text"
          id="github_username"
          name="github_username"
          pattern="[A-Za-z0-9-]{1,39}"
          placeholder="octocat"
          className="w-full px-4 py-2 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:border-amber-500 transition-colors"
        />
        <p className="text-xs text-[#475569] mt-1">
          So we can credit you if your suggestion shapes V1.5 weights.
        </p>
      </div>

      <div>
        <label htmlFor="suggestion" className="block text-sm font-medium text-[#94a3b8] mb-1">
          Your suggestion <span className="text-amber-500">*</span>
        </label>
        <textarea
          id="suggestion"
          name="suggestion"
          required
          maxLength={1000}
          rows={6}
          onChange={(e) => setCharCount(e.target.value.length)}
          placeholder="What signal would you weight differently? What's missing from the formula? What edge case worries you?"
          className="w-full px-4 py-2 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:border-amber-500 transition-colors resize-y"
        />
        <div className="flex justify-between text-xs mt-1">
          <span className="text-[#475569]">Max 1,000 characters.</span>
          <span className={charCount > 900 ? 'text-amber-500' : 'text-[#475569]'}>{charCount} / 1000</span>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
        >
          {pending ? 'Submitting...' : 'Submit'}
        </button>

        {status && status.ok && (
          <span className="text-sm text-emerald-400">
            ✓ Thanks. Your suggestion is in the queue.
          </span>
        )}
        {status && !status.ok && (
          <span className="text-sm text-red-400">{status.error}</span>
        )}
      </div>
    </form>
  );
}
