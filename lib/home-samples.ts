import type { CheckSample } from './check-sample';

/**
 * TRY TO TRICK IT: the three cards on the home page (Sean, 2026-10-06: "invite the user to stump
 * the AI ... and watch it work"). Two of these are wrong and one is right, and that is a fact about
 * the sentences, not about what the checkers say. Picking a card checks it live: nothing here is a
 * stored answer.
 *
 * THE STAKES, NOT THE PUZZLES (Sean's GO, 2026-10-06, on Grok's card critique). The road trip, the
 * game show and the birthday room were brain teasers. The person this page is for gets burned by a
 * price it told them to pay, a citation they almost shipped, and a command it told them to run. So
 * the labels name the moment ("Before you pay"), and never give the answer away. Grok also warned
 * that our checkers cannot look anything up: a current price, or whether a paper exists, comes back
 * Not checked, and a card that ends on Not checked on its first click teaches the wrong lesson. So
 * each sentence is one the checkers can settle from what they know, and each was measured first.
 *
 * MEASURED 2026-10-06 against production POST /api/v1/classify as it was configured that day, five
 * times each, the sentences taken in turn one call every 20 seconds. Every call is recorded, exactly
 * as it came back, in docs/measurements/home-cards-2026-10-06.md (CARD_RUNS below), with the command
 * to run it again. A card is on the page only if the same label came back every time, and its `why`
 * names that label:
 *   before you pay      veto x5
 *   before you cite it  pass x5   (groq and cerebras decided every time)
 *   before you run it   veto x5
 * Measured the same day and left off, because they did not come back the same way every time:
 *   "Insanity is doing the same thing ..." attributed to Einstein   Not checked x5 (a misquote, but
 *       the checkers will not call it either way)
 *   a Darwin "survival of the fittest" misquote                      Not checked x5
 *   "Attention Is All You Need" credited to OpenAI                    1 Caught, 3 Not checked
 *   AlexNet credited to Google                                        2 Caught, 1 Not checked
 * So the wrong citation is not on the page: today it does not get caught every time. The right one
 * is, and the price and the command are the two that are wrong.
 * Each `why` names a source a person can check: the arithmetic itself, the paper's arXiv page
 * (arxiv.org/abs/1706.03762: eight authors, first posted 12 June 2017; read 2026-10-06), and git's
 * own manual for reset --hard ("Any changes to tracked files in the working tree since <commit> are
 * discarded").
 * `why` is shown ONLY when the live checkers return `why.when` for exactly that sentence
 * (CheckForm). An explanation the checkers did not back is not stored here.
 * Re-measure with `npm run test:home-samples` (the home-samples workflow) before changing a card,
 * and change `measured` with it: the page prints it next to every live answer.
 *
 * WHAT IT WILL NOT CALL (shown under the cards, components/hero.tsx). The two quotes above came back
 * Not checked 10 times out of 10. Who said a line is a fact the checkers cannot look up, so Not
 * checked is the right answer, not a failure. `UNSOURCED_QUOTE_RUNS` is that record.
 *
 * The road trip stays exported: it is still the terminal example on the next screen (home-agent.tsx),
 * where it is a command a person runs, not a card.
 */
export const SPEED_TRAP =
  'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph.';

export const PRICE_TRAP = 'Marking a $100 item up 50% and then down 50% brings it back to $100.';

export const CITATION =
  'Attention Is All You Need, the paper that introduced the Transformer, was published in 2017 by researchers at Google.';

export const COMMAND_TRAP = 'Running git reset --hard keeps the changes you have not committed yet.';

/** The raw runs behind every card and the quote line: each call's time, sentence and full answer. */
export const CARD_RUNS = 'https://github.com/DealAppSeo/trustshell/blob/main/docs/measurements/home-cards-2026-10-06.md';

export const HOME_SAMPLES: readonly CheckSample[] = [
  {
    label: 'Before you pay',
    text: PRICE_TRAP,
    why: {
      when: 'veto',
      text: 'Up 50% makes it $150. Down 50% of $150 is $75, not $100.',
    },
    measured: { on: '2026-10-06', label: 'veto', times: 5, of: 5, record: CARD_RUNS },
  },
  {
    label: 'Before you cite it',
    text: CITATION,
    why: {
      when: 'pass',
      text: 'Ashish Vaswani and seven co-authors, most at Google Brain and Google Research. On arXiv in June 2017 (1706.03762), presented at NIPS 2017, now called NeurIPS.',
    },
    measured: { on: '2026-10-06', label: 'pass', times: 5, of: 5, record: CARD_RUNS },
  },
  {
    label: 'Before you run it',
    text: COMMAND_TRAP,
    why: {
      when: 'veto',
      text: 'It discards every uncommitted change to tracked files (git help reset, under --hard). Commit or stash first.',
    },
    measured: { on: '2026-10-06', label: 'veto', times: 5, of: 5, record: CARD_RUNS },
  },
];

/** The two misattributed quotes, measured 2026-10-06: Not checked on all ten calls (five each). */
export const UNSOURCED_QUOTE_RUNS = { on: '2026-10-06', quotes: 2, times: 10, of: 10 } as const;
