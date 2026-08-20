/**
 * The canonical way this product renders a verdict.
 *
 * THE RULE THIS ENFORCES. `CLAUDE.md`: *"Three outcomes, never two. VERIFIED / NOT CHECKED /
 * FAILED. Two outcomes collapse 'we did not look' into 'it passed.'"* A UI is where that
 * discipline is most easily lost — a green tick is the cheapest way to turn an unmeasured
 * thing into a claim. Every verdict in this app renders through this component so the
 * collapse cannot happen in one forgotten corner.
 *
 * WHY NOT_CHECKED IS NEUTRAL, NOT AMBER. This is the load-bearing call. Amber reads as
 * "caution — something is wrong", which asserts a failure nobody measured, exactly as a green
 * tick asserts a success nobody measured. Both are the same error pointed in opposite
 * directions. Neutral and achromatic is the only treatment that implies neither: it renders
 * as an ABSENCE, which is what it is. XC is adversarially reviewing this decision
 * (trinity-ecosystem#122) with the counter-argument stated — that an unmeasured
 * high-value_at_risk action IS a hazard and inert styling trains people to scroll past it. If
 * XC shows the call is wrong, this component changes and every surface changes with it. That
 * is the reason the treatment lives in one file.
 *
 * NEVER COLOUR-ONLY. Every state carries an icon AND a word. The triad is teal / neutral /
 * rose with no red-green pair anywhere, and the shapes differ (solid check, dashed ring, solid
 * slash) so the states survive greyscale and monochrome printing as well as colour-vision
 * deficiency.
 *
 * `APPROXIMATE` is the fourth state, and it exists because of a real gap. repid-engine cannot
 * compute the true sigma-adjusted `R_route`; it passes the ledger value and stamps every
 * result `rRouteIsLedgerApproximation: true`. Its own header says the consequence: such a
 * result is "MEASURED against this conservative-in-name-only proxy, and explicitly NOT
 * MEASURED against the true locked formula." That is neither MEASURED nor NOT_CHECKED, and
 * rendering it as either would be the quietly false badge. It is teal-adjacent but visibly
 * qualified, and it REQUIRES a caveat — see the invariant in the component below.
 */

export type TrustState = 'MEASURED' | 'APPROXIMATE' | 'NOT_CHECKED' | 'FAILED';

interface StateStyle {
  label: string;
  /** Border, text and (where used) dot colour. */
  className: string;
  dashed: boolean;
}

const STATE_STYLE: Record<TrustState, StateStyle> = {
  MEASURED: {
    label: 'Measured',
    className: 'border-[#2dd4bf]/45 text-[#5eead4] bg-[#2dd4bf]/8',
    dashed: false,
  },
  APPROXIMATE: {
    label: 'Measured (approximation)',
    className: 'border-[#2dd4bf]/30 text-[#99f6e4]/85 bg-transparent',
    dashed: true,
  },
  NOT_CHECKED: {
    // Deliberately achromatic. An absence of measurement is not a warning.
    label: 'Not checked',
    className: 'border-[#8b97a8]/45 text-[#a8b3c2] bg-transparent',
    dashed: true,
  },
  FAILED: {
    label: 'Failed',
    className: 'border-[#fb7185]/50 text-[#fda4af] bg-[#fb7185]/8',
    dashed: false,
  },
};

function StateIcon({ state }: { state: TrustState }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 12 12',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    'aria-hidden': true as const,
    className: 'shrink-0',
  };

  if (state === 'MEASURED') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="5" />
        <path d="M3.6 6.2 5.3 7.9 8.5 4.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'APPROXIMATE') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="5" strokeDasharray="2.2 1.8" />
        <path d="M3.6 6.6 5.3 8.1 8.5 4.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'FAILED') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="5" />
        <path d="M4 8 8 4" strokeLinecap="round" />
      </svg>
    );
  }
  // NOT_CHECKED — a hollow dashed ring. Nothing inside it, because nothing was measured.
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="5" strokeDasharray="2.2 1.8" />
    </svg>
  );
}

/**
 * @param caveat Required when state is APPROXIMATE — that state exists precisely to carry the
 *   qualification, so rendering it bare would defeat its purpose. TypeScript enforces this via
 *   the discriminated union below rather than leaving it to reviewer memory.
 * @param detail For FAILED, the reason. A bare "Failed" is not actionable.
 */
type TrustBadgeProps =
  | { state: 'APPROXIMATE'; caveat: string; detail?: string; className?: string }
  | { state: 'MEASURED' | 'NOT_CHECKED' | 'FAILED'; caveat?: never; detail?: string; className?: string };

export function TrustBadge(props: TrustBadgeProps) {
  const { state, detail, className = '' } = props;
  const style = STATE_STYLE[state];

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide ${
          style.dashed ? 'border-dashed' : ''
        } ${style.className}`}
      >
        <StateIcon state={state} />
        {style.label}
      </span>

      {/* The caveat is not decoration — APPROXIMATE is meaningless without it. */}
      {state === 'APPROXIMATE' && (
        <span className="text-[11px] leading-snug text-[#8b97a8]">{props.caveat}</span>
      )}
      {detail && <span className="text-[11px] leading-snug text-[#8b97a8]">{detail}</span>}
    </span>
  );
}

/**
 * The absence state for a whole panel, as opposed to one verdict. Says what is absent and what
 * would change it — an empty box that only says "nothing here" makes the reader guess whether
 * that is normal.
 */
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#1e293b] px-4 py-6 text-center">
      <p className="text-sm text-[#a8b3c2]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{detail}</p>
    </div>
  );
}

/**
 * Loading placeholder. Deliberately a skeleton and not a spinner over existing content: a
 * spinner leaves the previous value on screen, which is how a stale reading gets mistaken for
 * a current one.
 */
export function LoadingRows({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-[#1e293b]/60" />
      ))}
    </div>
  );
}
