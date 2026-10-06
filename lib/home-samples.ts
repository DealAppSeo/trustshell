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
 *   the road trip      veto, veto, veto   (flags off; veto x3 again with both flags on)
 *   the game show      veto, veto, veto   (CLASSIFY_ASSUMPTIONS and CLASSIFY_QUESTIONS on)
 *   the birthday room  pass, pass, pass   (flags off; pass x3 again with both flags on)
 * Measured the same day and left off, because the checkers did not agree with themselves or each
 * other (not-checked on every call): the road trip at the right answer (40 mph) and both halves of
 * the bat-and-ball puzzle. So the page dares nobody to "change 45 to 40": today that comes back Not
 * checked, and a dare that ends there would teach the wrong lesson.
 * THE MEDICAL TEST LEFT (BUS S37). It was veto x3 with the flags off. With CLASSIFY_ASSUMPTIONS on,
 * one checker answers unsure on it (not-checked 5 of 5) and on four rewordings, two of which state
 * both error rates (not-checked 15 of 15), so the card would end on Not checked. It stays in the
 * builder trap set (examples/traps).
 * The game show states its rule (the host always opens a goat door and always offers the switch).
 * The famous version leaves that rule out, and with CLASSIFY_ASSUMPTIONS on it comes back Not
 * checked (5 of 5), where it used to pass. The Tuesday-boy line still passes (5 of 5) and stays off.
 * `why` is shown ONLY when the live checkers return `why.when` for exactly that sentence
 * (CheckForm). An explanation the checkers did not back is not stored here.
 */
export const SPEED_TRAP =
  'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph.';

export const GAME_SHOW =
  'On a game show with three doors, the host always opens a door you did not pick that hides a goat and always offers a switch. Switching and staying each win half the time.';

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
    label: 'The game show',
    text: GAME_SHOW,
    why: {
      when: 'veto',
      text: 'Your first pick is right 1 time in 3. The host always shows a goat, which never changes that, so switching wins the other 2 times in 3.',
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
