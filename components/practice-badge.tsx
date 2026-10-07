/**
 * PRACTICE (slice P1, Sean's GO 2026-10-07; docs/PRACTICE_LANE.md).
 *
 * Everyone starts on paper. Every value on a page that shows this is on the test network and is not
 * real money, and the badge sits in the same place on each such page, so a practice result is never
 * mistaken for a real one. tests/practice-label.test.ts fails if a page that shows a value drops it.
 */
export function PracticeBadge() {
  return (
    <p
      role="note"
      data-practice-badge
      className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
    >
      <span className="uppercase tracking-widest">Practice</span>
      <span className="font-normal text-amber-200/90">Test network (Base Sepolia). No real funds move here.</span>
    </p>
  );
}
