'use client';

import { useState } from 'react';
import { classifyClaim, DEFAULT_API_URL, ClaimError, type ClaimLabel } from '@/src/lib/claim';

// NEXT_PUBLIC_* is inlined only for a literal reference, so it is spelled out here.
const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || DEFAULT_API_URL;
// The route reads at most this much prose (repid-engine DEFAULT_MAX_PROSE_CHARS).
const MAX_CHARS = 1500;

// The words a stranger reads are the same words the extension stamp shows. The machine label
// (pass / veto / not-checked) stays on the page, in the title and the small "label" line, for
// anyone comparing with the CLI or the API. The lines name no voter: a whole-text equation is
// checked by exact calculation before any model is asked (repid-engine src/routes/classify.ts),
// and an over-long text is not sent to them at all, and the response does not say which path
// answered. So each line below is true on every path.
const MEANING: Record<ClaimLabel, { title: string; body: string; tone: string }> = {
  pass: {
    title: 'Checks out',
    body: 'Checked and found true.',
    tone: 'text-emerald-400 border-emerald-500/40',
  },
  veto: {
    title: 'Caught',
    body: 'Checked and found false. Do not rely on it.',
    tone: 'text-red-400 border-red-500/40',
  },
  'not-checked': {
    title: 'Not checked',
    body: 'Not decided. Opinions and predictions land here, and so does a check that could not finish. Not checked never means it checks out.',
    tone: 'text-amber-400 border-amber-500/40',
  },
};

type LocalCause = 'timeout' | 'network' | 'http' | 'body' | 'unknown';

const LOCAL_LINE: Record<LocalCause, string> = {
  timeout: 'No answer in time.',
  network: 'The network request failed.',
  http: 'The check service answered with an error.',
  body: 'The check service sent an answer we could not read.',
  unknown: 'No usable answer came back.',
};

/**
 * classifyClaim sets `reason` ONLY when this page decided not-checked itself, because the
 * service gave no usable answer. Say which, so "the network failed" and "the checkers could not
 * decide" never look the same. Matched loosely: src/lib/claim.ts owns the reason wording and may
 * reword it, and an unrecognised reason still gets a local line, never the checkers' wording.
 */
function localCause(reason: string): LocalCause {
  if (/no answer within|time ?out|timed out/i.test(reason)) return 'timeout';
  if (/network|no fetch|failed to fetch/i.test(reason)) return 'network';
  if (/\bHTTP\b/i.test(reason)) return 'http';
  if (/body|json|contract|label/i.test(reason)) return 'body';
  return 'unknown';
}

/** A sentence the visitor can put in the box with one tap. `label` is the button text. */
export type CheckSample = { label: string; text: string };

type CheckFormProps = {
  /** What the box starts with. Prefill only: nothing is sent until the visitor clicks Check. */
  initialText?: string;
  /** Sentences the visitor can swap into the box. Swapping only changes the box; it sends nothing. */
  samples?: readonly CheckSample[];
};

/**
 * With no props this is exactly the /check form. The home page passes a prefill and two samples.
 *
 * NOTHING HERE SENDS ON ITS OWN. There is no effect and no auto-submit: classifyClaim runs only in
 * onSubmit, i.e. when a person clicks Check. A prefilled box on the home page is read by every
 * crawler and every page load, and each of those would otherwise spend the shared checker budget.
 */
export default function CheckForm({ initialText = '', samples }: CheckFormProps = {}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ label: ClaimLabel; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Swapping a sample changes the box and nothing else: no request. The last answer belonged to
  // the other sentence, so it is cleared rather than left standing next to text it never judged.
  function swapIn(sample: string) {
    setText(sample);
    setResult(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const r = await classifyClaim(text, { apiUrl: ENGINE, env: {} });
      setResult({ label: r.label, reason: r.reason });
    } catch (err) {
      setError(err instanceof ClaimError ? err.message : 'Something went wrong before the sentence was sent.');
    } finally {
      setBusy(false);
    }
  }

  const meaning = result ? MEANING[result.label] : null;
  // A reason exists only when the page decided not-checked locally; a pass or veto never has one.
  const cause = result && result.label === 'not-checked' && result.reason ? localCause(result.reason) : null;

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
        aria-describedby="check-privacy"
        className="w-full px-4 py-3 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white text-base placeholder-[#475569] focus:outline-none focus:border-amber-500 transition-colors resize-y"
      />
      {samples && samples.length > 0 && (
        <p className="text-sm text-[#94a3b8]" data-testid="check-samples">
          Try a sample:{' '}
          {samples.map((s, i) => (
            <span key={s.text}>
              {i > 0 && ' or '}
              <button
                type="button"
                onClick={() => swapIn(s.text)}
                disabled={busy}
                aria-pressed={text === s.text}
                data-testid="check-sample"
                data-sample={s.text}
                className="underline underline-offset-4 text-[#cbd5e1] hover:text-white aria-pressed:text-amber-400 aria-pressed:no-underline disabled:opacity-50"
              >
                {s.label}
              </button>
            </span>
          ))}
        </p>
      )}
      <p id="check-privacy" className="text-sm text-[#94a3b8]">
        What you type is sent to our checkers, Groq and Cerebras. It is not stored. Do not paste anything private.
      </p>
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
      >
        {busy ? 'Checking with Groq and Cerebras…' : 'Check'}
      </button>

      {meaning && result && (
        <div
          role="status"
          data-testid="check-result"
          data-source={cause ? 'local' : 'checkers'}
          className={`rounded-lg border bg-[#0f172a] p-4 space-y-1 ${meaning.tone}`}
        >
          <p className="text-2xl font-bold" data-testid="check-label" data-label={result.label} title={result.label}>
            {meaning.title}
          </p>
          {cause ? (
            <p className="text-[#cbd5e1]" data-testid="check-why" data-cause={cause}>
              {LOCAL_LINE[cause]}
            </p>
          ) : (
            <p className="text-[#cbd5e1]">{meaning.body}</p>
          )}
          <p className="text-xs text-[#64748b]" data-testid="check-machine-label">
            label: <code>{result.label}</code>
          </p>
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
