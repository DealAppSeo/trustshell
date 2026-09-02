/**
 * THE JOURNEY ENDED ONE STEP BEFORE THE PRODUCT DID, AND NOTHING NOTICED.
 *
 * `app/bind/page.tsx` describes itself twice over as the end of the walkthrough — "the last
 * step of the journey", "the last thing the walkthrough asks of you". The step strip on
 * `/agents` ran to four and stopped at "Earn RepID". Two files, two different stories about
 * where the product finishes, and no check that could see the disagreement.
 *
 * Worse than the copy: `/agents` contained NO reference to bind or claim at all. It prints the
 * agent id — the one thing `/bind` needs — right there on every row, and offered no path to it.
 * With `HUMAN_AGENT_BIND_ENABLED` now on in production, the feature was reachable only by
 * someone who found the nav item and came back here to copy an id.
 *
 * This file is a TRIPWIRE, not a layout check — jest cannot lay anything out, same as
 * tests/nav-fit.test.ts. It reads the source and fails when the assumptions behind the fix
 * change, so the next person is told to look rather than silently reintroducing the gap.
 *
 * THE COLUMN-COUNT ASSERTION IS THE ONE THAT EARNS ITS PLACE. The strip is a grid at `sm` and
 * above with an explicit `sm:grid-cols-N`. Adding a step without changing N does not throw, does
 * not fail a type check, and does not overflow — the sixth card just wraps onto a second row
 * under the first four, which reads as a rendering bug and is invisible to every other test
 * here. Tying the two numbers together is the only thing that catches it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENTS = readFileSync(join(__dirname, '..', 'app', 'agents', 'page.tsx'), 'utf8');
const BIND = readFileSync(join(__dirname, '..', 'app', 'bind', 'page.tsx'), 'utf8');

/** Step objects in the journey strip: `{ n: 1, t: '…', d: '…' }`. */
const STEPS = Array.from(AGENTS.matchAll(/\{\s*n:\s*(\d+),\s*t:\s*'([^']+)'/g), (m) => ({
  n: Number(m[1]),
  title: m[2],
}));

describe('the agents page leads to the step that finishes the journey', () => {
  it('offers a path to claiming, from the page that shows the agent id', () => {
    // The whole defect in one assertion: this page had no reference to /bind of any kind.
    expect(AGENTS).toContain('href="/bind"');
  });

  it('still ends its journey where /bind says the journey ends', () => {
    // Not a proxy for the copy — /bind asserts this about itself, and the two drifted apart
    // once already. If /bind stops claiming to be the last step, this should be re-decided
    // rather than quietly left pointing at the wrong place.
    expect(BIND).toMatch(/last step of the journey/i);
    expect(STEPS.at(-1)?.title).toMatch(/claim/i);
  });

  it('numbers the steps consecutively from 1', () => {
    expect(STEPS.length).toBeGreaterThan(0);
    expect(STEPS.map((s) => s.n)).toEqual(STEPS.map((_, i) => i + 1));
  });
});

describe('the strip has a column for every step it renders', () => {
  it('matches sm:grid-cols-N to the number of steps', () => {
    const cols = AGENTS.match(/sm:grid-cols-(\d+)/);
    expect(cols).not.toBeNull();
    expect(Number(cols![1])).toBe(STEPS.length);
    // If this failed because you added or removed a step: change `sm:grid-cols-N` on the same
    // <ol> to match. A grid divides the width it is given, so the count cannot cause a page
    // overflow either way — the failure mode is a card wrapping onto a second row, which looks
    // like a bug and which no screenshot at one width would reliably show.
  });

  it('keeps the mobile strip a deliberate scroller, not a page overflow', () => {
    // Below `sm` the steps are a horizontal scroll strip by design. It scrolls inside its own
    // box, which is NOT the sideways-scrolling page defect measured on 2026-09-01 — and the
    // distinction is exactly what that fix turned on, so it is pinned rather than assumed.
    expect(AGENTS).toContain('overflow-x-auto');
    expect(AGENTS).toContain('sm:overflow-visible');
  });
});
