/**
 * glossary.ts — the single source of truth for TrustShell's defined terms.
 *
 * WHY THIS IS DATA AND NOT MARKDOWN. `docs/glossary.md` held 12 terms and was never
 * surfaced as a page, so nothing in the UI could link to a definition and no reader
 * could find one. Rendering from a typed module gives the page per-term anchors and a
 * search box, and — more importantly — keeps ONE copy. Two glossaries that drift apart
 * is the failure this project has been bitten by before.
 *
 * SCOPE, and why we do not mirror hyperdag.org/more. That page defines 43 protocol-depth
 * terms and already gives each an anchor. Copying them here would create exactly the
 * two-copies-drifting problem above, and the copy would be the one that rots. So the
 * rule is: **every term a reader meets in the TrustShell UI is defined HERE**, in full;
 * protocol-depth terms carry a `deeper` link out. A reader never hits a dead end, and
 * neither site has to keep the other's definitions current.
 *
 * STATUS IS NOT DECORATION. Several of these describe things that are designed but not
 * running. A glossary that reads as a feature list is a way of overclaiming with extra
 * steps, so each entry carries an honest status and the page renders it.
 */

export type TermStatus =
  /** Running today, and you can observe it. */
  | 'shipped'
  /** Real, but measured against a documented proxy — carries a caveat. */
  | 'approximate'
  /** Specified and wired as a contract surface; the implementation behind it is a stub. */
  | 'not-live'
  /** A concept we use to think and talk, not a component. */
  | 'concept';

export interface Term {
  /** URL anchor. Stable — other pages link to `/glossary#<slug>`, so do not rename casually. */
  slug: string;
  term: string;
  /** Expansion of an acronym, where there is one. */
  expansion?: string;
  group: GroupId;
  status: TermStatus;
  /** One or two sentences. Plain language first, precision second. */
  definition: string;
  /** The thing a careful reader would otherwise have to discover the hard way. */
  note?: string;
  related?: string[];
  /** Protocol-depth treatment on the HyperDAG side. */
  deeper?: { label: string; href: string };
}

export type GroupId = 'using' | 'own' | 'verify' | 'privacy' | 'protocol';

export const GROUPS: { id: GroupId; title: string; blurb: string }[] = [
  {
    id: 'using',
    title: 'Using TrustShell',
    blurb: 'The things you touch directly.',
  },
  {
    id: 'own',
    title: 'Trust you own',
    blurb: 'Reputation and authority that belong to you, not to a platform.',
  },
  {
    id: 'verify',
    title: 'How we verify',
    blurb: 'What a claim has to survive before we call it true — and the words we use when it has not.',
  },
  {
    id: 'privacy',
    title: 'Privacy and proofs',
    blurb: 'What can be proven without being revealed. Includes what is not built yet.',
  },
  {
    id: 'protocol',
    title: 'Protocol and payments',
    blurb: 'The rails underneath. Deeper treatment lives on hyperdag.org.',
  },
];

export const HYPERDAG_GLOSSARY = 'https://www.hyperdag.org/more';

export const TERMS: Term[] = [
  // ── Using TrustShell ────────────────────────────────────────────────────────
  {
    slug: 'pai',
    term: 'PAI',
    expansion: 'Personal Agentic Interface',
    group: 'using',
    status: 'shipped',
    definition:
      'One conversation that sits in front of the whole trust kernel. Instead of learning six screens, you talk to your PAI and it files the work, runs the checks and shows you what it did.',
    related: ['agent', 'constitution'],
  },
  {
    slug: 'trust-harness',
    term: 'Portable Agentic Trust Harness',
    group: 'using',
    status: 'shipped',
    definition:
      'What TrustShell is. A harness wraps an agent you already have rather than replacing it: the same agent keeps its reputation, its constitution and its memory of what it has done, whichever model answers the next prompt.',
    note:
      'Portable is the operative word. Your agent\'s earned standing is not held inside one vendor\'s account, so switching models does not reset it to zero.',
    related: ['repid', 'vault', 'no-vendor-lock-in'],
  },
  {
    slug: 'no-vendor-lock-in',
    term: 'No vendor lock-in',
    group: 'using',
    status: 'shipped',
    definition:
      'Runs route free-tier models first and fall back to paid ones only when needed, using your own keys. Change provider and your agent, its RepID and its history come with you.',
    related: ['vault', 'trust-harness'],
  },
  {
    slug: 'vault',
    term: 'Vault',
    group: 'using',
    status: 'shipped',
    definition:
      'The browser-local store for your model provider keys, encrypted with AES-GCM behind a passphrase that never leaves your device.',
    note:
      'Non-custodial in the sense that matters: we never receive your keys. Not in the stronger sense — we serve the JavaScript that runs in your browser, so the honest claim is "we never receive them", not "we could not possibly access them".',
    related: ['no-vendor-lock-in'],
  },
  {
    slug: 'agent',
    term: 'Agent',
    group: 'using',
    status: 'shipped',
    definition:
      'A named identity that does work and accumulates a record for it. It holds a constitution, earns RepID, and can be granted authority to spend.',
    related: ['repid', 'constitution', 'grant'],
  },
  {
    slug: 'founder-mode',
    term: 'Founder Mode',
    group: 'using',
    status: 'not-live',
    definition:
      'A way to file a note as the product\'s owner rather than as an end user, so founder observations never contaminate user telemetry.',
    note:
      'The event contract is specified and notes are tagged, but they are stored on that device only — the backend that would persist them is not built.',
  },

  // ── Trust you own ───────────────────────────────────────────────────────────
  {
    slug: 'repid',
    term: 'RepID',
    expansion: 'Reputation Identity',
    group: 'own',
    status: 'shipped',
    definition:
      'Portable, earned, weighted reputation for an agent. Earned by verified work rather than assigned; weighted so that substantive contributions move it and activity alone does not; portable because it is anchored on-chain rather than held by one platform.',
    note:
      'Scores are clamped to a fixed range and the tier is derived from the score by the database, never written by hand — so a tier can never drift from the number that earned it.',
    related: ['tier', 'purpose-gate', 'attestation'],
    deeper: { label: 'Portable earned trust on HyperDAG', href: `${HYPERDAG_GLOSSARY}#own` },
  },
  {
    slug: 'tier',
    term: 'Tier',
    group: 'own',
    status: 'shipped',
    definition:
      'A band derived from an agent\'s RepID: PROBATIONARY, EARNING, ESTABLISHED, AUTONOMOUS, VETERAN. Tiers gate what an agent may do without a human in the loop.',
    related: ['repid', 'authority-ceiling'],
  },
  {
    slug: 'grant',
    term: 'Grant',
    group: 'own',
    status: 'shipped',
    definition:
      'A scoped, budgeted, expiring permission from one principal to another — what an agent may do, up to what value, until when. Grants can be revoked, and revoking one cascades to everything delegated beneath it.',
    note:
      'Revocation is the part that makes a grant meaningful rather than decorative, and it is verified end-to-end against production.',
    related: ['authority-ceiling', 'agent'],
  },
  {
    slug: 'stake',
    term: 'Stake',
    group: 'own',
    status: 'shipped',
    definition:
      'Collateral an agent\'s owner posts to raise how much that agent may transact autonomously. Skin in the game, expressed as a number the system can check.',
    related: ['authority-ceiling', 'a-eff'],
  },
  {
    slug: 'authority-ceiling',
    term: 'Authority ceiling',
    group: 'own',
    status: 'approximate',
    definition:
      'The most an agent may commit on its own. Rises with both earned reputation and posted stake, on a curve that deliberately flattens so capital alone cannot buy unlimited authority.',
    related: ['a-eff', 'stake', 'tier'],
  },
  {
    slug: 'a-eff',
    term: 'A_eff',
    expansion: 'Effective authority',
    group: 'own',
    status: 'approximate',
    definition:
      'The computed authority ceiling actually applied to a decision — the lower of what reputation allows and what stake supports, and zero below a minimum standing.',
    note:
      'APPROXIMATE, and it can OVERSTATE. One input is passed through from the ledger rather than recomputed with decay applied, so an agent whose reputation has decayed unrecorded may show a ceiling higher than it has earned. Every result is stamped to say so.',
    related: ['authority-ceiling', 'approximate'],
  },

  // ── How we verify ───────────────────────────────────────────────────────────
  {
    slug: 'hal',
    term: 'HAL',
    expansion: 'Hallucination Assessment Layer',
    group: 'verify',
    status: 'shipped',
    definition:
      'The hallucination-detection engine. It scores a response for risk across several independent model families and returns PASS, FLAG (proceed with care) or VETO.',
    note: 'Scoring runs on our servers, not in your browser. There is no local inference path.',
    related: ['pythagorean-comma', 'sbfa'],
    deeper: { label: 'Honest AI terms on HyperDAG', href: `${HYPERDAG_GLOSSARY}#honest` },
  },
  {
    slug: 'measured',
    term: 'MEASURED',
    group: 'verify',
    status: 'concept',
    definition:
      'A named check ran, and it passed. Traceable back to that specific check. This is the only state that asserts something is true.',
    related: ['gaterun', 'not-checked', 'approximate', 'failed'],
  },
  {
    slug: 'approximate',
    term: 'APPROXIMATE',
    group: 'verify',
    status: 'concept',
    definition:
      'Measured — but against a documented stand-in rather than the real quantity. Always travels with the caveat that says which stand-in and in which direction it can be wrong.',
    related: ['measured', 'a-eff'],
  },
  {
    slug: 'not-checked',
    term: 'NOT_CHECKED',
    group: 'verify',
    status: 'concept',
    definition:
      'Nobody looked. It is not a warning and it is not a failure — it is an absence.',
    note:
      'Rendered neutral and colourless on purpose. Amber would assert that something is wrong, which is a claim nobody measured — the same error as a green tick asserting a success nobody measured, pointed the other way.',
    related: ['measured', 'failed'],
  },
  {
    slug: 'failed',
    term: 'FAILED',
    group: 'verify',
    status: 'concept',
    definition: 'A check ran and did not pass. Distinct from NOT_CHECKED, always.',
    note:
      'Keeping these four apart is the product. Collapse them into two and "we did not look" silently becomes "it passed" — which is the specific way trust software usually lies.',
    related: ['measured', 'not-checked'],
  },
  {
    slug: 'gaterun',
    term: 'GateRun',
    group: 'verify',
    status: 'shipped',
    definition:
      'One execution of a named check that produces one of the four states above. Nothing is allowed to claim MEASURED unless a GateRun produced it.',
    related: ['measured', 'not-checked'],
  },
  {
    slug: 'purpose-gate',
    term: 'Purpose gate',
    group: 'verify',
    status: 'shipped',
    definition:
      'The rule that reputation moves for substantive deliverables and not for activity. A pleasant conversational reply earns nothing.',
    note: 'Anti-theatre, and a direct answer to Goodhart\'s Law: the moment a count becomes the target, the count stops meaning anything.',
    related: ['repid'],
  },
  {
    slug: 'constitution',
    term: 'Constitution',
    group: 'verify',
    status: 'shipped',
    definition:
      'Rules an agent must satisfy before acting, so it can decline or escalate an unsafe or ungrounded action instead of performing it.',
    related: ['hal', 'agent'],
  },
  {
    slug: 'sbfa',
    term: 'SBFA',
    expansion: 'Stochastic Bias Fracture Array',
    group: 'verify',
    status: 'shipped',
    definition:
      'Using validators from deliberately different model families so they fail differently. Checkers that share training share blind spots, and agreement between them proves less than it appears to.',
    related: ['hal', 'pythagorean-comma'],
    deeper: { label: 'SBFA on HyperDAG', href: `${HYPERDAG_GLOSSARY}#honest` },
  },
  {
    slug: 'pythagorean-comma',
    term: 'Comma veto',
    expansion: 'Pythagorean Comma',
    group: 'verify',
    status: 'shipped',
    definition:
      'Treating suspiciously perfect agreement as a warning rather than a confirmation. Validators that agree too exactly are more likely to share a blind spot than to be right.',
    related: ['sbfa', 'hal'],
    deeper: { label: 'Comma veto on HyperDAG', href: `${HYPERDAG_GLOSSARY}#honest` },
  },
  {
    slug: 'sybil',
    term: 'Sybil resistance',
    group: 'verify',
    status: 'not-live',
    definition:
      'Stopping one actor from manufacturing many identities to vote up its own reputation. The open research problem underneath all portable reputation.',
    note: 'Named honestly as unsolved. We would rather recruit help on it than imply it is handled.',
    related: ['repid'],
  },

  // ── Privacy and proofs ──────────────────────────────────────────────────────
  {
    slug: 'zero-trust',
    term: 'Zero Trust',
    group: 'privacy',
    status: 'concept',
    definition:
      'Granting nothing on the basis of identity, position or assertion — every actor starts with none, and access follows verification rather than preceding it.',
    note:
      'Why it fits here: in a world of cheap deepfakes and synthetic agents, the ecosystem as a whole deserves no default trust. What TrustShell adds is the other half — trust that gets REVEALED by what an agent verifiably did, rather than granted because of what it claims to be.',
    related: ['glass-box', 'repid', 'measured'],
  },
  {
    slug: 'zkp',
    term: 'ZKP',
    expansion: 'Zero-Knowledge Proof',
    group: 'privacy',
    status: 'not-live',
    definition:
      'Proving a statement is true without revealing the data behind it — verification without surveillance.',
    note:
      'NOT LIVE HERE. The prover shipping today is a stub: it produces no real proof, and nothing on this site is currently protected by one. It is a contract surface waiting for the real implementation, and we label it rather than let it read as a feature.',
    related: ['plonky3', 'selective-disclosure'],
    deeper: { label: 'Privacy terms on HyperDAG', href: `${HYPERDAG_GLOSSARY}#privacy` },
  },
  {
    slug: 'plonky3',
    term: 'Plonky3',
    group: 'privacy',
    status: 'not-live',
    definition: 'The STARK proving system the ZKP design targets.',
    note: 'Named because it is the plan. Not running — see ZKP.',
    related: ['zkp'],
  },
  {
    slug: 'selective-disclosure',
    term: 'Selective disclosure',
    group: 'privacy',
    status: 'not-live',
    definition:
      'Revealing only the fact you need to prove rather than the whole document that contains it — proving you clear a threshold without showing the number.',
    related: ['zkp'],
    deeper: { label: 'Selective disclosure on HyperDAG', href: `${HYPERDAG_GLOSSARY}#privacy` },
  },
  {
    slug: 'self-sovereign',
    term: 'Self-sovereign identity',
    group: 'privacy',
    status: 'concept',
    definition:
      'Credentials you hold yourself rather than ones a platform holds about you — provable without asking the issuer for permission each time.',
    related: ['repid', 'zero-trust'],
  },
  {
    slug: 'glass-box',
    term: 'Glass box',
    group: 'privacy',
    status: 'concept',
    definition:
      'The opposite of a black box: the owner can see every decision their agent made and why. Transparent to you, opaque to everyone else.',
    note: 'Including transparency about limits — a glass box that hides what it has not measured is just a black box with better lighting.',
    related: ['zero-trust', 'not-checked'],
  },
  {
    slug: 'provenance',
    term: 'Provenance',
    group: 'privacy',
    status: 'shipped',
    definition:
      'A tamper-evident record of who did what, when, and under whose authority.',
    related: ['attestation', 'glass-box'],
  },

  // ── Protocol and payments ───────────────────────────────────────────────────
  {
    slug: 'hyperdag',
    term: 'HyperDAG Protocol',
    group: 'protocol',
    status: 'shipped',
    definition:
      'The umbrella protocol underneath TrustShell — composable primitives for agent identity, reputation, validation and payment, adopted only as needed.',
    deeper: { label: 'Full protocol glossary', href: HYPERDAG_GLOSSARY },
  },
  {
    slug: 'erc-8004',
    term: 'ERC-8004',
    group: 'protocol',
    status: 'shipped',
    definition:
      'The emerging Ethereum standard for AI-agent identity and reputation. RepID anchors to its registries.',
    note: 'On Base Sepolia testnet today.',
    related: ['repid', 'attestation'],
  },
  {
    slug: 'x402',
    term: 'x402',
    group: 'protocol',
    status: 'shipped',
    definition:
      'An HTTP-native payment standard for agent-to-agent micropayments, built on the long-dormant 402 Payment Required status code.',
    related: ['cascade'],
  },
  {
    slug: 'cascade',
    term: 'Cascade',
    group: 'protocol',
    status: 'shipped',
    definition:
      'The settlement-to-fulfilment pipeline: after payment, escrow moves to fulfilled and an on-chain reputation attestation is written — autonomously, and exactly once.',
    related: ['x402', 'attestation'],
  },
  {
    slug: 'attestation',
    term: 'Attestation',
    group: 'protocol',
    status: 'shipped',
    definition:
      'A signed statement that something happened, recorded so a third party can check it later without trusting the party that made it.',
    related: ['repid', 'provenance'],
  },
  {
    slug: 'trinity',
    term: 'Trinity Symphony',
    expansion: 'the Trinity 12',
    group: 'protocol',
    status: 'shipped',
    definition:
      'The reference 12-agent swarm built on HyperDAG — a live demonstration of the primitives, not the protocol itself.',
  },
];

/** Terms by slug, for first-use links elsewhere in the app. */
export const TERMS_BY_SLUG: Record<string, Term> = Object.fromEntries(
  TERMS.map((t) => [t.slug, t]),
);

export const STATUS_LABEL: Record<TermStatus, string> = {
  shipped: 'Shipped',
  approximate: 'Approximate',
  'not-live': 'Not live yet',
  concept: 'Concept',
};
