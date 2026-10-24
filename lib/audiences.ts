/**
 * THREE DOORS, ONE HARNESS (hero v2, 2026-10-24). The pages /for/openclaw, /for/vibe-coders and /for/erc.
 *
 * WHY PATHS. Each audience gets its own static page, so "which hook works" is answered by where a link
 * was posted and what the page view count says, with no cookie, no tracking script and no random split.
 * The home page stays the general door. (A script would break "the page sends nothing on load", which
 * tests/e2e/check-walk.mjs pins; adding one is Sean's call, not a side effect of this file.)
 *
 * WHAT EACH PAGE SAYS, IN ORDER (least to carry, per PRODUCT.md): one headline and one action; what
 * the audience fears, each with a numbered source; what TrustShell does about it and, in the same
 * breath, what it does NOT do; See it / Limit it / Keep it; one door to build their own; the sources.
 *
 * TRUTH RULES. Every line states only what the code does today or labels itself "Next" or "Preview".
 * A fear is listed only where something real answers it. Fears we do not answer (a malicious skill
 * installed into an agent; a package name an AI invented) are not on a page as selling points: the
 * first is named, with its source, as something TrustShell does not do.
 * The evidence behind each line is in HERO_AND_AUDIENCE_BRIEF_2026-10-24.md (shared notes).
 * Sources are secondary reports unless noted: print a number only after reading the primary.
 */

export type Source = { id: string; name: string; url: string; note: string };

/** Keyed by id so a fear names its source once and the page numbers them in order of first use. */
export const SOURCES: Record<string, Source> = {
  replit: {
    id: 'replit',
    name: 'OECD AI Incident Monitor: a coding agent deletes a live database (July 2025)',
    url: 'https://oecd.ai/en/incidents/2025-07-19-1eb1',
    note: 'Reported from the owner’s posted chat logs and press coverage; not an independent audit.',
  },
  bankr: {
    id: 'bankr',
    name: 'OECD AI Incident Monitor: Grok / Bankr wallet drained by a Morse-code prompt (May 2026)',
    url: 'https://oecd.ai/en/incidents/2026-05-04-4a73',
    note: 'The page values the loss at $150,000 to $200,000; headlines vary.',
  },
  skills: {
    id: 'skills',
    name: 'The Hacker News: OpenClaw and malicious skills on ClawHub (Feb 2026)',
    url: 'https://thehackernews.com/2026/02/openclaw-integrates-virustotal-scanning.html',
    note: 'Researchers reported 341 malicious skills. Secondary report.',
  },
  exposed: {
    id: 'exposed',
    name: 'DigitalOcean: OpenClaw security challenges (2026)',
    url: 'https://www.digitalocean.com/resources/articles/openclaw-security-challenges',
    note: 'Exposed instances and weak authentication. Counts differ between reports.',
  },
  moltbook: {
    id: 'moltbook',
    name: 'Infosecurity Magazine: a vibe-coded platform exposes user data and API keys (Feb 2026)',
    url: 'https://infosecurity-magazine.com/news/moltbook-exposes-user-data-api',
    note: 'Wiz found a database key in client-side code. Reported figures: about 1.5 million tokens.',
  },
  erc8004: {
    id: 'erc8004',
    name: 'Can Trustless Agents Be Trusted? An empirical study of ERC-8004 (arXiv 2606.26028)',
    url: 'https://arxiv.org/abs/2606.26028',
    note: 'Data through May 2026 from Ethereum, BSC and Base. Version 1 and version 2 figures differ slightly.',
  },
};

export type Fear = {
  /** What the audience worries about, in their words. */
  worry: string;
  /** What actually happened, one sentence, with the source ids that back it. */
  proof: string;
  cite: string[];
  /** What TrustShell really does about it today. */
  does: string;
  /** What it does not do. Said every time; it is the point. */
  doesNot: string;
};

export type Audience = {
  slug: 'openclaw' | 'vibe-coders' | 'erc';
  /** Who this page is for, as a short label above the headline. */
  eyebrow: string;
  h1: string;
  sub: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** The hero image: a real artefact of the product, never stock art. */
  visual: 'receipt' | 'game';
  metaTitle: string;
  metaDescription: string;
  fears: Fear[];
};

export const AUDIENCES: Audience[] = [
  {
    slug: 'openclaw',
    eyebrow: 'For people running agents',
    h1: 'Your agent says the job is done. Here’s the receipt.',
    sub: 'TrustShell checks what an agent says it did against GitHub’s own record of the run. No account. One command.',
    primary: { label: 'Try Inspect', href: '/inspect' },
    secondary: { label: 'How it works', href: '/build' },
    visual: 'receipt',
    metaTitle: 'For people running agents — TrustShell',
    metaDescription:
      'Check what your agent says it did against the record. A developer preview: Inspect reads a public GitHub Actions run, no account, no key.',
    fears: [
      {
        worry: 'It says it did the thing. Did it?',
        proof:
          'A coding agent deleted a live database, and its owner says it then faked data and reported that tests had passed.',
        cite: ['replit'],
        does: 'Inspect reads one public GitHub Actions run and marks each sentence your agent said Supported, Contradicted or Not checked, with the field that decided it.',
        doesNot: 'It covers GitHub Actions runs only. A Supported sentence is not permission to merge or deploy.',
      },
      {
        worry: 'My agent can spend money I never meant it to.',
        proof: 'An AI-linked crypto wallet was talked into sending roughly $150,000 to $200,000 by a Morse-code message.',
        cite: ['bankr'],
        does: 'The SDK refuses to sign a payment that has no cap, goes over the cap, or comes from a turn that may not pay.',
        doesNot: 'It is a test-network feature, and the cap is set by the calling code, not signed by an owner.',
      },
      {
        worry: 'A skill I install, or an open port, hands my agent’s access to someone else.',
        proof:
          'Researchers reported 341 malicious skills on OpenClaw’s skill marketplace, and tens of thousands of internet-facing instances, many with authentication off.',
        cite: ['skills', 'exposed'],
        does: 'It leaves a record you can read: what the agent claimed, beside what the run shows.',
        doesNot: 'It does not scan skills, lock down a gateway or sandbox anything. Isolate and audit those yourself.',
      },
    ],
  },
  {
    slug: 'vibe-coders',
    eyebrow: 'For people building with AI',
    h1: 'Can you spot the AI’s lie?',
    sub: 'Five answers. Some are wrong. Guess first, then see what two other AIs said.',
    primary: { label: 'Check your own answer', href: '/check' },
    secondary: { label: 'Check what your agent says it did', href: '/for/openclaw' },
    visual: 'game',
    metaTitle: 'Can you spot the AI’s lie? — TrustShell',
    metaDescription:
      'Five AI answers, some wrong. Guess, then see what two other AIs said. A game built on real recorded checks, nothing sent.',
    fears: [
      {
        worry: 'I shipped something an AI wrote, and I don’t know what’s in it.',
        proof:
          'Wiz found a vibe-coded platform’s whole database open through a key sitting in its page code, and about 1.5 million tokens reachable.',
        cite: ['moltbook'],
        does: 'Known key and personal-data formats are removed from text before anything is sent for checking, and a claim like “the tests passed” can be checked against the run.',
        doesNot: 'It does not scan your app for leaked keys or open databases.',
      },
      {
        worry: 'It told me the tests passed. Did they?',
        proof: 'A coding agent told its owner tests had passed while, the owner says, it was faking data.',
        cite: ['replit'],
        does: 'Inspect checks that sentence against GitHub’s record of the run.',
        doesNot: 'GitHub Actions runs only. Tests that pass do not prove the code has no bugs.',
      },
    ],
  },
  {
    slug: 'erc',
    eyebrow: 'For ERC-8004 and x402 builders',
    h1: 'Reputation is only as good as the evidence behind it.',
    sub: 'A 2026 study of ERC-8004 found most feedback is not tied to a verifiable interaction. TrustShell receipts say what was checked, and what was not.',
    primary: { label: 'See an agent’s record', href: '/passport' },
    secondary: { label: 'Try Inspect', href: '/inspect' },
    visual: 'receipt',
    metaTitle: 'For ERC-8004 and x402 builders — TrustShell',
    metaDescription:
      'On-chain reputation needs evidence behind it. TrustShell receipts name what was checked and what was not. Test network only.',
    fears: [
      {
        worry: 'On-chain reputation can be faked, so it tells me nothing.',
        proof:
          'An empirical study across Ethereum, BSC and Base found reputation values not comparable, feedback rarely tied to a verifiable interaction, and large shares of reviewers acting in coordinated, Sybil-like ways.',
        cite: ['erc8004'],
        does: 'RepID is our engine’s score, written as ERC-8004 feedback on Base Sepolia, a test network. The scoring code is public, and each receipt says what was checked and what was not.',
        doesNot:
          'Its tuned constants are not public, and nothing here makes reputation Sybil-proof. Tying feedback to evidence is next, and not built.',
      },
      {
        worry: 'My agent pays the wrong party, or more than it should.',
        proof: 'An AI-linked wallet was talked into sending roughly $150,000 to $200,000 it was never meant to send.',
        cite: ['bankr'],
        does: 'The SDK refuses to sign an x402 payment with no cap, over the cap, or from a turn that may not pay.',
        doesNot: 'Test network only, no mainnet, and the cap comes from the calling code.',
      },
    ],
  },
];

export const AUDIENCE_SLUGS = AUDIENCES.map((a) => a.slug);

export function audienceBySlug(slug: string): Audience | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}

/** The audience's sources in order of first use, each with the number the page prints. */
export function sourcesFor(a: Audience): { n: number; source: Source }[] {
  const seen: string[] = [];
  for (const f of a.fears) for (const id of f.cite) if (!seen.includes(id)) seen.push(id);
  return seen.map((id, i) => ({ n: i + 1, source: SOURCES[id] }));
}

/** The footnote numbers for one fear, in the page's numbering. */
export function citeNumbers(a: Audience, fear: Fear): number[] {
  const order = sourcesFor(a);
  return fear.cite.map((id) => order.find((o) => o.source.id === id)!.n);
}
