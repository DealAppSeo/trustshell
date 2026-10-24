import type { ClaimLabel } from '../src/lib/claim';
import { CARD_RUNS, CITATION, COMMAND_TRAP, HOME_SAMPLES, PRICE_TRAP } from './home-samples';

/**
 * "CAN YOU SPOT THE AI'S LIE?" (hero v2, 2026-10-24): five answers, some wrong. You guess first, then
 * you see the truth, why, a source you can open, and what the two checkers said.
 *
 * WHY A GAME. A visitor who has not used AI for long may not know it states false things in the same
 * voice as true ones. Telling them is education, and education converts slowly. Letting them get one
 * wrong, instantly, in their own browser, is a pain they feel. The reveal is the reward: it is different
 * every round (some answers are lies, some are true, and a few are ones the checkers will not call), it
 * arrives at once, and nothing is sent anywhere.
 *
 * NOTHING HERE IS LIVE. The checkers' answers are RECORDED runs, shown with their date and how many of
 * how many runs agreed. A live check per round would spend the visitor's own daily budget on a game
 * (the engine caps checks per visitor per day) and would send a request for every guess. The last
 * step, "check your own", is the live one.
 *
 * NO ACCURACY NUMBER. The end screen scores the PLAYER. It never scores the checkers: that figure would
 * have no ruler (CLAUDE_RULES r24; PRODUCT.md "no accuracy number without its ruler"). Each item shows
 * only what the checkers said on one dated set of runs.
 *
 * AN ITEM IS HERE ONLY IF the same label came back on every recorded run, and its `why` is something a
 * person can check (the arithmetic, git's own manual, the ssh manual, a wallet maker's support page).
 * The measuring is in docs/measurements/spot-the-lie-2026-10-24.md, and tests/spot-the-lie.test.ts holds
 * the rule.
 */

export type Truth = 'true' | 'lie';
export type Guess = Truth | 'unsure';

export type PoolItem = {
  id: string;
  /** The moment it would bite ("Before you pay"). Never the answer. */
  label: string;
  text: string;
  truth: Truth;
  /** One plain sentence on why. Shown only after the guess. */
  why: string;
  source?: { name: string; url: string };
  /** What the two checkers said when it was run, and when. Recorded, never live here. */
  checkers: { label: ClaimLabel; on: string; times: number; of: number; record: string };
};

const sample = (text: string) => HOME_SAMPLES.find((s) => s.text === text);
const fromSample = (id: string, text: string, truth: Truth, source?: PoolItem['source']): PoolItem => {
  const s = sample(text)!;
  return {
    id,
    label: s.label,
    text,
    truth,
    why: s.why!.text,
    source,
    checkers: { label: s.measured!.label, on: s.measured!.on, times: s.measured!.times, of: s.measured!.of, record: s.measured!.record },
  };
};

const MISQUOTES_RECORD = CARD_RUNS;
const MISQUOTE_WHY =
  'People say it, but there is no record that he wrote or said it. Who said a line is something the checkers cannot look up, so they do not guess.';

/** Measured 2026-10-24 against production /api/v1/classify, five runs each, 20 s apart. */
const NEW_RECORD = 'https://github.com/DealAppSeo/trustshell/blob/main/docs/measurements/spot-the-lie-2026-10-24.md';

export const POOL: readonly PoolItem[] = [
  fromSample('price', PRICE_TRAP, 'lie'),
  fromSample('citation', CITATION, 'true', { name: 'arXiv 1706.03762', url: 'https://arxiv.org/abs/1706.03762' }),
  fromSample('reset-hard', COMMAND_TRAP, 'lie', { name: 'git reset documentation', url: 'https://git-scm.com/docs/git-reset' }),
  {
    id: 'einstein',
    label: 'Before you quote it',
    text: 'Albert Einstein said that insanity is doing the same thing over and over and expecting different results.',
    truth: 'lie',
    why: MISQUOTE_WHY,
    checkers: { label: 'not-checked', on: '2026-10-06', times: 5, of: 5, record: MISQUOTES_RECORD },
  },
  {
    id: 'darwin',
    label: 'Before you quote it',
    text: 'Charles Darwin wrote in On the Origin of Species that it is not the strongest of the species that survives, but the one most responsive to change.',
    truth: 'lie',
    why: MISQUOTE_WHY,
    checkers: { label: 'not-checked', on: '2026-10-06', times: 5, of: 5, record: MISQUOTES_RECORD },
  },
  {
    id: 'key-in-js',
    label: 'Before you ship it',
    text: "A secret API key placed in a web page's JavaScript stays hidden from the people who visit the page.",
    truth: 'lie',
    why: "A page's JavaScript is sent to every visitor, so anyone can read what is in it. A database key left in page code is how a vibe-coded platform's whole database was exposed in February 2026.",
    source: { name: 'Infosecurity Magazine on the Moltbook exposure', url: 'https://infosecurity-magazine.com/news/moltbook-exposes-user-data-api' },
    checkers: { label: 'veto', on: '2026-10-24', times: 5, of: 5, record: NEW_RECORD },
  },
  {
    id: 'tests-pass',
    label: 'Before you trust it',
    text: 'Passing unit tests prove the code has no bugs.',
    truth: 'lie',
    why: 'Tests can show that a bug is there, never that none is: they only cover what someone thought to test.',
    source: { name: 'Dijkstra, EWD249, via Wikiquote', url: 'https://en.wikiquote.org/wiki/Edsger_W._Dijkstra' },
    checkers: { label: 'veto', on: '2026-10-24', times: 5, of: 5, record: NEW_RECORD },
  },
  {
    id: 'chmod-777',
    label: 'Before you run it',
    text: 'Running chmod 777 on your private SSH key is the recommended way to protect it.',
    truth: 'lie',
    why: 'It does the opposite: it lets everyone on the machine read the key, and ssh ignores a private key that other people can access.',
    source: { name: 'ssh(1) manual', url: 'https://man7.org/linux/man-pages/man1/ssh.1.html' },
    checkers: { label: 'veto', on: '2026-10-24', times: 5, of: 5, record: NEW_RECORD },
  },
  {
    id: 'seed-phrase',
    label: 'Before you share it',
    text: "Anyone who knows your wallet's seed phrase can move all the funds in it.",
    truth: 'true',
    why: "Whoever holds a wallet's recovery phrase can restore the wallet and move its tokens, which is why wallet makers say never to share it.",
    source: { name: 'MetaMask support: basic safety and security tips', url: 'https://support.metamask.io/stay-safe/safety-in-web3/basic-safety-and-security-tips-for-metamask' },
    checkers: { label: 'pass', on: '2026-10-24', times: 5, of: 5, record: NEW_RECORD },
  },
  {
    id: 'stash-keeps',
    label: 'Before you run it',
    text: 'The git command git stash saves your uncommitted changes without deleting them.',
    truth: 'true',
    why: 'It saves them as a stash entry you can bring back later, and leaves you a clean working tree.',
    source: { name: 'git stash documentation', url: 'https://git-scm.com/docs/git-stash' },
    checkers: { label: 'pass', on: '2026-10-24', times: 5, of: 5, record: NEW_RECORD },
  },
];

/** A small, injectable random source, so a round can be reproduced in a test. 0 <= rng() < 1. */
export type Rng = () => number;

/** Mulberry32: a few lines, good enough to shuffle five cards, and the same every time for a given seed. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rng: Rng): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Five different items, with at least one true and at least one lie so a round is never "all lies, say
 * lie", and at most one the checkers will not call so the round is not a lesson in Not checked.
 */
export function pickRound(pool: readonly PoolItem[], n: number, rng: Rng): PoolItem[] {
  const want = Math.min(n, pool.length);
  const order = shuffled(pool, rng);
  const round: PoolItem[] = [];
  let notChecked = 0;
  for (const item of order) {
    if (round.length === want) break;
    if (item.checkers.label === 'not-checked') {
      if (notChecked >= 1) continue;
      notChecked += 1;
    }
    round.push(item);
  }
  // Top up from whatever is left if the not-checked cap left the round short.
  for (const item of order) {
    if (round.length === want) break;
    if (!round.includes(item)) round.push(item);
  }
  // Guarantee a mix: swap the last card for one of the missing kind if the five are all one truth.
  for (const kind of ['true', 'lie'] as const) {
    if (!round.some((r) => r.truth === kind)) {
      const swap = order.find((o) => o.truth === kind && !round.includes(o));
      if (swap) round[round.length - 1] = swap;
    }
  }
  return shuffled(round, rng);
}

export type Verdict = 'right' | 'wrong' | 'honest';

/**
 * 'right' when the guess is the truth. 'honest' when the player said they could not tell on an item the
 * checkers would not call either: the same answer, and not a miss. Otherwise 'wrong'.
 */
export function judge(item: PoolItem, guess: Guess): Verdict {
  if (guess === item.truth) return 'right';
  if (guess === 'unsure' && item.checkers.label === 'not-checked') return 'honest';
  return 'wrong';
}

export function score(items: readonly PoolItem[], guesses: readonly Guess[]): number {
  return items.reduce((n, item, i) => n + (judge(item, guesses[i]) === 'right' ? 1 : 0), 0);
}

const LINES: Record<'low' | 'mid' | 'high' | 'full', string[]> = {
  full: [
    'Clean sweep. You would have caught every one of them.',
    'Five for five. Keep that suspicion switched on.',
    'Perfect. The confident wrong answers did not fool you today.',
  ],
  high: [
    'Sharp. One got past you, which is exactly how it happens.',
    'Nearly all of them. The sneaky one is why a second look pays.',
    'Good eye. Even the careful ones get one.',
  ],
  mid: [
    'About half. These all sounded sure, and that is the problem.',
    'A coin flip is what a confident wrong answer counts on.',
    'Some got you. That is how most people feel the first time.',
  ],
  low: [
    'They fooled you, and they are built to. This is the problem in one screen.',
    'Tough round. Sounding sure is not the same as being right.',
    'Most people miss several. That is why checking beats trusting.',
  ],
};

/** A different line each time (the reward varies), chosen by score band. */
export function resultLine(points: number, n: number, rng: Rng): string {
  const ratio = n === 0 ? 0 : points / n;
  const band = ratio === 1 ? 'full' : ratio >= 0.75 ? 'high' : ratio >= 0.5 ? 'mid' : 'low';
  const options = LINES[band];
  return options[Math.floor(rng() * options.length)];
}

/** The path a shared link lands on, tagged so a share can be told from a first visit by the page view count. */
export const SHARE_PATH = '/for/vibe-coders?utm_source=share&utm_medium=spot-the-lie';

export function shareText(points: number, n: number, origin: string): string {
  return `I got ${points} of ${n} right: which of these AI answers is a lie? ${origin}${SHARE_PATH}`;
}

/** Whether the pool can run a round at all, with a mix. Used by the test and by the component's guard. */
export function poolIsPlayable(pool: readonly PoolItem[], n = 5): boolean {
  return pool.length >= n && pool.some((p) => p.truth === 'true') && pool.some((p) => p.truth === 'lie');
}
