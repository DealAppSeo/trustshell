'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Plays a chart once, when it scrolls into view. The server renders the final state, so with no
 * script, no IntersectionObserver or prefers-reduced-motion the chart is simply drawn. On mount a
 * chart that is still below the fold is "armed" (its bars collapse, off screen, so nothing visibly
 * jumps) and plays on entry; one already on screen is left as it is. The CSS lives in globals.css.
 */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'rest' | 'armed' | 'play'>('rest');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('armed');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('play');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={state} className={className}>
      {children}
    </div>
  );
}
