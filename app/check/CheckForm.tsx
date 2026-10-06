'use client';

import { useRef, useState } from 'react';
import { classifyClaim, DEFAULT_API_URL, ClaimError, SCRUBBED_LINE, ANSWER_MAX_CHARS, pathLine, voterNames, votesLine, withAnswer, type ClaimLabel, type ClaimPath, type ClaimVote } from '@/src/lib/claim';

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

/**
 * While a check runs. It used to say "Checking with Groq and Cerebras…", which was wrong whenever a
 * backup took a turn (the checker pool, 2026-10-05). The engine asks its two checkers in parallel
 * (repid-engine src/classify/free-votes.ts, Promise.all over the pair), so "at once" is what happens.
 * One exception, said by the answer itself: a whole-text equation is settled by exact calculation
 * and no checker is asked, and its line then reads "Decided by exact calculation. No model was asked."
 * Nothing is staged: this shows for exactly as long as the request is in flight.
 */
const BUSY_LINE = 'Asking two checkers at once…';

type LocalCause = 'limit' | 'timeout' | 'network' | 'http' | 'body' | 'unknown';

const LOCAL_LINE: Record<LocalCause, string> = {
  // 429: the per-minute limit, or the free checks for today (repid-engine's daily cap per visitor).
  limit: 'Too many checks from this connection for now. Try again later.',
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
  if (/\bHTTP 429\b/.test(reason)) return 'limit';
  if (/no answer within|time ?out|timed out/i.test(reason)) return 'timeout';
  if (/network|no fetch|failed to fetch/i.test(reason)) return 'network';
  if (/\bHTTP\b/i.test(reason)) return 'http';
  if (/body|json|contract|label/i.test(reason)) return 'body';
  return 'unknown';
}

/** A sentence the visitor can put in the box with one tap. `label` is the button text. */
export type { CheckSample } from '@/lib/check-sample';
import type { CheckSample } from '@/lib/check-sample';

type CheckFormProps = {
  /** What the box starts with. Prefill only: nothing is sent until the visitor clicks Check. */
  initialText?: string;
  /**
   * The home page's cards (Try to trick it). Picking one puts it in the box AND checks it: the
   * click is the person's, the same as clicking Check. Nothing is sent on load.
   */
  samples?: readonly CheckSample[];
  /** The box's label. /check keeps "One sentence". */
  boxLabel?: string;
};

type Result = {
  label: ClaimLabel;
  reason?: string;
  scrubbed?: boolean;
  by?: ClaimPath;
  voters?: string[];
  deciders?: string[];
  /** What each of the two deciders said, when the engine sent it. */
  votes?: ClaimVote[];
  /** The engine's own time for this check, or this page's wait when it decided locally. */
  latency_ms: number;
  /** The exact text that was sent, so a sample's explanation is matched to what was checked. */
  asked: string;
  /** The one clarifying question, when the endpoint asked it. */
  question?: string;
  /** When the answer arrived, by this browser's clock. */
  at: number;
};

/**
 * What happened, step by step, from the response's own fields and nothing else: who the sentence
 * was sent to, whether a backup stood in (more voters than the two that decided), and how long the
 * engine took. No step is staged or delayed for effect; they appear together when the answer does.
 */
function stepsOf(r: Result): string[] {
  const out: string[] = [];
  if (r.by === 'votes' && r.voters && r.voters.length > 0) {
    out.push(`Sent to ${voterNames(r.voters)}.`);
    if (r.voters.length > 2) out.push('One of them could not answer, so a backup took its turn.');
  }
  if (r.by === 'votes' || r.by === 'arithmetic') out.push(`Answered in ${(r.latency_ms / 1000).toFixed(1)} s.`);
  return out;
}

/**
 * One line about what the visitor just did, from this page's memory of their last check and nothing
 * else: no location, no cookie, nothing stored. Same sentence again shows the answer is not a coin
 * toss (or honestly says when it changed); an edited sentence whose answer changed says so.
 */
function reactionOf(prev: { asked: string; label: ClaimLabel } | null, r: Result): string {
  if (!prev) return '';
  const same = prev.asked.trim() === r.asked.trim();
  if (same) return prev.label === r.label ? 'Checked again from scratch: the same answer.' : 'Checked again from scratch: a different answer this time.';
  if (prev.label !== r.label) return 'You changed the sentence, and the answer changed with it.';
  return '';
}

/** Exactly the fields this page read from the engine's answer, as it sent them. */
function engineAnswer(r: Result): Record<string, unknown> {
  const out: Record<string, unknown> = { label: r.label, latency_ms: r.latency_ms };
  if (r.by) out.by = r.by;
  if (r.voters) out.voters = r.voters;
  if (r.deciders) out.deciders = r.deciders;
  if (r.votes) out.votes = r.votes;
  if (r.question) out.question = r.question;
  return out;
}

/** A public GitHub issue, prefilled so the person sees exactly what would be posted, and can edit it. */
function reportUrl(r: Result, title: string, path: string): string {
  const body = [`Sentence: ${r.asked.slice(0, 1500)}`, `Stamp: ${title} (${r.label})`, path ? `What produced it: ${path}` : '', '', 'Why I think it is wrong:', ''].filter((l, i) => l !== '' || i > 2).join('\n');
  return `https://github.com/DealAppSeo/trustshell/issues/new?title=${encodeURIComponent(`Stamp looks wrong: ${title}`)}&body=${encodeURIComponent(body)}`;
}

/**
 * With no props this is exactly the /check form. The home page passes three cards.
 *
 * NOTHING HERE SENDS ON ITS OWN. There is no effect and no auto-submit: classifyClaim runs only in
 * check(), and check() is reached only from a person's click: Check, a card, or Check again after
 * they answer the one question. A page load or a crawler sends nothing.
 */
export default function CheckForm({ initialText = '', samples, boxLabel = 'One sentence' }: CheckFormProps = {}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [previous, setPrevious] = useState<{ asked: string; label: ClaimLabel } | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The answer that was last brought into view, so a re-render (typing an answer) never scrolls again.
  const shownAt = useRef(0);

  /**
   * On a phone the cards stack above the box, so an answer to a card lands screens below the tap.
   * Each new answer is brought into view once, when it appears: after a person's click, never on load.
   */
  function reveal(el: HTMLDivElement | null) {
    if (!el || !result || shownAt.current === result.at || typeof el.scrollIntoView !== 'function') return;
    shownAt.current = result.at;
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  }

  async function check(sentence: string) {
    // The answer on screen becomes "your last check", so the next one can be compared with it.
    if (result && !result.reason) setPrevious({ asked: result.asked, label: result.label });
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const r = await classifyClaim(sentence, { apiUrl: ENGINE, env: {} });
      setResult({
        label: r.label,
        reason: r.reason,
        scrubbed: r.scrubbed === true,
        by: r.by,
        voters: r.voters,
        deciders: r.deciders,
        votes: r.votes,
        latency_ms: r.latency_ms,
        asked: sentence,
        question: r.question,
        at: Date.now(),
      });
      setAnswer('');
    } catch (err) {
      setError(err instanceof ClaimError ? err.message : 'Something went wrong before the sentence was sent.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void check(text);
  }

  // A card is a person's click: it fills the box and checks exactly what it shows.
  function pick(sample: CheckSample) {
    setText(sample.text);
    void check(sample.text);
  }

  // The adaptive step: the checkers asked one question, the person answered, and the claim with
  // that answer is checked again. Sends only on this click (or Enter in the answer box).
  function recheck() {
    if (!result?.question) return;
    let combined: string;
    try {
      combined = withAnswer(result.asked, answer);
    } catch (err) {
      setError(err instanceof ClaimError ? err.message : 'Something went wrong before the sentence was sent.');
      return;
    }
    setText(combined);
    void check(combined);
  }

  const meaning = result ? MEANING[result.label] : null;
  // A reason exists only when the page decided not-checked locally; a pass or veto never has one.
  const cause = result && result.label === 'not-checked' && result.reason ? localCause(result.reason) : null;
  // What produced the label, when the endpoint said so. Never shown for a not-checked this page decided.
  // Each checker's own word when the engine sent it ("Groq said false. Cerebras said false."), so a
  // disagreement says who said what; else the older line, which names them only when they agreed.
  const path = result && !cause ? votesLine(result.votes) || pathLine(result) : '';
  // A sample's explanation, only when the checkers agreed with it on exactly that sentence.
  const sample = result ? samples?.find((s) => s.text.trim() === result.asked.trim()) : undefined;
  const why = result && !cause && sample?.why && sample.why.when === result.label ? sample.why.text : '';
  // The runs that put this card on the page, next to today's answer whatever it is, so a card whose
  // answer has moved since says so instead of quietly turning into a fixture (lib/check-sample.ts).
  const measured = result ? sample?.measured : undefined;
  const steps = result && !cause ? stepsOf(result) : [];
  const reaction = result && !cause ? reactionOf(previous, result) : '';

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="check-form">
      {samples && samples.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3" data-testid="check-cards">
          {samples.map((s) => (
            <li key={s.text}>
              <button
                type="button"
                onClick={() => pick(s)}
                disabled={busy}
                aria-pressed={result?.asked === s.text}
                data-testid="check-card"
                data-sample={s.text}
                className="flex h-full w-full flex-col justify-between rounded-xl border border-[#1e293b] bg-[#0f172a] p-4 text-left hover:border-amber-500 aria-pressed:border-amber-500 disabled:opacity-60 transition-colors"
              >
                <span className="block text-sm font-semibold text-amber-400">{s.label}</span>
                <span className="mt-2 block text-sm text-[#e2e8f0]">{s.text}</span>
                <span className="mt-3 block text-xs font-semibold text-[#94a3b8]">Check this one</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="claim" className="block text-sm font-medium text-[#94a3b8]">
        {boxLabel}
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
      <p id="check-privacy" className="text-sm text-[#94a3b8]">
        What you type is sent to our checkers, Groq and Cerebras. If one cannot answer, a backup checker takes its turn: Cloudflare Workers AI (Llama), or another listed in our privacy policy. It is not stored. Do not paste anything private.
      </p>
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
      >
        {busy ? BUSY_LINE : 'Check'}
      </button>

      {meaning && result && (
        <div
          ref={reveal}
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
          {why && (
            <p className="text-[#cbd5e1]" data-testid="check-why-sample">
              {why}
            </p>
          )}
          {measured && (
            <p className="text-sm text-[#94a3b8]" data-testid="check-measured">
              When we measured this sentence on {measured.on}, it came back {MEANING[measured.label].title}{' '}
              {measured.times} times out of {measured.of}.{' '}
              <a href={measured.record} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                See every run
              </a>
              .
            </p>
          )}
          {steps.length > 0 && (
            <ol className="pt-1 space-y-0.5 text-sm text-[#94a3b8]" data-testid="check-steps">
              {steps.map((step) => (
                <li key={step}>
                  <span aria-hidden="true">✓ </span>
                  {step}
                </li>
              ))}
            </ol>
          )}
          {path && (
            <p className="text-sm text-[#94a3b8]" data-testid="check-path" data-by={result.by}>
              {path}
            </p>
          )}
          {reaction && (
            <p className="text-sm text-[#cbd5e1]" data-testid="check-reaction">
              {reaction}
            </p>
          )}
          {result.question && !cause && (
            <div className="pt-2 space-y-2" data-testid="check-question">
              <p className="text-sm text-[#cbd5e1]">
                <span className="font-semibold">One question:</span> {result.question}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  aria-label="Your answer"
                  data-testid="check-answer"
                  value={answer}
                  maxLength={ANSWER_MAX_CHARS}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      recheck();
                    }
                  }}
                  className="flex-1 min-w-0 px-3 py-2 bg-[#0b1220] border border-[#1e293b] rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  data-testid="check-again"
                  onClick={() => recheck()}
                  disabled={busy || !answer.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg"
                >
                  Check again
                </button>
              </div>
            </div>
          )}
          {result.scrubbed && (
            <p className="text-sm text-[#94a3b8]" data-testid="check-scrubbed">
              {SCRUBBED_LINE}
            </p>
          )}
          {!cause && (
            <p className="text-xs text-[#64748b]" data-testid="check-at">
              Checked at {new Date(result.at).toLocaleTimeString()}, live.
            </p>
          )}
          {!cause && (
            <details className="pt-1 text-xs text-[#64748b]" data-testid="check-raw">
              <summary className="cursor-pointer">What the engine answered</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-[#0b1220] p-3 text-[#cbd5e1]">{JSON.stringify(engineAnswer(result), null, 2)}</pre>
            </details>
          )}
          {!cause && (result.label === 'pass' || result.label === 'veto') && (
            <p className="text-xs text-[#64748b]">
              <a
                href={reportUrl(result, meaning.title, path)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="check-report"
                className="underline underline-offset-4 hover:text-white"
              >
                Think it got this wrong? Tell us
              </a>{' '}
              (opens a public GitHub issue you can edit before posting).
            </p>
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
