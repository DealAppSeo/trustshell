'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MEANING } from '@/lib/stamp-words';
import { POOL, judge, pickRound, resultLine, score, shareText, type Guess, type PoolItem } from '@/lib/spot-the-lie';

/**
 * "Can you spot the AI's lie?" See lib/spot-the-lie.ts for why it is a game, why nothing is live, and why it
 * scores the player and never the checkers.
 *
 * NOTHING IS SENT. No fetch, no beacon, no script: the page still sends nothing on load or on play
 * (tests/spot-the-lie.test.ts and tests/e2e/spot-the-lie-walk.mjs hold it). The only storage is the
 * player's own best score, on this device, in a try/catch.
 *
 * THE FIVE CARDS ARE CHOSEN IN THE CLICK, not at render, so the server and the browser draw the same intro
 * and there is no hydration mismatch. Server HTML is the intro and a Play button.
 */
const ROUND = 5;
const BEST_KEY = 'trustshell_spot_the_lie_best_v1';

const readBest = (): number | null => {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeBest = (n: number) => {
  try {
    window.localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* private mode: the game works the same without it */
  }
};

const GUESSES: { guess: Guess; label: string; className: string }[] = [
  { guess: 'true', label: 'True', className: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10' },
  { guess: 'lie', label: 'A lie', className: 'border-red-500/50 text-red-300 hover:bg-red-500/10' },
  { guess: 'unsure', label: 'Can’t tell', className: 'border-amber-500/50 text-amber-300 hover:bg-amber-500/10' },
];

export function SpotTheLie() {
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const [items, setItems] = useState<PoolItem[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [shown, setShown] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const [line, setLine] = useState('');
  const [shareNote, setShareNote] = useState('');
  const revealRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);

  const i = guesses.length - (shown ? 1 : 0);
  const item = items[i];

  useEffect(() => {
    if (phase === 'play' && shown) revealRef.current?.focus();
    if (phase === 'play' && !shown) statementRef.current?.focus();
  }, [phase, shown, i]);

  const start = () => {
    setItems(pickRound(POOL, ROUND, Math.random));
    setGuesses([]);
    setShown(false);
    setShareNote('');
    setPhase('play');
  };

  const pick = (g: Guess) => {
    setGuesses((prev) => [...prev, g]);
    setShown(true);
  };

  const next = () => {
    if (guesses.length >= items.length) {
      const points = score(items, guesses);
      const prev = readBest();
      if (prev === null || points > prev) writeBest(points);
      setBest(prev === null || points > prev ? points : prev);
      setLine(resultLine(points, items.length, Math.random));
      setPhase('done');
      return;
    }
    setShown(false);
  };

  const share = async () => {
    const text = shareText(score(items, guesses), items.length, window.location.origin);
    try {
      // The share sheet only on a touch device. Desktop Chromium also has navigator.share, and there it opens
      // an OS dialog nobody asked for (and never answers in a headless browser): a copy is what a desktop
      // visitor expects. Closing the sheet is not a failure, so it says nothing.
      if (navigator.maxTouchPoints > 0 && typeof navigator.share === 'function') {
        try {
          await navigator.share({ text });
          return;
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(text);
      setShareNote('Copied. Paste it anywhere.');
    } catch {
      setShareNote('Could not copy. Select the text and copy it yourself.');
    }
  };

  const panel = 'min-w-0 rounded-2xl border border-slate-700 bg-[#0f172a] p-5 sm:p-6 text-left space-y-4';

  if (phase === 'intro') {
    return (
      <section aria-labelledby="stl-title" data-testid="spot-the-lie" data-phase="intro" className={panel}>
        <p id="stl-title" className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          A game · nothing is sent
        </p>
        <p className="text-lg text-white">
          Five AI answers. Some are true, some are wrong, and none of them sound any different.
        </p>
        <button
          type="button"
          onClick={start}
          data-testid="stl-play"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
        >
          Play
        </button>
      </section>
    );
  }

  if (phase === 'done') {
    const points = score(items, guesses);
    return (
      <section aria-labelledby="stl-title" data-testid="spot-the-lie" data-phase="done" className={panel}>
        <p id="stl-title" className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          Your round
        </p>
        <p className="text-4xl font-extrabold text-white" data-testid="stl-score">
          {points} of {items.length}
        </p>
        <p className="text-lg text-slate-200" data-testid="stl-line">
          {line}
        </p>
        {best !== null && <p className="text-sm text-[#94a3b8]">Your best on this device: {best} of {ROUND}.</p>}
        <p className="text-slate-300">
          Now the one that matters: paste something an AI told <em>you</em>.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/check"
            prefetch={false}
            data-testid="stl-check-own"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
          >
            Check your own answer
          </Link>
          <button
            type="button"
            onClick={share}
            data-testid="stl-share"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
          >
            Challenge a friend
          </button>
          <button
            type="button"
            onClick={start}
            data-testid="stl-again"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
          >
            Play again
          </button>
        </div>
        <p aria-live="polite" className="min-h-5 text-sm text-[#94a3b8]" data-testid="stl-share-note">
          {shareNote}
        </p>
      </section>
    );
  }

  // phase === 'play'
  const verdict = shown ? judge(item, guesses[i]) : null;
  const m = MEANING[item.checkers.label];
  return (
    <section aria-labelledby="stl-title" data-testid="spot-the-lie" data-phase="play" className={panel}>
      <p id="stl-title" className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
        Round {i + 1} of {items.length} · {item.label}
      </p>
      <div className="space-y-1">
        <p className="text-sm text-[#94a3b8]">An AI said:</p>
        <p ref={statementRef} tabIndex={-1} className="text-lg sm:text-xl text-white outline-none" data-testid="stl-statement">
          “{item.text}”
        </p>
      </div>

      {!shown && (
        <div className="flex flex-wrap gap-3" role="group" aria-label="Your guess">
          {GUESSES.map((g) => (
            <button
              key={g.guess}
              type="button"
              onClick={() => pick(g.guess)}
              data-testid={`stl-${g.guess}`}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg border bg-transparent px-6 py-3 text-base font-bold ${g.className}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div ref={revealRef} tabIndex={-1} aria-live="polite" className="outline-none" data-testid="stl-reveal">
        {shown && verdict && (
          <div className="space-y-3 motion-safe:transition-opacity">
            <p
              className={`text-2xl font-bold ${verdict === 'right' ? 'text-emerald-400' : verdict === 'honest' ? 'text-amber-400' : 'text-red-400'}`}
              data-testid="stl-verdict"
              data-verdict={verdict}
            >
              {verdict === 'right' ? '✓ You got it.' : verdict === 'honest' ? '? Same answer as the checkers.' : '✗ Not this time.'}
            </p>
            <p className="text-white">
              <strong>{item.truth === 'true' ? 'This one is true.' : 'This one is a lie.'}</strong> {item.why}
              {item.source && (
                <>
                  {' '}
                  <a href={item.source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-amber-300">
                    {item.source.name}
                  </a>
                  .
                </>
              )}
            </p>
            <p className={`rounded-lg border px-3 py-2 text-sm ${m.tone}`} data-testid="stl-checkers">
              <span aria-hidden="true">{m.icon}</span> The two checkers said <strong>{m.title}</strong>
              <span className="text-slate-300">
                {' '}
                ({item.checkers.times} of {item.checkers.of} recorded runs, {item.checkers.on}).{' '}
              </span>
              <a href={item.checkers.record} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                See the runs
              </a>
            </p>
            <button
              type="button"
              onClick={next}
              data-testid="stl-next"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
            >
              {guesses.length >= items.length ? 'See my score' : 'Next answer'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
