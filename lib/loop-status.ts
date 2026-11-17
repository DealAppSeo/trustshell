/**
 * ONE SOURCE for what the trust loop does today, step by step.
 *
 * The loop: watch an agent's claim get caught → check one of your own → name your PAI → give it a
 * capped test budget → revoke it. Each step carries ONE status, and every chip on the site that
 * describes a loop step is drawn from this file (components/loop-strip.tsx, on the beta walkthrough), so a
 * chip cannot drift from the inventory it was taken from.
 *
 * The rule a status must meet (tests/loop-status.test.ts holds most of it):
 *   live         works today for anyone, with evidence named in `evidence`
 *   testnet      works today on Base Sepolia with test USDC only
 *   shadow       runs and is measured, changes nothing
 *   off          merged code that is off by default; nothing reaches a visitor
 *   not-built    designed only: no link, and the text says what it will do
 *   not-checked  we could not confirm it, so it is never called working
 * When a status cannot be confirmed, it is `not-checked`. It is never guessed `live`.
 *
 * Inventory behind every line, with the probes and queries: the operator's UIUX_OVERNIGHT report
 * for 2026-11-16. Re-check before moving a status, and move CHECKED_ON with it.
 */

export type LoopStatus = 'live' | 'testnet' | 'shadow' | 'off' | 'not-built' | 'not-checked';

export const STATUS_WORDS: Record<LoopStatus, { chip: string; means: string }> = {
  live: { chip: 'Live', means: 'Works today, for anyone.' },
  testnet: { chip: 'Testnet', means: 'Works today on Base Sepolia, a test network. Test USDC only, so no real money moves.' },
  shadow: { chip: 'Shadow', means: 'Runs and is measured, but changes nothing yet.' },
  off: { chip: 'Built, switched off', means: 'The code exists and is off by default. Nothing it does reaches you yet.' },
  'not-built': { chip: 'Not built yet', means: 'Designed, not built. The step says what it will do.' },
  'not-checked': { chip: 'Status not confirmed', means: 'We could not confirm it today, so we do not call it working.' },
};

/** The date every status below was last checked. */
export const CHECKED_ON = '16 Nov 2026';

/** A part of a step that does not work yet. A link would be a dead button, so it has none. */
export type LoopLater = { status: 'shadow' | 'off' | 'not-built' | 'not-checked'; text: string };

export type LoopStep = {
  id: 'watch' | 'check' | 'name' | 'budget' | 'revoke';
  title: string;
  status: LoopStatus;
  /** What a newcomer does or sees at this step, in plain words. */
  does: string;
  /** The page that does it today. */
  href: string;
  linkLabel: string;
  /** How we know, as of CHECKED_ON. */
  evidence: string;
  later?: LoopLater[];
};

export const LOOP_STEPS: readonly LoopStep[] = [
  {
    id: 'watch',
    title: 'Watch a catch',
    status: 'live',
    does: 'An agent says its CI run passed on a commit the run never used. TrustShell reads GitHub’s own record of the run and marks that claim contradicted.',
    href: '#watch',
    linkLabel: 'See the catch',
    evidence: 'Real output of the published 1.9.3 package, recorded on 16 Nov 2026.',
  },
  {
    id: 'check',
    title: 'Check yours',
    status: 'live',
    does: 'Paste one sentence an AI told you. You get Checks out, Caught or Not checked. A GitHub Actions run can be checked from a terminal too.',
    href: '/check',
    linkLabel: 'Check a sentence',
    evidence: 'A scheduled browser test ran this check against the live site on 16 Nov 2026 and passed.',
  },
  {
    id: 'name',
    title: 'Name your PAI',
    status: 'live',
    does: 'Answer three questions and your personal AI is registered, with its own key kept in this browser. It holds no keys of yours.',
    href: '/pai',
    linkLabel: 'Build your PAI',
    evidence: 'The registration call it makes answered on the live engine on 16 Nov 2026.',
    later: [{ status: 'not-built', text: 'One passkey tap that also makes your wallet, with test USDC sent to it for you, so you never visit a faucet.' }],
  },
  {
    id: 'budget',
    title: 'Budget (testnet)',
    status: 'testnet',
    does: 'Connect a wallet and set a cap on what your agent may spend in test USDC. Anything over the cap is refused before it is signed.',
    href: '/spend',
    linkLabel: 'Set a cap',
    evidence: 'Base Sepolia only. Today it needs a browser wallet that holds test funds. An owner’s budget shared by two agents also ran on Base Sepolia on 16 Nov 2026; its receipt is on TrustMarket.',
    later: [
      { status: 'off', text: 'Gasless deposit: you sign once and pay no gas.' },
      { status: 'off', text: 'A verified human, not only a builder, holding a budget for their agents.' },
    ],
  },
  {
    id: 'revoke',
    title: 'Revoke',
    status: 'testnet',
    does: 'Take your agent back with one wallet signature, or set its cap to 0. Its next spend is refused.',
    href: '/bind',
    linkLabel: 'Manage ownership',
    evidence: 'Revoke ownership is on /bind, and a cap of 0 is set on /spend. Base Sepolia only.',
  },
];

/**
 * Parts of the loop outside the five steps above, with the same rule: a status that cannot be confirmed
 * is `not-checked`. Each one appears on the "What works today" section, never as a step of the strip.
 */
export type LoopPart = { title: string; status: LoopStatus; text: string; evidence: string };

export const OTHER_PARTS: readonly LoopPart[] = [
  {
    title: 'Reputation feedback written on chain',
    status: 'testnet',
    text: 'Our engine writes reputation feedback to the ERC-8004 reputation registry on Base Sepolia.',
    evidence: 'One write with a transaction hash on each day from 10 to 16 Nov 2026; the one on 16 Nov 2026 was read back from the chain.',
  },
  {
    title: 'Reputation that moves only when an independent check passes',
    status: 'not-checked',
    text: 'Built to run in shadow, measured but changing no score. Whether it is switched on today was not confirmed.',
    evidence: 'The code runs in shadow only; its production setting could not be read on 16 Nov 2026.',
  },
];

/** Questions we have not answered, said as open rather than left out. */
export const OPEN_QUESTIONS: readonly { title: string; text: string }[] = [
  {
    title: 'Private delegation through several agents',
    text: 'Proving that a chain of grants ends at an accountable person, and that every link only narrowed, without revealing the links. Not built.',
  },
  {
    title: 'Unlinkable across chains',
    text: 'Using one identity on more than one chain without the uses being linked. Not attempted.',
  },
  {
    title: 'What a proof costs',
    text: 'How long a reputation proof takes to make, and what verifying one on chain costs. Not measured yet.',
  },
];

export type WorksItem = { title: string; status: LoopStatus; text: string; href?: string; linkLabel?: string };

/** "What works today", grouped from the same source as the strip, so the two cannot disagree. */
export function whatWorks(): { verified: WorksItem[]; inProgress: WorksItem[] } {
  const works = (s: LoopStatus) => s === 'live' || s === 'testnet';
  // An in-page anchor (#watch) belongs to the walkthrough page; anywhere else it would point at nothing.
  const steps: WorksItem[] = LOOP_STEPS.map((s) => ({ title: s.title, status: s.status, text: s.does, ...(s.href.startsWith('#') ? {} : { href: s.href, linkLabel: s.linkLabel }) }));
  const later: WorksItem[] = LOOP_STEPS.flatMap((s) => (s.later ?? []).map((l) => ({ title: s.title, status: l.status, text: l.text })));
  const all = [...steps, ...later, ...OTHER_PARTS.map((p) => ({ title: p.title, status: p.status, text: p.text }))];
  return { verified: all.filter((i) => works(i.status)), inProgress: all.filter((i) => !works(i.status)) };
}
