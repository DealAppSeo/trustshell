'use client';

import { useState } from 'react';
import { classifyClaim, DEFAULT_API_URL, ClaimError, type ClaimLabel } from '@/src/lib/claim';

// NEXT_PUBLIC_* is inlined only for a literal reference, so it is spelled out here.
const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || DEFAULT_API_URL;
// The route reads at most this much prose (repid-engine DEFAULT_MAX_PROSE_CHARS).
const MAX_CHARS = 1500;

const MEANING: Record<ClaimLabel, { title: string; body: string; tone: string }> = {
  pass: {
    title: 'pass',
    body: 'Both checkers said this sentence is true.',
    tone: 'text-emerald-400 border-emerald-500/40',
  },
  veto: {
    title: 'veto',
    body: 'Both checkers said this sentence is false. Do not rely on it.',
    tone: 'text-red-400 border-red-500/40',
  },
  'not-checked': {
    title: 'not-checked',
    body: 'We could not decide. Opinions and predictions land here, and so does any checker that did not answer. This is not a pass.',
    tone: 'text-amber-400 border-amber-500/40',
  },
};

export default function CheckForm() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ label: ClaimLabel; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const r = await classifyClaim(text, { apiUrl: ENGINE, env: {} });
      setResult({ label: r.label, ms: r.latency_ms });
    } catch (err) {
      setError(err instanceof ClaimError ? err.message : 'Something went wrong before the sentence was sent.');
    } finally {
      setBusy(false);
    }
  }

  const meaning = result ? MEANING[result.label] : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="check-form">
      <label htmlFor="claim" className="block text-sm font-medium text-[#94a3b8]">
        One sentence
      </label>
      <textarea
        id="claim"
        name="claim"
        required
        rows={4}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="The Eiffel Tower is in Paris."
        className="w-full px-4 py-3 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white text-base placeholder-[#475569] focus:outline-none focus:border-amber-500 transition-colors resize-y"
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
      >
        {busy ? 'Checking…' : 'Check'}
      </button>

      {meaning && result && (
        <div
          role="status"
          data-testid="check-result"
          className={`rounded-lg border bg-[#0f172a] p-4 space-y-1 ${meaning.tone}`}
        >
          <p className="text-2xl font-bold" data-testid="check-label">
            {meaning.title}
          </p>
          <p className="text-[#cbd5e1]">{meaning.body}</p>
          <p className="text-xs text-[#475569]">Answered in {result.ms} ms.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400" data-testid="check-error">
          {error}
        </p>
      )}
    </form>
  );
}
