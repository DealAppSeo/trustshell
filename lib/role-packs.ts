/**
 * Role packs — default grant shapes, NOT products.
 *
 * A "role" here is exactly two things: a name a human recognises, and a default set of
 * capabilities plus caveats to pre-fill a grant with. It is not a dashboard, not a separate
 * agent runtime, and not a new backend concept. Twelve roles must never become twelve apps —
 * that is the failure this file is written to prevent, so it deliberately holds data and no
 * behaviour.
 *
 * WHAT THESE MAP ONTO, AND WHAT IS STILL UNBUILT. `capabilities` and the spend cap are the
 * inputs a real grant mint already takes — `principal_grants` in repid-engine enforces
 * attenuation (child ⊆ parent), a spend cap measured against the grantor's A_eff, a required
 * positive TTL, and grantor revocation (G1–G7 in trinity-ecosystem's
 * `docs/policy/grants-authority.v0.md`). So a pack is a suggested starting point for that
 * mint, and every bound on it is enforced by the kernel, not by this table.
 *
 * NOTHING HERE GRANTS ANYTHING. Reading this file mints no grant and hands out no key. A pack
 * is applied only when a human issues a grant through the existing Grants surface, and the
 * keyless invariant still holds: an agent gets capabilities, never the user's provider keys.
 *
 * `spendCapUsd: 0` is the default and is meaningful — most roles should be able to do their
 * work without spending anything, and a role that cannot spend cannot be turned into a
 * money-loss bug by a prompt injection.
 */

export type RoleTier = 'c_level' | 'function';

export interface RolePack {
  id: string;
  label: string;
  tier: RoleTier;
  /** One line: what this role is FOR. If it needs a paragraph, it is two roles. */
  purpose: string;
  /** Capability strings to pre-fill the grant with. Attenuation is enforced by the kernel. */
  capabilities: readonly string[];
  /** Default spend ceiling in USD. Zero means: this role does its job without spending. */
  spendCapUsd: number;
  /** Why this shape and not a wider one — a default nobody can justify becomes a default. */
  rationale: string;
}

export const ROLE_PACKS: readonly RolePack[] = [
  // --- C-level -------------------------------------------------------------
  {
    id: 'pai',
    label: 'PAI / Chief of Staff',
    tier: 'c_level',
    purpose: 'Holds the constitution and goals; routes work to the other roles.',
    capabilities: ['read:*', 'write:goals', 'grant:issue'],
    spendCapUsd: 0,
    rationale:
      'Broad read so it can answer anything; narrow write; may issue grants but holds no ' +
      'root key and no spend of its own. Delegation is its job — spending is not.',
  },
  {
    id: 'cto',
    label: 'CTO',
    tier: 'c_level',
    purpose: 'Build, GateRuns, dogfood loops.',
    capabilities: ['read:repo', 'write:repo', 'run:tests', 'read:gaterun'],
    spendCapUsd: 0,
    rationale: 'Repo and test tools; explicitly no spend — a build role that can buy things is a blast radius.',
  },
  {
    id: 'cfo',
    label: 'CFO',
    tier: 'c_level',
    purpose: 'A_eff, collateral posture, x402 limits.',
    capabilities: ['read:authority', 'read:stake', 'read:payments'],
    spendCapUsd: 0,
    rationale:
      'Reads the money surfaces. Raising a limit is a grant a human issues, not something ' +
      'the finance role does to itself.',
  },
  {
    id: 'cmo',
    label: 'CMO',
    tier: 'c_level',
    purpose: 'Narrative, growth, public passport presentation.',
    capabilities: ['read:passport', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Publishing tools only. Ad spend is a separate, explicit grant.',
  },
  {
    id: 'coo',
    label: 'COO',
    tier: 'c_level',
    purpose: 'Loops, SLAs, handoffs between lanes.',
    capabilities: ['read:activity', 'read:gaterun', 'grant:revoke'],
    spendCapUsd: 0,
    rationale:
      'Can revoke on anomaly but not issue — the asymmetry is deliberate: stopping something ' +
      'should be cheaper than starting it.',
  },

  // --- Function roles ------------------------------------------------------
  {
    id: 'bizdev',
    label: 'BizDev / Partnerships',
    tier: 'function',
    purpose: 'Partner briefs, ecosystem outreach.',
    capabilities: ['read:passport', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Drafts and reads. Outreach that costs money needs its own grant.',
  },
  {
    id: 'researcher',
    label: 'Researcher / Data',
    tier: 'function',
    purpose: 'Evals, ablations, ecology metrics, experiment design.',
    capabilities: ['read:activity', 'read:gaterun', 'run:eval'],
    spendCapUsd: 0,
    rationale: 'Read-heavy by nature. Running an eval is not writing a result.',
  },
  {
    id: 'security',
    label: 'Security / Trust Officer',
    tier: 'function',
    purpose: 'Grant review, fail-closed audits.',
    capabilities: ['read:grants', 'read:activity', 'grant:revoke'],
    spendCapUsd: 0,
    rationale:
      'Revoke without issue, same asymmetry as COO. A security role that can mint authority ' +
      'is a privilege-escalation path wearing a helpful label.',
  },
  {
    id: 'legal',
    label: 'Legal / Compliance',
    tier: 'function',
    purpose: 'Policy drafts, disclosure language.',
    capabilities: ['read:policy', 'write:content'],
    spendCapUsd: 0,
    rationale:
      'Drafting only. This produces text for a human to review — it is not counsel, and the ' +
      'pack should never be widened into acting on its own drafts.',
  },
  {
    id: 'design',
    label: 'Design / UX',
    tier: 'function',
    purpose: 'Turns founder feedback into interface experiments.',
    capabilities: ['read:activity', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Reads what happened, writes proposals. Shipping a change is a repo grant.',
  },
  {
    id: 'content',
    label: 'Content / Narrative',
    tier: 'function',
    purpose: 'Docs, education, in-product explanation.',
    capabilities: ['read:passport', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Same shape as CMO at a lower altitude; kept separate so it can be granted alone.',
  },
  {
    id: 'customer',
    label: 'Customer / Success',
    tier: 'function',
    purpose: 'Onboarding scripts, first-user playbooks.',
    capabilities: ['read:activity', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Needs to see what users actually hit; needs no authority over them.',
  },
  {
    id: 'devrel',
    label: 'DevRel / Community',
    tier: 'function',
    purpose: 'Contributors, issues, external developers.',
    capabilities: ['read:repo', 'write:content'],
    spendCapUsd: 0,
    rationale: 'Reads the repo to answer questions; does not write to it.',
  },
  {
    id: 'red_team',
    label: 'Red Team',
    tier: 'function',
    purpose: 'Adversarial probing of the trust layer.',
    capabilities: ['read:activity', 'read:gaterun', 'run:probe'],
    spendCapUsd: 0,
    rationale:
      'Must be disjoint from the builder role — a red team that can also fix what it finds ' +
      'grades its own homework, which is the failure the whole cross-family design exists to ' +
      'avoid.',
  },
] as const;

export const rolePackById = (id: string): RolePack | undefined =>
  ROLE_PACKS.find((p) => p.id === id);
