/**
 * THE NAV BREAKPOINT HAS TO MATCH THE NAV'S ACTUAL WIDTH, AND NOTHING WAS CHECKING THAT.
 *
 * The desktop link row appeared at `md` (768px) — a breakpoint chosen when the row held far
 * fewer links. By 2026-09-01 it held thirteen. MEASURED on a production build two ways: the
 * document stopped overflowing at 1110px when bisected, and the row measured against the bar's
 * content box wants 1126px. Either way, from 768px up it ran off the side and sideways-scrolled
 * every page in the app — 342px of overflow at 768px, across six pages.
 *
 * `lg` (1024px) is short on both figures. `xl` (1280px) is the first Tailwind step that clears
 * them, with 154px to spare — chosen over squeezing the links into `lg`, which measured 998px
 * and would have left 26px of slack, less than half a link.
 *
 * This file is a TRIPWIRE, not a layout check — jest cannot lay anything out. It reads the
 * component's source and fails when the assumptions behind that measurement change, so the next
 * person to add a nav link is told to re-measure instead of silently reintroducing the overflow.
 * The one thing it checks outright rather than by proxy is that the row, the toggle button and
 * the dropdown all switch at the SAME breakpoint: if they ever disagree, some width shows both
 * controls or neither, and that is invisible in any single-width screenshot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '..', 'components', 'top-nav.tsx'), 'utf8');

/** Measured 2026-09-01: 13 links need 1110–1126px, so the row may only appear at xl and above. */
const MEASURED_LINK_COUNT = 13;
const BREAKPOINT = 'xl';

describe('top nav fits the viewport it appears in', () => {
  it('still has the number of links the breakpoint was measured against', () => {
    const links = SOURCE.match(/\{\s*href:\s*'/g)?.length ?? 0;
    expect(links).toBe(MEASURED_LINK_COUNT);
    // If this failed because you added or removed a link: at 13 links the row needed ~1126px,
    // leaving 154px of slack under xl — roughly two more links. Re-measure the rendered row
    // (force it visible, bisect the viewport) and either keep xl, tighten the per-link padding,
    // or move the link into the dropdown — then update MEASURED_LINK_COUNT.
  });

  it('shows the desktop row only at the breakpoint wide enough to hold it', () => {
    expect(SOURCE).toContain(`hidden ${BREAKPOINT}:flex`);
    // md would put an 1110px-wide row into a 768px viewport, which is the bug this pins.
    expect(SOURCE).not.toContain('hidden md:flex');
  });

  it('switches the row, the toggle and the dropdown at one and the same breakpoint', () => {
    // Not a proxy: if these ever disagree there is a band of widths showing both the full row
    // and the hamburger, or neither, and no single-width screenshot would reveal it.
    const used = new Set(
      Array.from(SOURCE.matchAll(/\b(sm|md|lg|xl|2xl):(?:flex|hidden)\b/g), (m) => m[1]),
    );
    expect(Array.from(used)).toEqual([BREAKPOINT]);
  });
});
