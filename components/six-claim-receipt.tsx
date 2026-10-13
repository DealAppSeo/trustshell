/**
 * six-claim-receipt.tsx — renders a trust receipt as SIX separate claims, never one badge.
 *
 * THE RULE THIS ENFORCES (glossary §v0.2.7): a receipt states six claims — Integrity,
 * Authenticity, Observation, Correctness, Authorization, Containment — each with its own status
 * and its own gaps, plus one top-level "what this does not establish" line. There is deliberately
 * NO single rollup verdict: a run can be authentic and contained yet incorrect, and a single green
 * badge would hide exactly that. So this component renders the six, and nothing that fuses them.
 *
 * EVERY VERDICT RENDERS THROUGH TrustBadge. VERIFIED maps to the site's MEASURED state (a named
 * check ran and passed — the glossary equates the two), NOT_CHECKED to the neutral, achromatic
 * absence state, and FAILED to the rose state. NOT_APPLICABLE is NOT a verdict — the claim does
 * not apply to this call — so it renders as a muted, clearly-non-green pill, never as a pass.
 *
 * Pure and server-renderable: no state, no effects, no client hooks.
 */
import { TrustBadge } from './trust-state';
import {
  CLAIM_QUESTION,
  CLAIM_TITLE,
  SIX_CLAIM_KEYS,
  type Claim,
  type ClaimStatus,
  type InTotoStatement,
  type SixClaims,
} from '@/lib/six-claims';

/**
 * The three claim statuses that ARE verdicts map onto the canonical TrustState. The value type is
 * narrowed to the three no-caveat states (never APPROXIMATE), so TrustBadge's discriminated union
 * accepts it without a caveat prop.
 */
const STATUS_TO_TRUST_STATE: Record<Exclude<ClaimStatus, 'NOT_APPLICABLE'>, 'MEASURED' | 'NOT_CHECKED' | 'FAILED'> = {
  VERIFIED: 'MEASURED',
  NOT_CHECKED: 'NOT_CHECKED',
  FAILED: 'FAILED',
};

function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  if (status === 'NOT_APPLICABLE') {
    // Not a verdict. Muted, achromatic, and explicitly "does not apply" — never a pass.
    return (
      <span
        data-status="NOT_APPLICABLE"
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#3f3f46] px-2 py-0.5 text-[11px] font-medium tracking-wide text-[#71717a]"
      >
        <span aria-hidden className="text-[#52525b]">—</span>
        Not applicable
      </span>
    );
  }
  return <span data-status={status}><TrustBadge state={STATUS_TO_TRUST_STATE[status]} /></span>;
}

function ClaimRow({ claimKey, claim }: { claimKey: keyof SixClaims; claim: Claim }) {
  return (
    <li
      data-testid={`claim-${claimKey}`}
      className="rounded-lg border border-border bg-card/40 p-4 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{CLAIM_TITLE[claimKey]}</h3>
          <p className="text-xs text-muted">{CLAIM_QUESTION[claimKey]}</p>
        </div>
        <span data-testid={`claim-status-${claimKey}`}>
          <ClaimStatusPill status={claim.status} />
        </span>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed">{claim.statement}</p>

      {claim.supports.length > 0 && (
        <ul className="text-xs text-muted leading-relaxed list-disc pl-4 space-y-0.5">
          {claim.supports.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      {claim.gaps.length > 0 && (
        <div data-testid={`claim-gaps-${claimKey}`} className="text-xs leading-relaxed text-[#a8b3c2]">
          <span className="font-medium text-muted">Does not establish: </span>
          {claim.gaps.join(' · ')}
        </div>
      )}
    </li>
  );
}

export function SixClaimReceipt({ statement }: { statement: InTotoStatement }) {
  const { claims, what_this_does_not_establish } = statement.predicate;
  const subject = statement.subject[0];
  const algo = subject ? Object.keys(subject.digest)[0] : undefined;
  const digest = subject && algo ? subject.digest[algo] : undefined;

  return (
    <section data-testid="six-claim-receipt" className="space-y-5">
      <header className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">Trust receipt — six claims</h2>
        <p data-testid="no-single-verdict" className="text-sm text-muted leading-relaxed max-w-2xl">
          There is no single verdict. This receipt makes six separate claims, each with its own
          status and its own gaps — read each. A record can be whole and authorized and still be
          wrong.
        </p>
        {digest && (
          <p className="text-[11px] font-mono text-[#71717a] break-all">
            {subject?.name} · {algo}:{digest}
          </p>
        )}
      </header>

      <ol data-testid="six-claim-list" className="space-y-3">
        {SIX_CLAIM_KEYS.map((key) => (
          <ClaimRow key={key} claimKey={key} claim={claims[key]} />
        ))}
      </ol>

      <div
        data-testid="does-not-establish"
        className="rounded-lg border border-dashed border-border bg-card/30 p-4 space-y-1.5"
      >
        <h3 className="text-sm font-semibold text-foreground">What this does not establish</h3>
        <ul className="text-sm text-muted leading-relaxed list-disc pl-4 space-y-1">
          {what_this_does_not_establish.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
