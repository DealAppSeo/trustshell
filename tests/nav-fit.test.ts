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

/**
 * Measured by the label budget, 2026-10-05, after the row shrank to four links
 * (Check, Add to your agent, Docs, Why). The long label is about 170px; the row
 * with the wordmark lands near 510px. md (768) clears that with more than 200px
 * to spare. The row stays hidden below md, which is every 390px phone.
 * Re-measure on a production build if a label grows, then update BREAKPOINT.
 */
const MEASURED_LINK_COUNT = 4;
const BREAKPOINT = 'md';

describe('top nav fits the viewport it appears in', () => {
  it('still has the number of links the breakpoint was measured against', () => {
    const links = SOURCE.match(/\{\s*href:\s*'/g)?.length ?? 0;
    expect(links).toBe(MEASURED_LINK_COUNT);
    // If this failed because you added or removed a link: four links were budgeted near 510px
    // and shown from md. Re-measure the rendered row and update MEASURED_LINK_COUNT and BREAKPOINT.
  });

  it('shows the desktop row only at the breakpoint wide enough to hold it', () => {
    expect(SOURCE).toContain(`hidden ${BREAKPOINT}:flex`);
    // sm would be one long rename away from the overflow this file exists to catch.
    expect(SOURCE).not.toContain('hidden sm:flex');
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
