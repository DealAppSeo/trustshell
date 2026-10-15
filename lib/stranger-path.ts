/**
 * THE STRANGER PATH: four screens, one flow, the tutorial ON them.
 *
 * Sean, 2026-10-12: a stranger must be able to finish this with no one in the room.
 *
 *   1. name the agent        (/agents)
 *   2. pick a belt, or skip  (/belts)
 *   3. run one check, read the receipt (/check)
 *   4. the offer: register, bind, fund, stake on the test network (/after-create)
 *
 * THE TUTORIAL IS NOT A SECOND FLOW. These are the same pages the product already has; this file is
 * the one place their step text lives, and `components/stranger-rail.tsx` prints it on each page
 * beside the thing it describes. There is no tour mode, no overlay and no separate route to keep in
 * step with the real ones: a page that changes shows its own words, and a step cannot be explained
 * on a page that does not do it.
 *
 * ONE SOURCE. The order, the links, the "do this" and "you will see" sentences all come from here,
 * so the four screens cannot drift into four different stories.
 *
 * Everything in the offer (step 4) runs on the Base Sepolia test network. Nothing here promises a
 * thing the product does not do: the on-chain ERC-8004 mint is NOT offered to a stranger yet, and
 * the offer says so rather than leaving it out.
 */

export type StrangerStepId = 'name' | 'belt' | 'check' | 'offer';

export type StrangerStep = {
  id: StrangerStepId;
  n: 1 | 2 | 3 | 4;
  /** The page that IS this screen. */
  href: string;
  /** Short label for the strip. */
  label: string;
  /** The heading of the card on the page. */
  title: string;
  /** What to do here. One or two plain sentences. */
  doThis: string;
  /** What you should see when it worked, and what it does NOT do. */
  youSee: string;
};

export const STRANGER_STEPS: readonly StrangerStep[] = [
  {
    id: 'name',
    n: 1,
    href: '/agents',
    label: 'Name it',
    title: 'Name your agent',
    doThis: 'Type a name, 3 to 30 characters, and press Create Agent. The description and the rules are optional.',
    youSee:
      'Your agent appears in the list with its ID and a starting score. It is saved in this browser only. No email, no wallet, no money.',
  },
  {
    id: 'belt',
    n: 2,
    href: '/belts',
    label: 'Pick a belt',
    title: 'Pick a belt, or skip',
    doThis:
      'A belt is the short list of tools one role may use, and every tool on it starts read-only. Pick CMO, CTO or CFO, or press Skip.',
    youSee:
      'Your pick is written down in this browser. Nothing is installed, bought or sent. Skipping changes nothing, and you can come back.',
  },
  {
    id: 'check',
    n: 3,
    href: '/check',
    label: 'Run a check',
    title: 'Run one check and read the receipt',
    doThis: 'Paste one sentence and press Check. Try one you know is true, then one you know is false.',
    youSee:
      'One of three answers, then a receipt: who checked, what each one said, and whether anything settled it. A vote on its own is PROVISIONAL, and a check on this site writes nothing to a score. Not checked never means checks out.',
  },
  {
    id: 'offer',
    n: 4,
    href: '/after-create',
    label: 'Keep it',
    title: 'Keep it: bind, fund, stake, set a limit',
    doThis:
      'Each row below is optional and goes in order. Everything here runs on the Base Sepolia test network with play money.',
    youSee:
      'A wallet signature that proves the agent is yours, free test tokens from a public faucet, a practice stake, and a spending limit you can pull to zero.',
  },
];

export function strangerStep(id: StrangerStepId): StrangerStep {
  const s = STRANGER_STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown stranger step: ${id}`);
  return s;
}

/** The step after this one, or null on the last screen. */
export function nextStrangerStep(id: StrangerStepId): StrangerStep | null {
  const i = STRANGER_STEPS.findIndex((x) => x.id === id);
  return STRANGER_STEPS[i + 1] ?? null;
}

/** Which offer rows exist, in order, with the page each one is. Screen 4 prints these. */
export type OfferRowId = 'register' | 'bind' | 'faucet' | 'stake' | 'limit';

export type OfferRow = {
  id: OfferRowId;
  title: string;
  body: string;
  /** Where this row is done. null = it is not offered to a stranger yet, and the row says so. */
  href: string | null;
  action: string;
};

export const OFFER_ROWS: readonly OfferRow[] = [
  {
    id: 'register',
    title: 'Register',
    body:
      'Your agent already has an ID from step 1, held off-chain. Minting its on-chain ERC-8004 ID is not offered here yet, so a new agent shows as off-chain only.',
    href: null,
    action: 'Not offered yet',
  },
  {
    id: 'bind',
    title: 'Bind it',
    body: 'Sign once with a wallet to prove the agent is yours. No email, no transaction, no fee. You can withdraw it later.',
    href: '/bind',
    action: 'Bind it',
  },
  {
    id: 'faucet',
    title: 'Get test tokens',
    body:
      'A public faucet gives free test ETH and test USDC. We do not hand out tokens. You paste your wallet address and we read the balance back.',
    href: '/faucet',
    action: 'Get test tokens',
  },
  {
    id: 'stake',
    title: 'Stake on the test network',
    body: 'Practice only. A test-network stake moves no real money, and it does not raise what the agent may spend.',
    href: '/stake',
    action: 'Practice stake',
  },
  {
    id: 'limit',
    title: 'Set a limit, then pull it to zero',
    body: 'Let the agent pay up to a cap you set in your own wallet. Set the cap to 0 and the next payment is refused.',
    href: '/spend',
    action: 'Set a limit',
  },
];
