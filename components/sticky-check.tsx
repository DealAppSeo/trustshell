'use client';

import { useEffect, useState } from 'react';

/**
 * On a phone, once you have scrolled past the box, this stays at the bottom and jumps back to it.
 * It does not submit: a tap must not spend a check.
 *
 * HIDDEN WHILE THE HERO IS ON SCREEN (2026-10-16). It used to sit over the first screen, covering the
 * last line of the result legend at 375px. Now it appears only while neither the legend nor the box is
 * in view, so it never covers either and never doubles the hero's own button. It observes; it sends
 * nothing. Server-rendered invisible, so without script there is simply no bar.
 */
export function StickyCheck() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = ['[data-testid="hero-legend"]', '#claim']
      .map((s) => document.querySelector(s))
      .filter((el): el is Element => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const inView = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) inView.set(e.target, e.isIntersecting);
      setShow(![...inView.values()].some(Boolean));
    });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <a
      href="#claim"
      data-testid="sticky-check"
      aria-hidden={!show}
      tabIndex={show ? undefined : -1}
      className={`sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 transition-transform duration-200 ${
        show ? 'translate-y-0' : 'invisible translate-y-full'
      }`}
    >
      <span className="flex w-full items-center justify-center rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-black">
        Check
      </span>
    </a>
  );
}
