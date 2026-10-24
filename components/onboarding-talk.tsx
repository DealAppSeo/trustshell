'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  DISCLOSURE, EMPTY, EXPIRY_DAYS, NOT_ON_MENU, bookFrom, hueOf, lesson, parseStored, pickNext, quoteFor, reflect, roleFromAnswer,
  tintCss, toExport, type Profile, type Question, type QuestionId,
} from '@/lib/onboarding-talk';

/**
 * The conversation after a check (onboarding v0, SHADOW). See lib/onboarding-talk.ts for what it is, why it is
 * a script, and what the research changed. This file is only the screen.
 *
 * NOTHING IS SENT. There is no fetch, no beacon and no script here (tests/onboarding-talk.test.ts scans the
 * source; tests/e2e/onboarding-talk-walk.mjs watches the network through a whole conversation).
 *
 * SESSION-ONLY BY DEFAULT. The answers live in this component's state and are gone when the tab is. Nothing
 * touches localStorage until the person clicks "Keep this on this device", and then only one key, with a date,
 * for EXPIRY_DAYS. Download is a file the person asks for. Delete removes the key and everything on screen.
 *
 * THE FIRST THING ON SCREEN IS A YES OR NO, with the disclosure. Nothing is asked until the person says yes, each
 * question says why it is asked, and Skip is a button as big as Send.
 *
 * THE TINT is a fixed, click-through layer at 8% over the page, so the text colors are untouched and their
 * contrast cannot drop below what a test measures for every hue. Undo is one click and forgets the color.
 */
const KEY = 'trustshell_onboarding_v1';

const readKept = (): Profile => {
  try {
    return parseStored(window.localStorage.getItem(KEY));
  } catch {
    return EMPTY;
  }
};
const writeKept = (p: Profile): boolean => {
  try {
    window.localStorage.setItem(KEY, toExport({ ...p, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false; // private mode: the conversation works the same, it just cannot be kept
  }
};
const removeKept = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to remove */
  }
};

const ACK = ['Got it.', 'Thanks.', 'Noted.', 'Good to know.'];
const EXPERIENCE: Record<string, Profile['experience']> = { 'just starting': 'new', some: 'some', 'every day': 'daily' };
const btn = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-base font-semibold text-white hover:bg-slate-800';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-500 px-5 py-2 text-base font-semibold text-slate-950 hover:bg-emerald-400';

type Line = { from: 'guide' | 'you'; text: string };
type Phase = 'invite' | 'declined' | 'talking' | 'done';

export function OnboardingTalk() {
  const [phase, setPhase] = useState<Phase>('invite');
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [asked, setAsked] = useState<QuestionId[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [hue, setHue] = useState<number | null>(null);
  const [lastKind, setLastKind] = useState<'core' | 'delight' | null>(null);
  const [keepGoing, setKeepGoing] = useState(false);
  const [kept, setKept] = useState(false);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // A visitor who chose to keep their answers sees them again, and the tint they chose, only after this loads.
  useEffect(() => {
    const p = readKept();
    if (Object.keys(p).some((k) => k !== 'v' && k !== 'savedAt')) {
      setProfile(p);
      setHue(p.color ? hueOf(p.color) : null);
      setKept(true);
      setPhase('done');
    }
  }, []);

  useEffect(() => {
    if (phase === 'talking') input.current?.focus();
  }, [current, phase]);

  const say = (l: Line[]) => setLines((prev) => [...prev, ...l]);

  function next(p: Profile, a: QuestionId[], kind: 'core' | 'delight' | null, more: boolean) {
    const q = pickNext({ asked: a, lastKind: kind }, p, Math.random, more);
    if (q) {
      setCurrent(q);
      say([{ from: 'guide', text: q.text }]);
    } else {
      setCurrent(null);
      setPhase('done');
    }
  }

  function start() {
    setPhase('talking');
    next(profile, [], null, false);
  }

  function answer(raw: string | null) {
    if (!current) return;
    const a = raw?.trim() ?? '';
    const skipped = raw === null || a === '';
    const p: Profile = { ...profile };
    const extra: Line[] = [];
    if (!skipped) {
      if (current.id === 'job') p.job = a;
      else if (current.id === 'role') p.role = roleFromAnswer(a);
      else if (current.id === 'tools') p.tools = a;
      else if (current.id === 'wish') p.wish = a;
      else if (current.id === 'experience') p.experience = EXPERIENCE[a.toLowerCase()];
      else if (current.id === 'color') {
        const h = hueOf(a);
        if (h === null) extra.push({ from: 'guide', text: `I do not know "${a}" as a color, so I left the page alone and did not keep it.` });
        else {
          p.color = a;
          setHue(h);
          extra.push({ from: 'guide', text: `I tinted the page a little toward ${a}. You can undo it below.` });
        }
      } else if (current.id === 'book') {
        const work = bookFrom(a);
        if (work) p.book = work;
        else extra.push({ from: 'guide', text: NOT_ON_MENU });
      }
      setProfile(p);
      if (kept) writeKept(p);
    }
    const ack = extra.length ? [] : skipped ? [{ from: 'guide' as const, text: 'Skipped.' }] : [{ from: 'guide' as const, text: ACK[Math.floor(Math.random() * ACK.length)] }];
    say([{ from: 'you', text: skipped ? '(skipped)' : a }, ...ack, ...extra]);
    setDraft('');
    const nextAsked = [...asked, current.id];
    setAsked(nextAsked);
    setLastKind(current.kind);
    next(p, nextAsked, current.kind, keepGoing);
  }

  function more() {
    setKeepGoing(true);
    setPhase('talking');
    next(profile, asked, lastKind, true);
  }

  function keep() {
    const ok = writeKept(profile);
    setKept(ok);
    setNote(ok ? `Saved on this device. It expires in ${EXPIRY_DAYS} days, and Delete removes it now.` : 'This browser would not let me save it, so nothing was kept.');
  }

  function download() {
    const url = URL.createObjectURL(new Blob([toExport(profile)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trustshell-how-i-work.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Undoing the tint also forgets the color, so it does not come back on the next visit.
  function undoTint() {
    const p: Profile = { ...profile };
    delete p.color;
    setProfile(p);
    setHue(null);
    if (kept) writeKept(p);
  }

  function deleteAll() {
    removeKept();
    setProfile(EMPTY);
    setAsked([]);
    setLines([]);
    setCurrent(null);
    setHue(null);
    setLastKind(null);
    setKeepGoing(false);
    setKept(false);
    setNote('');
    setPhase('invite');
  }

  const tint = hue !== null && (
    <div aria-hidden="true" data-testid="talk-tint" className="pointer-events-none fixed inset-0 z-40 motion-safe:transition-colors motion-safe:duration-1000" style={{ backgroundColor: tintCss(hue) }} />
  );

  if (phase === 'declined') return <>{tint}</>;

  const card = 'space-y-3 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5 text-left';

  if (phase === 'invite') {
    return (
      <section aria-labelledby="talk-h" className={card} data-testid="talk" data-phase="invite">
        {tint}
        <h3 id="talk-h" className="text-lg font-bold text-white">
          Want the next check to fit how you work?
        </h3>
        <p className="text-sm text-[#cbd5e1]" data-testid="talk-disclosure">
          {DISCLOSURE}
        </p>
        <p className="text-sm text-[#cbd5e1]">It is two or three quick questions, and your check above does not depend on them.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={start} data-testid="talk-yes" className={primary}>
            Yes, ask me
          </button>
          <button type="button" onClick={() => setPhase('declined')} data-testid="talk-no" className={btn}>
            No thanks
          </button>
        </div>
      </section>
    );
  }

  const step = lesson(profile);
  const quote = quoteFor(profile.book);
  const hasAnswers = Object.keys(profile).some((k) => k !== 'v' && k !== 'savedAt');

  return (
    <section aria-labelledby="talk-h" className={card} data-testid="talk" data-phase={phase}>
      {tint}
      <h3 id="talk-h" className="text-lg font-bold text-white">
        {phase === 'done' ? 'What I heard' : 'A few quick questions'}
      </h3>
      <ol role="log" aria-live="polite" aria-label="Conversation" className="space-y-2 text-sm" data-testid="talk-log">
        {lines.map((l, i) => (
          <li key={i} className={l.from === 'you' ? 'text-right text-[#e2e8f0]' : 'text-[#cbd5e1]'}>
            <span className="sr-only">{l.from === 'you' ? 'You: ' : 'Guide: '}</span>
            {l.text}
          </li>
        ))}
      </ol>

      {phase === 'talking' && current && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            answer(draft);
          }}
          className="space-y-3"
          data-testid="talk-form"
        >
          <p className="text-xs text-[#cbd5e1]" data-testid="talk-why">
            Why I ask: {current.why}
          </p>
          {current.options && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick answers">
              {current.options.map((o) => (
                <button key={o} type="button" onClick={() => answer(o)} data-testid="talk-option" className={btn}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="talk-answer" className="sr-only">
              Your answer
            </label>
            <input
              id="talk-answer"
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={current.placeholder ?? 'Type here'}
              maxLength={120}
              autoComplete="off"
              data-testid="talk-input"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white placeholder:text-slate-400"
            />
            {current.id === 'color' && (
              <input
                type="color"
                aria-label="Pick a color"
                onChange={(e) => setDraft(e.target.value)}
                data-testid="talk-color"
                className="h-11 w-11 cursor-pointer rounded-lg border border-slate-600 bg-slate-950 p-1"
              />
            )}
            <button type="submit" data-testid="talk-send" className={primary}>
              Send
            </button>
            <button type="button" onClick={() => answer(null)} data-testid="talk-skip" className={btn}>
              Skip this one
            </button>
          </div>
          <button type="button" onClick={() => { setCurrent(null); setPhase('done'); }} data-testid="talk-enough" className="inline-flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-4 hover:text-white">
            That is enough
          </button>
        </form>
      )}

      {phase === 'done' && (
        <div className="space-y-3" data-testid="talk-done">
          <p className="text-sm text-[#e2e8f0]" data-testid="talk-reflect">
            {reflect(profile)}
          </p>
          {quote && (
            <p className="text-sm text-[#cbd5e1]" data-testid="talk-quote">
              A line from {quote.work} ({quote.where}, public domain): <q>{quote.line}</q>{' '}
              <a href={quote.source} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline underline-offset-4">
                source: {quote.author} on Project Gutenberg
              </a>
            </p>
          )}
          <p className="text-sm text-[#cbd5e1]" data-testid="talk-lesson">
            {step.text}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={step.href} data-testid="talk-next" className={primary}>
              {step.cta}
            </Link>
            {hasAnswers && !kept && (
              <button type="button" onClick={keep} data-testid="talk-keep" className={btn}>
                Keep this on this device
              </button>
            )}
            {hasAnswers && (
              <button type="button" onClick={download} data-testid="talk-download" className={btn}>
                Download what you told me
              </button>
            )}
          </div>
          <p role="status" className="min-h-5 text-sm text-[#cbd5e1]" data-testid="talk-note">
            {note || (kept ? `Kept on this device for up to ${EXPIRY_DAYS} days.` : hasAnswers ? 'Not kept: it goes when you close this tab.' : '')}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {asked.length > 0 && !keepGoing && (
              <button type="button" onClick={more} data-testid="talk-more" className="inline-flex min-h-11 items-center text-slate-300 underline underline-offset-4 hover:text-white">
                Ask me a couple more
              </button>
            )}
            {hue !== null && (
              <button type="button" onClick={undoTint} data-testid="talk-undo-tint" className="inline-flex min-h-11 items-center text-slate-300 underline underline-offset-4 hover:text-white">
                Undo the tint
              </button>
            )}
            <button type="button" onClick={deleteAll} data-testid="talk-clear" className="inline-flex min-h-11 items-center text-slate-300 underline underline-offset-4 hover:text-white">
              Delete everything
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
