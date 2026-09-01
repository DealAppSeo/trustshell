/**
 * The three marks this flow needs, drawn rather than borrowed.
 *
 * One stroke weight (1.5), one 16-unit box, one cap style, so they read as a
 * set. `PendingMark` is achromatic on purpose: a step nobody has reached yet is
 * an absence, not a warning — the same reasoning that keeps NOT_CHECKED grey in
 * components/trust-state.tsx.
 */

const box = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function CheckMark() {
  return (
    <svg {...box} aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.5" stroke="#2dd4bf" strokeWidth={1.25} opacity={0.5} />
      <path d="M5.2 8.3 7.1 10.2 10.9 6" stroke="#5eead4" />
    </svg>
  );
}

export function PendingMark({ active = false }: { active?: boolean }) {
  return (
    <svg {...box} aria-hidden focusable="false" className={active ? 'mark-active' : undefined}>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke={active ? '#f6851b' : '#52525b'}
        strokeWidth={1.25}
        strokeDasharray={active ? '3 3' : undefined}
      />
    </svg>
  );
}

/** A hairline divider that belongs to the palette rather than the browser. */
export function Rule() {
  return <hr className="border-0 border-t border-[#1f1f23]" />;
}
