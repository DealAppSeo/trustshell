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
    does: 'Paste one sentence an AI told you. You get Checks out, Caught or Not checked. To check a GitHub Actions run instead, use the walkthrough below.',
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
    evidence: 'Base Sepolia only. Today it needs a browser wallet that holds test funds.',
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
