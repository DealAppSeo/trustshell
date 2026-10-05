import type { CheckSample } from './check-sample';

/**
 * The home page's samples: sentences a stranger was about to believe, not a lab fixture.
 * "The Eiffel Tower is in Berlin" proved the checker can tell cities apart. It did not show why
 * anyone would open it. These are the traps people actually fall into (Grok and Sean, 2026-10-05).
 *
 * MEASURED 2026-10-05. Each sentence was sent to production POST /api/v1/classify three times,
 * one call per 20 seconds. A why is kept only when that label came back on every call:
 * the speed trap and the test result came back veto, so they keep one.
 * The missing dollar and the 40 mph sentence came back not-checked, so they keep none.
 * The opinion came back not-checked and never had one.
 * Two famous traps stay off this page ("you should always switch doors", "the Tuesday-boy
 * answer is 13/27"). They are underspecified, and they live in examples/traps for builders.
 *
 * `why` is shown ONLY when the live checkers return `why.when` for exactly that sentence
 * (CheckForm). An explanation the checkers did not back is not stored here.
 *
 * Nothing is sent on load or on a swap: a request happens only when the visitor clicks Check.
 */
export const SPEED_TRAP =
  'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph.';

export const HOME_SAMPLES: readonly CheckSample[] = [
  {
    label: 'a speed trap',
    text: SPEED_TRAP,
    why: {
      when: 'veto',
      text: 'Out at 30 mph takes 2 hours and back at 60 mph takes 1: 120 miles in 3 hours is 40 mph.',
    },
  },
  {
    label: 'the missing dollar',
    text: 'Three guests paid $9 each, $27 in total, and the bellhop kept $2, so one dollar of the original $30 is missing.',
  },
  {
    label: 'a test result',
    text: 'If a disease affects 1% of people and a test for it is 99% accurate, a positive result means you almost certainly have the disease.',
    why: {
      when: 'veto',
      text: 'With 1 in 100 people sick, a 99% test flags about as many healthy people as sick ones, so a positive means about a 50% chance. A textbook rate problem, not medical advice.',
    },
  },
  {
    label: 'the 40 mph line',
    text: 'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 40 mph.',
  },
  {
    label: 'an opinion',
    text: 'Pizza is the best food.',
  },
];
