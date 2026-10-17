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

// 2026-10-16: /agents shows the shared six-step bar (components/journey-steps.tsx), the same one as
// /bind, /faucet, /stake and /spend, in place of its own five-step strip. One source for the path, so
// the two stories cannot drift apart again. The tripwires below read that one source.
const STRIP = readFileSync(join(__dirname, '..', 'components', 'journey-steps.tsx'), 'utf8');

/** Stages in the shared bar: `{ id: 'create', href: '/agents', label: 'Create', … }`. */
const STAGES = Array.from(STRIP.matchAll(/\{\s*id:\s*'([a-z]+)',\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'/g), (m) => ({
  id: m[1]!,
  href: m[2]!,
  label: m[3]!,
}));

describe('the agents page leads to the step that finishes the journey', () => {
  it('offers a path to claiming, from the page that shows the agent id', () => {
    // The whole defect in one assertion: this page had no reference to /bind of any kind.
    expect(AGENTS).toContain('href="/bind"');
  });

  it('shows the shared bar, with Create marked, and the bar reaches Claim on /bind', () => {
    expect(AGENTS).toContain('<JourneySteps current="create" />');
    expect(STAGES[0]).toEqual({ id: 'create', href: '/agents', label: 'Create' });
    expect(STAGES.find((s) => s.href === '/bind')?.label).toMatch(/claim/i);
    // /bind still calls itself the end of what the walkthrough ASKS of you: the claim is the last thing
    // that needs anything from the person. Fund, stake, trade and earn follow on the same bar.
    expect(BIND).toMatch(/last thing the walkthrough asks of you/i);
  });

  it('has exactly one map of the path on /agents', () => {
    // Two strips with different counts (five here, six on /bind) told one path two ways.
    expect(AGENTS).not.toMatch(/\{\s*n:\s*\d+,\s*t:\s*'/);
    expect(AGENTS.match(/<JourneySteps /g)).toHaveLength(1);
  });
});

describe('the strip has a column for every step it renders', () => {
  it('matches sm:grid-cols-N to the number of steps', () => {
    const cols = STRIP.match(/sm:grid-cols-(\d+)/);
    expect(cols).not.toBeNull();
    expect(Number(cols![1])).toBe(STAGES.length);
    // If this failed because you added or removed a step: change `sm:grid-cols-N` on the same
    // <ol> to match. A grid divides the width it is given, so the count cannot cause a page
    // overflow either way — the failure mode is a card wrapping onto a second row, which looks
    // like a bug and which no screenshot at one width would reliably show.
  });

  it('wraps the strip into columns on a phone instead of a scroller that cuts the cards off', () => {
    // Below `sm` the steps were a horizontal scroll strip, and on a 375px phone the visible edge
    // cut "Bring your own key on Connec…" (UX audit 2026-10-16, UX-33). A grid divides the width it
    // is given, so it cannot overflow the page either.
    expect(STRIP).toContain('grid grid-cols-3 gap-2 sm:grid-cols-6');
    expect(STRIP).not.toContain('overflow-x-auto');
    expect(STRIP).not.toMatch(/min-w-\[\d+rem\]/);
  });
});
