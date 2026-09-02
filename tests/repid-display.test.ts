/**
 * NO SURFACE RENDERS A RepID WITHOUT THE REASON IT CAN BE BELIEVED.
 *
 * XC's standing brief, verbatim: *"No surface may show a stale number as if it were current.
 * Every panel that renders a number renders one of three states — LIVE / NOT CHECKED / FAILED.
 * A dash that means 'we did not look' is a lie and is treated as a defect here."*
 *
 * Both surfaces that show a RepID broke that rule in the same way and were fixed separately, so
 * this pins the rule rather than either fix:
 *
 *   /agents  showed `Prompts: 3` and no score at all — the page that lists the things earning
 *            RepID never displayed it.
 *   /run     showed `{(repid || 0).toFixed(2)}` fed by a fetch whose `.catch(() => {})`
 *            swallowed every failure. In flight, fetch failed, and agent-unknown-to-the-engine
 *            all rendered **0.00** on the one page where a person watches their score.
 *
 * ZERO IS THE DANGEROUS DEFAULT, and that is why the assertion targets it specifically. `0` is a
 * plausible RepID, so it raises no suspicion; it renders in the right font, in the right box,
 * and says the agent earned nothing through its conduct. Every other placeholder — a dash, an
 * empty string, NaN — at least looks wrong. `|| 0` is the idiom that turns "we could not look"
 * into a claim about honesty, so it is the one spelled out here.
 *
 * A TRIPWIRE, NOT A RENDER TEST — jest cannot lay anything out, same as tests/nav-fit.test.ts
 * and tests/agents-journey.test.ts. It reads the source of the surfaces that display the number.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/**
 * Comments stripped before scanning, and the first draft of this file proves why.
 *
 * Both fixes carry doc comments quoting the defect they removed — `{(repid || 0).toFixed(2)}`
 * and `.catch(() => {})` are written out verbatim so the next reader knows what was wrong. A
 * scanner that reads raw source therefore fails on the EXPLANATION of the fix, forever, and the
 * only ways to make it pass are to delete the explanation or weaken the assertion. Both are
 * worse than the test.
 *
 * A source-scanning tripwire that cannot tell code from prose is not checking what it claims
 * to check. This is crude — it does not parse — but it removes the one thing that reliably
 * produces false results here.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments, including the JSX {/* … */} bodies
    .replace(/^\s*\/\/.*$/gm, ' ');       // line comments
}

/** Every surface that puts a RepID figure in front of a person. Add one here when you add one. */
const SURFACES = [
  { name: '/agents', file: join(ROOT, 'app', 'agents', 'page.tsx') },
  { name: '/run/[agentId]', file: join(ROOT, 'app', 'run', '[agentId]', 'page.tsx') },
] as const;

describe.each(SURFACES)('$name renders its score through the shared lookup', ({ file }) => {
  const src = code(file);

  it('reads the score through the shared lookup, not a private fetch', () => {
    // One source of truth. Before this, /run fetched `/agents/:id` → `repid_score` while
    // /agents fetched `/agents/:id/card` → `repid`: two endpoints and two field names for one
    // number, which is how they drift apart without anyone noticing. Either the lib or the
    // component that wraps it counts — both route to the same place; a private fetch does not.
    expect(src).toMatch(/from '@\/(lib\/agent-repid|components\/agent-repid)'/);
  });

  it('never falls back to a bare zero', () => {
    // `(repid || 0).toFixed(2)` — the exact idiom that shipped. `0` is a plausible score, so
    // unlike every other placeholder it does not look wrong to anyone.
    expect(src).not.toMatch(/\|\|\s*0\s*\)\s*\.toFixed/);
  });

  it('carries a verdict beside the figure', () => {
    // A number with no state is the defect, whichever surface it appears on.
    expect(src).toMatch(/TrustBadge|AgentRepId/);
  });
});

describe('a failed lookup is not silent', () => {
  const run = code(SURFACES[1].file);

  it('no longer swallows the score fetch with an empty catch', () => {
    // `.catch(() => {})` is what made the 0.00 silent: the failure had nowhere to surface, so
    // the page kept its initial state and displayed it as though it were measured.
    expect(run).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  });

  it('still reports what a scored run earned even with no baseline', () => {
    // The delta is measured independently of the total. Losing it when the total is unknown
    // would throw away a real measurement to avoid showing an unreal one — over-correcting into
    // the opposite error.
    expect(run).toMatch(/flashDelta\(/);
  });
});
