import type { CheckSample } from './check-sample';

/**
 * The home page's samples: sentences a stranger was about to believe, not a lab fixture.
 * "The Eiffel Tower is in Berlin" proved the checker can tell cities apart. It did not show why
 * anyone would open it. These are the traps people actually fall into (Grok and Sean, 2026-10-05).
 *
 * MEASURED, not assumed: each sentence was sent to production POST /api/v1/classify three times on
 * 2026-10-05 (13 trap sentences, 39 calls; the table is in the PR that added this file), and only
 * those that came back the SAME, expected label all three times are here. Two famous traps were dropped because they show the opposite of what
 * a stranger should learn: "you should always switch doors" and "the Tuesday-boy answer is 13/27"
 * are underspecified, yet both checkers answered TRUE. That shared wrong template is the
 * correlated-error problem, and a page must not present it as "Checks out".
 *
 * `why` is shown ONLY when the live checkers return `why.when` for exactly that sentence
 * (CheckForm). If production ever answers differently, the explanation disappears with it.
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
    why: {
      when: 'veto',
      text: 'Nothing is missing. The $27 the guests paid already includes the bellhop’s $2: $25 to the hotel plus $2.',
    },
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
    label: 'a true one',
    text: 'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 40 mph.',
    why: { when: 'pass', text: '120 miles in 3 hours is 40 mph.' },
  },
  {
    label: 'an opinion',
    text: 'Pizza is the best food.',
  },
];
