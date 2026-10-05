/**
 * On a phone the form sits above two more screens. This stays at the bottom and
 * jumps back to the box. It does not submit: a tap must not spend a check.
 */
export function StickyCheck() {
  return (
    <a
      href="#claim"
      data-testid="sticky-check"
      className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3"
    >
      <span className="flex w-full items-center justify-center rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white">
        Check
      </span>
    </a>
  );
}
