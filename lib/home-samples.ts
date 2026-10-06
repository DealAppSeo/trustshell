import type { CheckSample } from './check-sample';

/**
 * TRY TO TRICK IT: the three cards on the home page (Sean, 2026-10-06: "invite the user to stump
 * the AI ... and watch it work"). Two of these are wrong and one is right, and that is a fact about
 * the sentences (arithmetic and probability), not about what the checkers say. Picking a card checks
 * it live: nothing here is a stored answer.
 *
 * MEASURED 2026-10-06. Each sentence went to production POST /api/v1/classify three times, about a
 * minute apart. A card is on the page only if the same label came back on every call, and its `why`
 * names that label:
 *   the road trip      veto, veto, veto
 *   the medical test   veto, veto, veto
 *   the birthday room  pass, pass, pass
 * Measured the same day and left off, because the checkers did not agree with themselves or each
 * other (not-checked on every call): the road trip at the right answer (40 mph) and both halves of
 * the bat-and-ball puzzle. So the page dares nobody to "change 45 to 40": today that comes back Not
 * checked, and a dare that ends there would teach the wrong lesson.
 * Two famous traps stay off this page ("you should always switch doors", "the Tuesday-boy answer is
 * 13/27"). They are underspecified, and today both checkers take the bait. They come back only once
 * CLASSIFY_ASSUMPTIONS and CLASSIFY_QUESTIONS are measured on (BUS S37).
 *
 * `why` is shown ONLY when the live checkers return `why.when` for exactly that sentence
 * (CheckForm). An explanation the checkers did not back is not stored here.
 */
export const SPEED_TRAP =
  'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph.';

export const HOME_SAMPLES: readonly CheckSample[] = [
  {
    label: 'The road trip',
    text: SPEED_TRAP,
    why: {
      when: 'veto',
      text: 'Out at 30 mph takes 2 hours and back at 60 mph takes 1: 120 miles in 3 hours is 40 mph.',
    },
  },
  {
    label: 'The medical test',
    text: 'If a disease affects 1% of people and a test for it is 99% accurate, a positive result means you almost certainly have the disease.',
    why: {
      when: 'veto',
      text: 'With 1 in 100 people sick, a 99% test flags about as many healthy people as sick ones, so a positive means about a 50% chance. A textbook rate problem, not medical advice.',
    },
  },
  {
    label: 'The birthday room',
    text: 'In a group of 23 people, the chance that two share a birthday is better than 50%.',
    why: {
      when: 'pass',
      text: '23 people make 253 pairs. The chance that no pair shares a birthday falls to about 49%, so a shared birthday is slightly more likely than not.',
    },
  },
];
