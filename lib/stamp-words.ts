import type { ClaimLabel } from '../src/lib/claim';

/**
 * The words a stranger reads for each label: the same words the extension stamp shows. One source for
 * the live check (app/check/CheckForm.tsx) and the home page's recorded result card
 * (components/hero-result.tsx), so the two cannot drift. Plain data, so a server component can read it:
 * a value imported from a 'use client' module is a client reference on the server, not the value.
 *
 * The lines name no voter: a whole-text equation is checked by exact calculation before any model is
 * asked (repid-engine src/routes/classify.ts), and an over-long text is not sent to them at all. So each
 * line is true on every path. `icon` carries the meaning without colour (WCAG 1.4.1).
 */
export const MEANING: Record<ClaimLabel, { title: string; body: string; tone: string; icon: string }> = {
  pass: {
    title: 'Checks out',
    body: 'Checked and found true.',
    tone: 'text-emerald-400 border-emerald-500/40',
    icon: '✓',
  },
  veto: {
    title: 'Caught',
    body: 'Checked and found false. Do not rely on it.',
    tone: 'text-red-400 border-red-500/40',
    icon: '✗',
  },
  'not-checked': {
    title: 'Not checked',
    body: 'Not decided. Opinions and predictions land here, and so does a check that could not finish. Not checked never means it checks out.',
    tone: 'text-amber-400 border-amber-500/40',
    icon: '?',
  },
};
